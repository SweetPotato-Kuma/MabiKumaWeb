/**
 * 경매장 시세 기록.
 *
 * 경매장 거래 내역 API 는 최근 1시간만 돌려준다. 그것만으로는 "어제 얼마에 팔렸나" 도, 한 달
 * 그래프도 그릴 수 없다. 그래서 워커가 10분마다(wrangler.toml 의 crons) 거래 내역을 받아 D1 에
 * 쌓고, 화면은 여기서 아이템별로 읽는다.
 *
 *   MARKET             (D1 바인딩, 필수) 거래 원본(trades), 하루 요약(daily), 수집 상태(meta)
 *   MARKET_RATE_LIMIT  (Rate limiting 바인딩, 선택) 있으면 시세 조회 횟수를 제한한다
 *
 * 표 모양은 migrations/0001_market.sql 에 있다.
 *
 * 받는 쪽은 새것부터 거꾸로 내려가며 지난번에 받은 곳을 조금 지나칠 때까지 읽는다. 같은 거래는
 * 거래 번호가 같아 두 번 들어가지 않는다. 중간에 실패하면 "마지막으로 받은 시각" 을 옮기지 않아
 * 다음 번에 그 자리부터 다시 채운다. 1시간 넘게 멈췄던 구간은 API 에 더는 없으므로 비어 있다.
 */

const NEXON_HISTORY_URL = 'https://open.api.nexon.com/mabinogi/v1/auction/history';

export const MARKET_ITEM_PATH = '/market/item';
export const MARKET_RECENT_PATH = '/market/recent';
export const MARKET_OPTION_TRADES_PATH = '/market/option-trades';
export const MARKET_COLLECT_PATH = '/market/collect';

const KST_OFFSET_SECONDS = 9 * 3600;
const DAY_SECONDS = 86400;

/** 거래 원본을 두는 날 수. 그래프는 하루 요약으로 그리므로 원본은 이만큼이면 된다. */
export const RAW_DAYS = 90;

/**
 * 지난번에 받은 곳보다 이만큼 더 내려가 읽는다. 거래가 API 에 조금 늦게 올라오는 경우를
 * 놓치지 않으려는 것이다. 이미 받은 것은 거래 번호로 걸러지므로 겹쳐 읽어도 두 번 들어가지 않는다.
 */
const OVERLAP_SECONDS = 10 * 60;

/** 한 번에 읽을 쪽 수. 한 쪽이 500건이고 붐비는 시간 1시간치가 15쪽 남짓이다. */
const MAX_PAGES = 25;

/** 한 문장에 넣을 거래 수. 값은 JSON 한 덩어리로 넘긴다. D1 은 바인딩 값 개수에 상한이 있다. */
const INSERT_CHUNK = 500;

/** 한 번에 지울 오래된 거래 수. 10분마다 이만큼씩이면 하루 쌓이는 양(약 15만)을 넉넉히 따라간다. */
const PURGE_LIMIT = 5000;

/** 한 번에 물을 수 있는 아이템 수. 경매장 한 쪽의 줄 수보다 조금 넉넉하게 둔다. */
export const RECENT_MAX_NAMES = 60;

/** 그래프 기본 날 수와 상한. */
const SERIES_DAYS = 30;
const SERIES_MAX_DAYS = 365;

/**
 * 시간별 그래프의 칸 수. 지금 시각을 포함해 최근 7일(168시간)이다. 한 주를 통째로 보여야
 * 공급이 몰리는 목요일과 다른 요일을 견줄 수 있다. 원본(trades)에서 바로 센다.
 */
export const HOURLY_HOURS = 7 * 24;
const HOUR_SECONDS = 3600;

const NAME_MAX = 120;

/** 같은 질문은 이 시간 동안 엣지 캐시에서 답한다. 수집이 10분마다라 더 자주 볼 이유가 없다. */
const CACHE_SECONDS = 300;

/**
 * 한 아이템의 옵션 문장마다 가장 최근 거래. 옵션 종류(type) 한 가지만 본다.
 *
 * 무리아스의 유물은 스킬 옵션 한 줄의 문장이 수치까지 담고 있어("오버 드라이브 폭발 공격 대미지
 * 490% 증가 (최대 700%)") 문장이 같으면 같은 옵션, 같은 레벨이다. 그래서 문장으로 묶어 가장 최근
 * 거래 하나씩만 돌려준다. 지금 매물이 없는 레벨에도 마지막으로 얼마에 팔렸는지 보여 주려는 것이다.
 * 거래 원본은 RAW_DAYS 만 있으므로 그보다 오래 거래가 없던 문장은 빠진다.
 */
const OPTION_TRADES_SQL = `WITH picked AS (
  SELECT t.id, t.ts, t.price, json_extract(o.value, '$[2]') AS text
  FROM trades t, json_each(t.options) o
  WHERE t.name = ?1 AND json_extract(o.value, '$[0]') = ?2
), ranked AS (
  SELECT text, price, ts, ROW_NUMBER() OVER (PARTITION BY text ORDER BY ts DESC, id DESC) AS rn
  FROM picked
  WHERE text IS NOT NULL
)
SELECT text, price, ts FROM ranked WHERE rn = 1 ORDER BY text`;

/** 한국 시각 기준 날짜 번호. 1970-01-01 이 0 이다. */
export function kstDay(ts) {
  return Math.floor((ts + KST_OFFSET_SECONDS) / DAY_SECONDS);
}

function dayStart(day) {
  return day * DAY_SECONDS - KST_OFFSET_SECONDS;
}

/** 한국 시각 기준 시간 번호. 1970-01-01 00시가 0 이다. */
export function kstHour(ts) {
  return Math.floor((ts + KST_OFFSET_SECONDS) / HOUR_SECONDS);
}

/** 날짜 번호를 "2026-09-25" 로. */
export function dayLabel(day) {
  return new Date(day * DAY_SECONDS * 1000).toISOString().slice(0, 10);
}

/** 옵션을 [종류, 세부, 값, 값2, 설명] 배열로 줄인다. 끝의 빈 칸은 뗀다. 원래 모양의 3분의 1이다. */
export function compactOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  const rows = options.map((option) => {
    const row = [
      option?.option_type ?? null,
      option?.option_sub_type ?? null,
      option?.option_value ?? null,
      option?.option_value2 ?? null,
      option?.option_desc ?? null,
    ];
    while (row.length > 0 && row[row.length - 1] === null) row.pop();
    return row;
  });
  return JSON.stringify(rows);
}

/** 거래 한 건을 표의 한 줄로. 읽을 수 없는 것은 null. */
export function toTradeRow(trade) {
  const id = String(trade?.auction_buy_id ?? '');
  if (!/^\d{1,15}$/.test(id)) return null;
  const ts = Math.floor(Date.parse(trade.date_auction_buy) / 1000);
  if (!Number.isFinite(ts)) return null;
  const name = String(trade.item_name ?? '')
    .trim()
    .slice(0, NAME_MAX);
  if (!name) return null;
  const count = Number(trade.item_count);
  const price = Number(trade.auction_price_per_unit);
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  if (!Number.isSafeInteger(price) || price < 0) return null;
  const displayRaw = String(trade.item_display_name ?? '')
    .trim()
    .slice(0, NAME_MAX);
  return [
    Number(id),
    ts,
    name,
    displayRaw && displayRaw !== name ? displayRaw : null,
    String(trade.auction_item_category ?? '').slice(0, NAME_MAX),
    count,
    price,
    compactOptions(trade.item_option),
  ];
}

const INSERT_SQL = `INSERT OR IGNORE INTO trades (id, ts, name, display, category, count, price, options)
SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
  json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'),
  json_extract(value, '$[6]'), json_extract(value, '$[7]')
FROM json_each(?1)`;

/**
 * 아이템 여럿의 기간 통계. 중위는 거래 건수 기준이다(묶음 크기로 가중하지 않는다).
 * 평균은 수량으로 가중한다. 둘이 다르게 움직이는 것 자체가 정보다.
 */
const STATS_SQL = `WITH picked AS (
  SELECT name, category, ts, count, price,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY price) AS rn,
    COUNT(*) OVER (PARTITION BY name) AS c
  FROM trades
  WHERE name IN (SELECT value FROM json_each(?1)) AND ts >= ?2 AND ts < ?3
)
SELECT name, MAX(category) AS category, COUNT(*) AS n, SUM(count) AS qty,
  SUM(count * price) AS total, MIN(price) AS lo, MAX(price) AS hi, MAX(ts) AS last,
  CAST(ROUND(AVG(CASE WHEN rn IN ((c + 1) / 2, (c + 2) / 2) THEN price END)) AS INTEGER) AS mid
FROM picked
GROUP BY name`;

/**
 * 아이템 하나의 시간별 통계. 시간은 한국 시각 기준 번호(kstHour)다. 셈은 STATS_SQL 과 같다.
 * 원본에서 바로 센다. 7일치여도 붐비는 아이템이 수천 건이라 (name, ts) 색인으로 충분하다.
 */
const HOURLY_SQL = `WITH picked AS (
  SELECT (ts + ${KST_OFFSET_SECONDS}) / ${HOUR_SECONDS} AS h, count, price,
    ROW_NUMBER() OVER (PARTITION BY (ts + ${KST_OFFSET_SECONDS}) / ${HOUR_SECONDS} ORDER BY price) AS rn,
    COUNT(*) OVER (PARTITION BY (ts + ${KST_OFFSET_SECONDS}) / ${HOUR_SECONDS}) AS c
  FROM trades
  WHERE name = ?1 AND ts >= ?2 AND ts < ?3
)
SELECT h, COUNT(*) AS n, SUM(count) AS qty, SUM(count * price) AS total, MIN(price) AS lo,
  MAX(price) AS hi,
  CAST(ROUND(AVG(CASE WHEN rn IN ((c + 1) / 2, (c + 2) / 2) THEN price END)) AS INTEGER) AS mid
FROM picked
GROUP BY h
ORDER BY h`;

const DAILY_SQL = `INSERT OR REPLACE INTO daily (name, day, category, n, qty, total, lo, hi, mid)
SELECT name, ?4, category, n, qty, total, lo, hi, mid FROM (${STATS_SQL})`;

async function readMeta(db, key) {
  const row = await db.prepare('SELECT value FROM meta WHERE key = ?1').bind(key).first();
  return row?.value ?? null;
}

function writeMeta(db, key, value) {
  return db
    .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)')
    .bind(key, String(value));
}

async function fetchHistoryPage(env, cursor) {
  const url = new URL(NEXON_HISTORY_URL);
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json', 'x-nxopen-api-key': env.NEXON_API_KEY },
  });
  if (!response.ok) throw new Error(`거래 내역 HTTP ${response.status}`);
  return response.json();
}

/**
 * 새 거래를 받아 넣고, 들어온 아이템의 하루 요약을 다시 계산하고, 오래된 원본을 조금 지운다.
 * 크론이 부르고, 운영자가 손으로 부를 수도 있다(POST /market/collect).
 */
export async function collectTrades(env, now = Date.now()) {
  const db = env.MARKET;
  if (!db) return { skipped: 'MARKET 바인딩이 없습니다.' };
  if (!env.NEXON_API_KEY) return { skipped: 'NEXON_API_KEY 가 없습니다.' };

  const lastTs = Number(await readMeta(db, 'last_ts')) || 0;
  const stopBefore = lastTs ? lastTs - OVERLAP_SECONDS : 0;

  const rows = [];
  let pages = 0;
  let complete = false;
  let error = null;
  let cursor = '';
  try {
    while (pages < MAX_PAGES) {
      const page = await fetchHistoryPage(env, cursor);
      pages += 1;
      const list = Array.isArray(page?.auction_history) ? page.auction_history : [];
      for (const trade of list) {
        const row = toTradeRow(trade);
        if (row) rows.push(row);
      }
      const oldest = Math.floor(Date.parse(list[list.length - 1]?.date_auction_buy) / 1000);
      if (list.length === 0 || !page.next_cursor || (stopBefore && oldest < stopBefore)) {
        complete = true;
        break;
      }
      cursor = page.next_cursor;
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  let inserted = 0;
  if (rows.length > 0) {
    const statements = [];
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      statements.push(db.prepare(INSERT_SQL).bind(JSON.stringify(rows.slice(i, i + INSERT_CHUNK))));
    }
    const results = await db.batch(statements);
    inserted = results.reduce((sum, result) => sum + (result?.meta?.changes ?? 0), 0);
  }

  const followUps = [];

  // 새로 들어온 것이 있을 때만 그날 요약을 다시 센다. 날이 바뀌는 때는 이틀 몫이 된다.
  if (inserted > 0) {
    const namesByDay = new Map();
    for (const row of rows) {
      const day = kstDay(row[1]);
      if (!namesByDay.has(day)) namesByDay.set(day, new Set());
      namesByDay.get(day).add(row[2]);
    }
    for (const [day, names] of namesByDay) {
      followUps.push(
        db
          .prepare(DAILY_SQL)
          .bind(JSON.stringify([...names]), dayStart(day), dayStart(day + 1), day),
      );
    }
  }

  const newest = rows.reduce((max, row) => Math.max(max, row[1]), 0);
  // 끝까지 읽었을 때만 받은 곳을 옮긴다. 처음 받을 때는 옮길 곳이 따로 없으니 그냥 적는다.
  if (newest > lastTs && (complete || !lastTs)) followUps.push(writeMeta(db, 'last_ts', newest));
  if (rows.length > 0 && !(await readMeta(db, 'started'))) {
    const oldest = rows.reduce((min, row) => Math.min(min, row[1]), Infinity);
    followUps.push(writeMeta(db, 'started', oldest));
  }
  followUps.push(writeMeta(db, 'collected_at', new Date(now).toISOString()));

  const cutoff = Math.floor(now / 1000) - RAW_DAYS * DAY_SECONDS;
  followUps.push(
    db
      .prepare(
        'DELETE FROM trades WHERE id IN (SELECT id FROM trades WHERE ts < ?1 ORDER BY ts LIMIT ?2)',
      )
      .bind(cutoff, PURGE_LIMIT),
  );

  await db.batch(followUps);

  return { pages, fetched: rows.length, inserted, complete, error };
}

function summarize(row) {
  return {
    n: row.n,
    qty: row.qty,
    lo: row.lo,
    hi: row.hi,
    mid: row.mid,
    avg: row.qty > 0 ? Math.round(row.total / row.qty) : 0,
  };
}

/** 최근 24시간 통계. 이름마다 한 칸이고 거래가 없던 이름은 빠진다. */
export async function recentStats(db, names, now = Date.now()) {
  const end = Math.floor(now / 1000) + 1;
  const { results } = await db
    .prepare(STATS_SQL)
    .bind(JSON.stringify(names), end - 1 - DAY_SECONDS, end)
    .all();
  const stats = {};
  for (const row of results ?? []) {
    stats[row.name] = { ...summarize(row), last: new Date(row.last * 1000).toISOString() };
  }
  return stats;
}

/** 하루 요약 목록. 오늘을 포함해 days 일, 오래된 날부터. 거래가 없던 날은 빠진다. */
export async function dailySeries(db, name, days, now = Date.now()) {
  const today = kstDay(Math.floor(now / 1000));
  const { results } = await db
    .prepare(
      'SELECT day, n, qty, total, lo, hi, mid FROM daily WHERE name = ?1 AND day > ?2 ORDER BY day',
    )
    .bind(name, today - days)
    .all();
  return (results ?? []).map((row) => ({ date: dayLabel(row.day), ...summarize(row) }));
}

/**
 * 시간별 요약 목록. 지금 시각이 든 시간을 끝으로 hours 칸, 오래된 시간부터. 거래가 없던 시간은 빠진다.
 * 칸마다 한국 시각 날짜와 시(0~23)를 붙인다. 요일과 날 경계는 화면이 날짜로 가른다.
 */
export async function hourlySeries(db, name, hours = HOURLY_HOURS, now = Date.now()) {
  const current = kstHour(Math.floor(now / 1000));
  const first = current - hours + 1;
  const start = first * HOUR_SECONDS - KST_OFFSET_SECONDS;
  const end = (current + 1) * HOUR_SECONDS - KST_OFFSET_SECONDS;
  const { results } = await db.prepare(HOURLY_SQL).bind(name, start, end).all();
  return (results ?? []).map((row) => ({
    date: dayLabel(Math.floor(row.h / 24)),
    hour: row.h % 24,
    ...summarize(row),
  }));
}

async function collectionInfo(db) {
  const { results } = await db
    .prepare("SELECT key, value FROM meta WHERE key IN ('started', 'collected_at')")
    .all();
  const meta = Object.fromEntries((results ?? []).map((row) => [row.key, row.value]));
  return {
    since: meta.started ? dayLabel(kstDay(Number(meta.started))) : null,
    updated: meta.collected_at ?? null,
  };
}

function jsonResponse(body, cors, extra = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
      ...extra,
    },
  });
}

function marketError(name, message, status, cors) {
  return new Response(JSON.stringify({ error: { name, message } }), {
    status,
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * 엣지 캐시. 같은 아이템을 여럿이 보면 D1 까지 한 번만 간다.
 * 응답에 붙는 CORS 헤더는 부른 쪽마다 다르므로 본문만 담아 두고 헤더는 나갈 때 붙인다.
 */
async function withEdgeCache(cacheKey, compute) {
  const cache = typeof globalThis.caches === 'undefined' ? null : globalThis.caches.default;
  const request = new Request(cacheKey);
  if (cache) {
    const hit = await cache.match(request);
    if (hit) return { body: await hit.text(), hit: true };
  }
  const body = JSON.stringify(await compute());
  if (cache) {
    await cache.put(
      request,
      new Response(body, { headers: { 'cache-control': `public, max-age=${CACHE_SECONDS}` } }),
    );
  }
  return { body, hit: false };
}

async function rateLimited(request, env) {
  if (!env.MARKET_RATE_LIMIT) return false;
  const key = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.MARKET_RATE_LIMIT.limit({ key });
  return !success;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cleanName(value) {
  return String(value ?? '')
    .trim()
    .slice(0, NAME_MAX);
}

/** GET /market/item?name=...&days=30 → 최근 1일 통계, 날짜별 요약, 최근 7일 시간별 요약. 아이템 정보의 그래프가 쓴다. */
export async function marketItem(request, url, env, cors, now = Date.now()) {
  if (!env.MARKET)
    return marketError('MARKET_NOT_CONFIGURED', '시세 기록이 아직 없습니다.', 503, cors);
  const name = cleanName(url.searchParams.get('name'));
  if (!name) return marketError('MARKET_NAME_REQUIRED', '아이템 이름이 없습니다.', 400, cors);
  const requested = Number(url.searchParams.get('days'));
  const days =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, SERIES_MAX_DAYS)
      : SERIES_DAYS;

  if (await rateLimited(request, env)) {
    return marketError('MARKET_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }

  // v2: 시간별 요약이 붙었다. 예전 모양으로 캐시된 답을 내주지 않게 키를 바꾼다.
  const cacheKey = `https://market.cache${MARKET_ITEM_PATH}?v=2&name=${encodeURIComponent(name)}&days=${days}`;
  const { body, hit } = await withEdgeCache(cacheKey, async () => {
    const [recent, daily, hourly, info] = await Promise.all([
      recentStats(env.MARKET, [name], now),
      dailySeries(env.MARKET, name, days, now),
      hourlySeries(env.MARKET, name, HOURLY_HOURS, now),
      collectionInfo(env.MARKET),
    ]);
    return { name, days, recent: recent[name] ?? null, daily, hourly, ...info };
  });
  return new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
      'x-market-cache': hit ? 'hit' : 'miss',
    },
  });
}

/** POST /market/recent { names } → 이름마다 최근 1일 통계. 경매장 목록의 줄마다 붙는다. */
export async function marketRecent(request, env, cors, now = Date.now()) {
  if (!env.MARKET)
    return marketError('MARKET_NOT_CONFIGURED', '시세 기록이 아직 없습니다.', 503, cors);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return marketError('MARKET_INVALID_BODY', '보낸 내용을 읽지 못했습니다.', 400, cors);
  }
  const names = [...new Set((Array.isArray(payload?.names) ? payload.names : []).map(cleanName))]
    .filter(Boolean)
    .sort();
  if (names.length === 0)
    return marketError('MARKET_NAME_REQUIRED', '아이템 이름이 없습니다.', 400, cors);
  if (names.length > RECENT_MAX_NAMES) {
    return marketError(
      'MARKET_TOO_MANY_NAMES',
      `한 번에 ${RECENT_MAX_NAMES}개까지 물을 수 있습니다.`,
      400,
      cors,
    );
  }

  if (await rateLimited(request, env)) {
    return marketError('MARKET_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }

  // 이름 60개를 주소에 그대로 실으면 너무 길어진다. 정렬한 목록의 해시로 가른다.
  const cacheKey = `https://market.cache${MARKET_RECENT_PATH}?h=${await sha256Hex(JSON.stringify(names))}`;
  const { body, hit } = await withEdgeCache(cacheKey, async () => {
    const [items, info] = await Promise.all([
      recentStats(env.MARKET, names, now),
      collectionInfo(env.MARKET),
    ]);
    return { items, ...info };
  });
  return new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
      'x-market-cache': hit ? 'hit' : 'miss',
    },
  });
}

/** 옵션 문장마다 가장 최근 거래. [문장, 개당 가격, 거래 시각(ISO)] 목록이다. */
export async function lastTradesByOption(db, name, type) {
  const { results } = await db.prepare(OPTION_TRADES_SQL).bind(name, type).all();
  return (results ?? []).map((row) => [row.text, row.price, new Date(row.ts * 1000).toISOString()]);
}

/**
 * GET /market/option-trades?name=...&type=... → 옵션 문장마다 가장 최근 거래. 유물 시세 화면이
 * 지금 매물이 없는 레벨에 최종 거래가를 적을 때 쓴다.
 */
export async function marketOptionTrades(request, url, env, cors) {
  if (!env.MARKET)
    return marketError('MARKET_NOT_CONFIGURED', '시세 기록이 아직 없습니다.', 503, cors);
  const name = cleanName(url.searchParams.get('name'));
  const type = cleanName(url.searchParams.get('type'));
  if (!name || !type)
    return marketError('MARKET_NAME_REQUIRED', '아이템 이름과 옵션 종류가 필요합니다.', 400, cors);

  if (await rateLimited(request, env)) {
    return marketError('MARKET_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }

  const cacheKey = `https://market.cache${MARKET_OPTION_TRADES_PATH}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const { body, hit } = await withEdgeCache(cacheKey, async () => {
    const [trades, info] = await Promise.all([
      lastTradesByOption(env.MARKET, name, type),
      collectionInfo(env.MARKET),
    ]);
    return { name, type, trades, ...info };
  });
  return new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
      'x-market-cache': hit ? 'hit' : 'miss',
    },
  });
}

/** POST /market/collect → 지금 한 번 받는다. 운영자 전용. 배포 직후 첫 수집을 확인할 때 쓴다. */
export async function marketCollect(env, cors) {
  const result = await collectTrades(env);
  return jsonResponse(result, cors, { 'cache-control': 'no-store' });
}
