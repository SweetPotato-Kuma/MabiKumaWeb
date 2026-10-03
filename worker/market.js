/**
 * 경매장 시세 기록.
 *
 * 경매장 거래 내역 API 는 최근 1시간만 돌려준다. 그것만으로는 "어제 얼마에 팔렸나" 도, 한 달
 * 그래프도 그릴 수 없다. 그래서 워커가 10분마다(wrangler.toml 의 crons) 거래 내역을 받아 D1 에
 * 쌓고, 화면은 여기서 아이템별로 읽는다.
 *
 *   MARKET             (D1 바인딩, 필수) 거래 원본(trades), 하루 요약(daily, daily_variant), 수집 상태(meta)
 *   MARKET_RATE_LIMIT  (Rate limiting 바인딩, 선택) 있으면 시세 조회 횟수를 제한한다
 *
 * 표 모양은 migrations/ 에 있다.
 *
 * 받는 쪽은 새것부터 거꾸로 내려가며 지난번에 받은 곳을 조금 지나칠 때까지 읽는다. 같은 거래는
 * 거래 번호가 같아 두 번 들어가지 않는다. 중간에 실패하면 "마지막으로 받은 시각" 을 옮기지 않아
 * 다음 번에 그 자리부터 다시 채운다. 1시간 넘게 멈췄던 구간은 API 에 더는 없으므로 비어 있다.
 */

const NEXON_HISTORY_URL = 'https://open.api.nexon.com/mabinogi/v1/auction/history';

export const MARKET_ITEM_PATH = '/market/item';
export const MARKET_RECENT_PATH = '/market/recent';
export const MARKET_OPTION_TRADES_PATH = '/market/option-trades';
export const MARKET_HISTORY_PATH = '/market/history';
export const MARKET_POPULAR_PATH = '/market/popular';
export const MARKET_RELIC_SERIES_PATH = '/market/relic-series';
export const MARKET_RELIC_RECENT_PATH = '/market/relic-recent';
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

/** 거래 내역 목록(/market/history)에서 한 번에 훑을 수 있는 카테고리 수. 상세 검색 조건만으로
 * 훑는 스캔이 부르는 카테고리 수보다 넉넉히 둔다. */
const HISTORY_MAX_CATEGORIES = 40;

/** 거래 내역 목록 한 쪽의 줄 수 상한과 기본값. */
const HISTORY_MAX_LIMIT = 500;
const HISTORY_DEFAULT_LIMIT = 200;

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

/**
 * 인기 거래 아이템의 집계 기간. 1시간과 24시간은 거래 원본(trades)에서, 7일과 30일은 하루 요약(daily)에서 센다.
 * 원본으로 한 달을 세면 읽는 줄이 수백만이다. 하루 요약은 한국 시각 날짜로 가르므로 7일과 30일은 오늘을 포함한
 * 날짜 수다(오늘은 아직 덜 찬 날이다). 캐시 시간은 집계가 무거울수록 길게 둔다.
 */
export const POPULAR_WINDOWS = {
  '1h': { seconds: 3600, cacheSeconds: 300 },
  '24h': { seconds: DAY_SECONDS, cacheSeconds: 900 },
  '7d': { days: 7, cacheSeconds: 1800 },
  '30d': { days: 30, cacheSeconds: 1800 },
};

/** 인기 순위에 담을 아이템 수. 화면은 처음 10개를 보이고 펼치면 이만큼까지 보인다. */
export const POPULAR_LIMIT = 30;

/**
 * 원래 이름은 같고 보이는 이름("전용 인챈트 스크롤 - 투지", "도면 - 글라디우스")에서만 무엇인지 갈리는 거래.
 * 인기 순위는 이것들을 보이는 이름으로 센다. 원래 이름으로 세면 인챈트가 다른 스크롤이 모두 한 줄에 섞인다.
 * 시세 조회(daily, STATS_SQL)는 원래 이름으로 묶은 채 둔다.
 */
const VARIANT_WHERE = `display IS NOT NULL AND substr(display, 1, length(name) + 3) = name || ' - '`;

/** 순위에 쓰는 한 거래의 이름. VARIANT_WHERE 이면 보이는 이름이다. */
export function popularKey(name, display) {
  return display && display.startsWith(`${name} - `) ? display : name;
}

/**
 * 기간 안에서 거래 횟수가 많은 순, 총 거래 금액이 많은 순 두 가지 순위를 한 번에 뽑는다. 아이템별로 묶는 일은
 * 한 번이고 정렬만 둘이다. 같으면 다른 쪽 기준, 그다음 이름 순이라 새로 불러도 순서가 흔들리지 않는다.
 * name 은 순위의 이름(VARIANT_WHERE 이면 보이는 이름), item 은 원래 이름이다.
 * 무리아스의 유물(?4)은 옵션별로 따로 세므로(POPULAR_RELIC_SQL) 여기서 뺀다.
 */
const POPULAR_RANK = `SELECT * FROM (SELECT 'n' AS src, name, item, category, n, qty, total FROM g ORDER BY n DESC, total DESC, name LIMIT ?3)
UNION ALL
SELECT * FROM (SELECT 't' AS src, name, item, category, n, qty, total FROM g ORDER BY total DESC, n DESC, name LIMIT ?3)`;

const POPULAR_TRADES_SQL = `WITH g AS (
  SELECT CASE WHEN ${VARIANT_WHERE} THEN display ELSE name END AS name, MAX(name) AS item, MAX(category) AS category,
    COUNT(*) AS n, SUM(count) AS qty, SUM(count * price) AS total
  FROM trades WHERE ts >= ?1 AND ts < ?2 AND name <> ?4 GROUP BY 1
)
${POPULAR_RANK}`;

/**
 * 하루 요약으로 센 순위. 보이는 이름으로 갈리는 몫(daily_variant)을 원래 이름의 줄(daily)에서 빼고 따로 세운다.
 * 둘은 같은 때 같은 원본에서 계산하므로 빼면 보이는 이름이 따로 없는 거래만 남는다.
 */
const POPULAR_DAILY_SQL = `WITH v AS (
  SELECT display AS name, MAX(name) AS item, MAX(category) AS category, SUM(n) AS n, SUM(qty) AS qty, SUM(total) AS total
  FROM daily_variant WHERE day > ?1 AND day <= ?2 GROUP BY display
), vi AS (
  SELECT item, SUM(n) AS n, SUM(qty) AS qty, SUM(total) AS total FROM v GROUP BY item
), d AS (
  SELECT name, MAX(category) AS category, SUM(n) AS n, SUM(qty) AS qty, SUM(total) AS total
  FROM daily WHERE day > ?1 AND day <= ?2 AND name <> ?4 GROUP BY name
), g AS (
  SELECT d.name, d.name AS item, d.category, d.n - COALESCE(vi.n, 0) AS n, d.qty - COALESCE(vi.qty, 0) AS qty,
    d.total - COALESCE(vi.total, 0) AS total
  FROM d LEFT JOIN vi ON vi.item = d.name
  WHERE d.n > COALESCE(vi.n, 0)
  UNION ALL
  SELECT name, item, category, n, qty, total FROM v
)
${POPULAR_RANK}`;

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

/**
 * 무리아스의 유물. 옵션 문장 하나가 레벨 하나라서(수치가 레벨마다 다르다) 시세는 이름이 아니라 문장으로 센다.
 * 이름("무리아스의 유물")으로 세면 모든 옵션, 모든 레벨이 한 통계에 섞여 뜻이 없다.
 * 화면의 MURIAS_RELIC_NAME, MURIAS_OPTION_TYPE(src/features/relics/murias.ts)과 같다.
 */
const RELIC_NAME = '무리아스의 유물';
const RELIC_OPTION_TYPE = '무리아스 유물';

/**
 * 인기 순위에 넣을 유물 거래를 옵션 문장별로 센다. 문장에서 옵션 이름을 떼는 일(relicOptionName)은 SQL 로
 * 하기 어려워 워커가 한다. 옵션 줄이 없는 거래는 문장이 NULL 인 줄로 모인다. 하루 요약이 없어 7일, 30일도
 * 원본에서 센다. 하루 900건 남짓이라 30일이어도 가볍다.
 */
const POPULAR_RELIC_SQL = `SELECT (SELECT json_extract(o.value, '$[2]') FROM json_each(t.options) o
    WHERE json_extract(o.value, '$[0]') = '${RELIC_OPTION_TYPE}' LIMIT 1) AS text,
  MAX(category) AS category, COUNT(*) AS n, SUM(count) AS qty, SUM(count * price) AS total
FROM trades t WHERE t.name = '${RELIC_NAME}' AND t.ts >= ?1 AND t.ts < ?2
GROUP BY 1`;

/**
 * 유물 옵션 문장의 옵션 이름. "오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)" -> "오버 드라이브 폭발 공격 대미지".
 * 화면의 parseRelicOption(src/features/relics/murias.ts)과 같은 모양으로 읽는다. 모양이 다르면 null.
 */
export function relicOptionName(text) {
  const match =
    /^(.*?)(\d+(?:\.\d+)?)\s*(%|초)?\s*(증가|추가|감소)?\s*\(최대\s*(\d+(?:\.\d+)?)\s*(%|초)?\)\s*$/.exec(
      String(text ?? '').trim(),
    );
  const name = match?.[1].trim();
  return name || null;
}

/** 옵션 하나의 시세 그래프에 담을 날 수의 기본값과 상한. 거래 원본(RAW_DAYS)보다 길 수 없다. */
const RELIC_SERIES_DAYS = 30;
/** 옵션 하나의 최근 거래 목록 줄 수. */
const RELIC_RECENT_TRADES = 40;
const OPTION_MAX = 120;

/** 유물 거래의 옵션 문장 한 줄. 문장에 들어 있는 값(수치)이 레벨을 가른다. */
const RELIC_PICK = `SELECT t.id, t.ts, t.price, t.count, json_extract(o.value, '$[2]') AS text
  FROM trades t, json_each(t.options) o
  WHERE t.name = '${RELIC_NAME}' AND json_extract(o.value, '$[0]') = '${RELIC_OPTION_TYPE}'`;

/**
 * 옵션 하나(이름이 같은 문장 모두)의 문장별, 날짜별 거래가. 문장은 "옵션 이름 수치 증가 (최대 N)" 모양이라
 * 이름 뒤에 공백이 오는 것만 고른다. 이름이 다른 옵션의 앞부분과 겹치는 것은 화면이 문장을 읽어 걸러낸다.
 * 중위는 거래 건수 기준이다(STATS_SQL 과 같다).
 *
 * 앞부분 맞추기는 LIKE 가 아니라 substr 로 한다. D1 은 LIKE 패턴을 50바이트로 막는데 한글은 글자당 3바이트라
 * 17글자가 넘는 옵션 이름("인터루드 슬래시의 4막: 질투의 화신 대미지 배율")은 "LIKE or GLOB pattern too complex"
 * 로 터졌다. 로컬 SQLite 에는 이 한도가 없어 시험으로는 잡히지 않는다.
 */
const RELIC_SERIES_SQL = `WITH picked AS (
  SELECT text, (ts + ${KST_OFFSET_SECONDS}) / ${DAY_SECONDS} AS day, count, price,
    ROW_NUMBER() OVER (PARTITION BY text, (ts + ${KST_OFFSET_SECONDS}) / ${DAY_SECONDS} ORDER BY price) AS rn,
    COUNT(*) OVER (PARTITION BY text, (ts + ${KST_OFFSET_SECONDS}) / ${DAY_SECONDS}) AS c
  FROM (${RELIC_PICK} AND ts >= ?1) WHERE substr(text, 1, ?3) = ?2
)
SELECT text, day, COUNT(*) AS n, SUM(count) AS qty, SUM(count * price) AS total, MIN(price) AS lo, MAX(price) AS hi,
  CAST(ROUND(AVG(CASE WHEN rn IN ((c + 1) / 2, (c + 2) / 2) THEN price END)) AS INTEGER) AS mid
FROM picked
GROUP BY text, day
ORDER BY text, day`;

const RELIC_RECENT_TRADES_SQL = `SELECT text, price, count, ts FROM (${RELIC_PICK}) WHERE substr(text, 1, ?2) = ?1
ORDER BY ts DESC, id DESC LIMIT ${RELIC_RECENT_TRADES}`;

/** 모든 유물 문장의 최근 1일 통계. 줄마다 그 문장(그 레벨) 값을 붙이는 데 쓴다. */
const RELIC_RECENT_SQL = `WITH picked AS (
  SELECT text, ts, count, price,
    ROW_NUMBER() OVER (PARTITION BY text ORDER BY price) AS rn,
    COUNT(*) OVER (PARTITION BY text) AS c
  FROM (${RELIC_PICK} AND ts >= ?1 AND ts < ?2) WHERE text IS NOT NULL
)
SELECT text, COUNT(*) AS n, SUM(count) AS qty, SUM(count * price) AS total, MIN(price) AS lo,
  MAX(price) AS hi, MAX(ts) AS last,
  CAST(ROUND(AVG(CASE WHEN rn IN ((c + 1) / 2, (c + 2) / 2) THEN price END)) AS INTEGER) AS mid
FROM picked
GROUP BY text`;

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

/** 압축 저장한 옵션을 [{option_type, ...}] 로 되편다. compactOptions 의 역함수. */
export function expandOptions(compact) {
  if (!compact) return undefined;
  let rows;
  try {
    rows = JSON.parse(compact);
  } catch {
    return undefined;
  }
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  const keys = ['option_type', 'option_sub_type', 'option_value', 'option_value2', 'option_desc'];
  return rows.map((row) => {
    const option = {};
    row.forEach((value, index) => {
      if (value !== null && value !== undefined) option[keys[index]] = value;
    });
    return option;
  });
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

/** 보이는 이름으로 갈리는 거래의 하루 요약(인기 순위용). 셈은 DAILY_SQL 과 같은 원본, 같은 범위다. */
const DAILY_VARIANT_SQL = `INSERT OR REPLACE INTO daily_variant (display, day, name, category, n, qty, total)
SELECT display, ?4, MAX(name), MAX(category), COUNT(*), SUM(count), SUM(count * price)
FROM trades
WHERE name IN (SELECT value FROM json_each(?1)) AND ts >= ?2 AND ts < ?3 AND ${VARIANT_WHERE}
GROUP BY display`;

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
    const variantNamesByDay = new Map();
    const add = (map, day, name) => {
      if (!map.has(day)) map.set(day, new Set());
      map.get(day).add(name);
    };
    for (const row of rows) {
      const day = kstDay(row[1]);
      add(namesByDay, day, row[2]);
      if (popularKey(row[2], row[3]) !== row[2]) add(variantNamesByDay, day, row[2]);
    }
    for (const [sql, byDay] of [
      [DAILY_SQL, namesByDay],
      [DAILY_VARIANT_SQL, variantNamesByDay],
    ]) {
      for (const [day, names] of byDay) {
        followUps.push(
          db.prepare(sql).bind(JSON.stringify([...names]), dayStart(day), dayStart(day + 1), day),
        );
      }
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

/** "123_456" 모양의 커서를 { ts, id } 로. 못 읽으면 null(맨 처음부터). */
function parseHistoryCursor(raw) {
  const match = /^(\d+)_(\d+)$/.exec(String(raw ?? ''));
  if (!match) return null;
  return { ts: Number(match[1]), id: Number(match[2]) };
}

/** 거래 원본 한 줄을 화면의 거래 내역 한 줄 모양으로(AuctionHistoryItem 과 같다). */
function toHistoryItem(row) {
  return {
    item_name: row.name,
    item_display_name: row.display ?? row.name,
    item_count: row.count,
    auction_item_category: row.category,
    auction_price_per_unit: row.price,
    date_auction_buy: new Date(row.ts * 1000).toISOString(),
    auction_buy_id: String(row.id),
    item_option: expandOptions(row.options),
  };
}

/**
 * 거래 목록 조회 조건을 SQL 로. 카테고리나 이름 가운데 하나는 있어야 한다(부르는 쪽이 확인).
 * 커서는 (ts, id) 내림차순 자리를 가리킨다. 값은 모두 바인딩으로 넘긴다.
 */
export function buildHistoryQuery({ categories, names, cursor, limit }) {
  const where = [];
  const params = [];
  const bind = (value) => {
    params.push(value);
    return `?${params.length}`;
  };
  if (categories.length > 0) where.push(`category IN (${categories.map(bind).join(', ')})`);
  if (names.length > 0) where.push(`name IN (${names.map(bind).join(', ')})`);
  if (cursor) {
    const ts = bind(cursor.ts);
    const id = bind(cursor.id);
    where.push(`(ts < ${ts} OR (ts = ${ts} AND id < ${id}))`);
  }
  const sql = `SELECT id, ts, name, display, category, count, price, options FROM trades
${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
ORDER BY ts DESC, id DESC LIMIT ${bind(limit + 1)}`;
  return { sql, params };
}

/**
 * 카테고리나 아이템 이름으로 거래 목록을 훑는다. 개별 거래를 새것부터 커서로 이어 준다.
 * 상세 검색 조건의 "다음 쪽"과 같은 모양(next_cursor)으로 돌려준다.
 */
export async function historyTrades(db, { categories, names, cursor, limit }) {
  const { sql, params } = buildHistoryQuery({ categories, names, cursor, limit });
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all();
  const rows = results ?? [];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toHistoryItem),
    nextCursor: rows.length > limit && last ? `${last.ts}_${last.id}` : null,
  };
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
export async function withEdgeCache(cacheKey, compute, seconds = CACHE_SECONDS) {
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
      new Response(body, { headers: { 'cache-control': `public, max-age=${seconds}` } }),
    );
  }
  return { body, hit: false };
}

/** 시세 기록과 뿔피리 찾기가 같이 쓴다. 둘 다 D1 을 읽는 조회다. */
export async function rateLimited(request, env) {
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

/** 쉼표로 이은 목록을 정리한다. 빈 값과 중복을 뺀 뒤 max 개까지만 남긴다. */
function parseNameList(raw, max) {
  return [...new Set(String(raw ?? '').split(',').map(cleanName).filter(Boolean))].slice(0, max);
}

/**
 * GET /market/history?category=&name=&cursor=&limit= → 카테고리나 아이템 이름(둘 다 쉼표로
 * 여러 개)으로 거래 목록을 새것부터 훑는다. 경매장 화면의 "거래 내역" 탭이 쓴다.
 *
 * 거래 내역 API 는 최근 1시간만 주지만, 여기는 워커가 10분마다 쌓아 둔 원본(trades, RAW_DAYS)을
 * 그대로 읽으므로 그보다 훨씬 길게 볼 수 있다.
 *
 * 카테고리도 이름도 안 주면 서버 전체에서 새것부터 준다. WHERE 절 없이 ts 색인 하나로 끝나는
 * 조회라(buildHistoryQuery) 카테고리/이름 필터만큼 걱정할 게 없다. 경매장 첫 화면이 아직 아무
 * 것도 찾지 않은 채로 "요즘 거래" 미리보기를 보여줄 때 쓴다.
 */
export async function marketHistory(request, url, env, cors) {
  if (!env.MARKET)
    return marketError('MARKET_NOT_CONFIGURED', '시세 기록이 아직 없습니다.', 503, cors);

  const categories = parseNameList(url.searchParams.get('category'), HISTORY_MAX_CATEGORIES);
  const names = parseNameList(url.searchParams.get('name'), RECENT_MAX_NAMES);
  const cursor = parseHistoryCursor(url.searchParams.get('cursor'));
  const requestedLimit = Number(url.searchParams.get('limit'));
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, HISTORY_MAX_LIMIT)
      : HISTORY_DEFAULT_LIMIT;

  if (await rateLimited(request, env)) {
    return marketError('MARKET_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }

  const cacheKey = new URL(`https://market.cache${MARKET_HISTORY_PATH}`);
  cacheKey.searchParams.set('category', categories.join(','));
  cacheKey.searchParams.set('name', names.join(','));
  cacheKey.searchParams.set('cursor', url.searchParams.get('cursor') ?? '');
  cacheKey.searchParams.set('limit', String(limit));

  const { body, hit } = await withEdgeCache(cacheKey.toString(), async () => {
    const [{ items, nextCursor }, info] = await Promise.all([
      historyTrades(env.MARKET, { categories, names, cursor, limit }),
      collectionInfo(env.MARKET),
    ]);
    return { auction_history: items, next_cursor: nextCursor, ...info };
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

/** 순위 한 줄. 보이는 이름이나 유물 옵션으로 센 줄이면 원래 이름(item)을, 유물 옵션이면 옵션 이름(relic)도 준다. 평균은 수량으로 가중한 개당 가격이고, 수량이 0 이하면 값이 없다(0 으로 적지 않는다). */
function toPopularRow(row) {
  return {
    name: row.name,
    ...(row.item !== row.name ? { item: row.item } : {}),
    ...(row.relic ? { relic: row.relic } : {}),
    category: row.category,
    n: row.n,
    qty: row.qty,
    total: row.total,
    avg: row.qty > 0 ? Math.round(row.total / row.qty) : null,
  };
}

/**
 * 유물 거래를 옵션 이름으로 묶는다. 레벨(수치)이 달라도 옵션이 같으면 한 줄이다. 옵션을 읽지 못한 거래는
 * 원래 이름("무리아스의 유물") 한 줄로 모인다.
 */
function relicPopularRows(results) {
  const byName = new Map();
  for (const row of results) {
    const option = relicOptionName(row.text);
    const name = option ? `${RELIC_NAME} - ${option}` : RELIC_NAME;
    const sum = byName.get(name) ?? { name, item: RELIC_NAME, relic: option, category: row.category, n: 0, qty: 0, total: 0 };
    sum.n += row.n;
    sum.qty += row.qty;
    sum.total += row.total;
    byName.set(name, sum);
  }
  return [...byName.values()];
}

/** POPULAR_RANK 와 같은 순서로 다시 줄 세운다. SQL 순위에 유물 옵션 줄을 끼워 넣을 때 쓴다. */
function rankPopular(rows, first, second) {
  return rows
    .sort((a, b) => b[first] - a[first] || b[second] - a[second] || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, POPULAR_LIMIT);
}

/**
 * 인기 거래 아이템. 기간(window) 안의 두 순위와 집계 기간을 돌려준다.
 *
 * 집계 기간은 from 부터 to 까지(ISO)다. 기록을 모으기 시작한 날(since)이 from 보다 늦으면 partial 이고,
 * 그때는 시작한 날부터의 순위다. 거래가 한 건도 없으면 두 순위가 비어 있다.
 */
export async function popularTrades(db, window, now = Date.now()) {
  const spec = POPULAR_WINDOWS[window];
  const nowSec = Math.floor(now / 1000);
  const today = kstDay(nowSec);
  const fromSec = spec.days ? dayStart(today - spec.days + 1) : nowSec - spec.seconds;
  const [{ results }, { results: relicResults }] = await Promise.all([
    spec.days
      ? db.prepare(POPULAR_DAILY_SQL).bind(today - spec.days, today, POPULAR_LIMIT, RELIC_NAME).all()
      : db.prepare(POPULAR_TRADES_SQL).bind(fromSec, nowSec + 1, POPULAR_LIMIT, RELIC_NAME).all(),
    db.prepare(POPULAR_RELIC_SQL).bind(fromSec, nowSec + 1).all(),
  ]);
  const rows = results ?? [];
  const relics = relicPopularRows(relicResults ?? []);
  const info = await collectionInfo(db);
  const started = Number(await readMeta(db, 'started')) || 0;
  return {
    window,
    from: new Date(fromSec * 1000).toISOString(),
    to: new Date(nowSec * 1000).toISOString(),
    partial: started > fromSec,
    byCount: rankPopular([...rows.filter((row) => row.src === 'n'), ...relics], 'n', 'total').map(toPopularRow),
    byTotal: rankPopular([...rows.filter((row) => row.src === 't'), ...relics], 'total', 'n').map(toPopularRow),
    ...info,
  };
}

/**
 * GET /market/popular?window=1h|24h|7d|30d → 인기 거래 아이템 순위(거래 횟수순, 총 거래 금액순).
 * 경매장 화면의 인기 거래 아이템 차트가 쓴다.
 */
export async function marketPopular(request, url, env, cors, now = Date.now()) {
  if (!env.MARKET)
    return marketError('MARKET_NOT_CONFIGURED', '시세 기록이 아직 없습니다.', 503, cors);
  const window = url.searchParams.get('window') ?? '24h';
  if (!Object.hasOwn(POPULAR_WINDOWS, window))
    return marketError('MARKET_BAD_WINDOW', '집계 기간은 1h, 24h, 7d, 30d 중 하나입니다.', 400, cors);

  if (await rateLimited(request, env)) {
    return marketError('MARKET_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }

  const { cacheSeconds } = POPULAR_WINDOWS[window];
  const cacheKey = `https://market.cache${MARKET_POPULAR_PATH}?window=${window}`;
  const cached = await cachedQuery(cacheKey, () => popularTrades(env.MARKET, window, now), cacheSeconds, cors);
  if (cached instanceof Response) return cached;
  const { body, hit } = cached;
  return new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${cacheSeconds}`,
      'x-market-cache': hit ? 'hit' : 'miss',
    },
  });
}

/**
 * 유물 옵션 하나의 거래가 추이. 문장(레벨)마다 날짜별 거래 건수, 최저, 중위, 최고가와, 최근 거래 목록을 준다.
 * days 일은 거래 원본이 있는 만큼만 의미가 있다. 기록을 늦게 모았으면 화면이 since 로 밝힌다.
 */
export async function relicSeries(db, option, days = RELIC_SERIES_DAYS, now = Date.now()) {
  const today = kstDay(Math.floor(now / 1000));
  const since = dayStart(today - days + 1);
  // 이름 바로 뒤에 공백이 온 문장만. substr 은 글자 수로 센다(한글 한 글자가 한 칸).
  const prefix = `${option} `;
  const length = [...prefix].length;
  const [daily, recent] = await Promise.all([
    db.prepare(RELIC_SERIES_SQL).bind(since, prefix, length).all(),
    db.prepare(RELIC_RECENT_TRADES_SQL).bind(prefix, length).all(),
  ]);
  return {
    option,
    days,
    // [문장, 날짜, 거래 건수, 수량, 최저, 중위, 최고, 거래 금액 합]
    daily: (daily.results ?? []).map((row) => [
      row.text,
      dayLabel(row.day),
      row.n,
      row.qty,
      row.lo,
      row.mid,
      row.hi,
      row.total,
    ]),
    // [문장, 개당 가격, 수량, 거래 시각(ISO)] 새것부터
    recent: (recent.results ?? []).map((row) => [
      row.text,
      row.price,
      row.count,
      new Date(row.ts * 1000).toISOString(),
    ]),
  };
}

/** 유물 문장마다 최근 1일 통계. 문장이 없던 레벨은 빠진다. */
export async function relicRecentStats(db, now = Date.now()) {
  const end = Math.floor(now / 1000) + 1;
  const { results } = await db
    .prepare(RELIC_RECENT_SQL)
    .bind(end - 1 - DAY_SECONDS, end)
    .all();
  const items = {};
  for (const row of results ?? []) {
    items[row.text] = {
      n: row.n,
      qty: row.qty,
      lo: row.lo,
      hi: row.hi,
      mid: row.mid,
      avg: row.qty > 0 ? Math.round(row.total / row.qty) : 0,
      last: new Date(row.last * 1000).toISOString(),
    };
  }
  return items;
}

/**
 * 엣지 캐시를 거쳐 읽는다. 읽다가 터지면 오류 응답(CORS 헤더 포함)으로 바꿔 돌려준다. 잡지 않으면 워커가 CORS 헤더 없는
 * 500 을 내서, 브라우저에는 까닭 없는 "Failed to fetch" 로만 보인다.
 */
async function cachedQuery(cacheKey, compute, seconds, cors) {
  try {
    return await withEdgeCache(cacheKey, compute, seconds);
  } catch (error) {
    console.error(JSON.stringify({ market: 'query failed', key: cacheKey, error: String(error) }));
    return marketError('MARKET_QUERY_FAILED', '시세를 읽지 못했습니다. 잠시 뒤 다시 열어 보세요.', 500, cors);
  }
}

function cachedJson(body, hit, cors, seconds = CACHE_SECONDS) {
  return new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${seconds}`,
      'x-market-cache': hit ? 'hit' : 'miss',
    },
  });
}

/** GET /market/relic-series?option=...&days=30 → 유물 옵션 하나의 레벨별 거래가 추이와 최근 거래. 유물 시세의 창이 쓴다. */
export async function marketRelicSeries(request, url, env, cors, now = Date.now()) {
  if (!env.MARKET)
    return marketError('MARKET_NOT_CONFIGURED', '시세 기록이 아직 없습니다.', 503, cors);
  const option = String(url.searchParams.get('option') ?? '')
    .trim()
    .slice(0, OPTION_MAX);
  if (!option) return marketError('MARKET_NAME_REQUIRED', '옵션 이름이 없습니다.', 400, cors);
  const requested = Number(url.searchParams.get('days'));
  const days =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, SERIES_MAX_DAYS)
      : RELIC_SERIES_DAYS;

  if (await rateLimited(request, env)) {
    return marketError('MARKET_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }

  const cacheKey = `https://market.cache${MARKET_RELIC_SERIES_PATH}?option=${encodeURIComponent(option)}&days=${days}`;
  const cached = await cachedQuery(
    cacheKey,
    async () => {
      const [series, info] = await Promise.all([
        relicSeries(env.MARKET, option, days, now),
        collectionInfo(env.MARKET),
      ]);
      return { ...series, ...info };
    },
    900,
    cors,
  );
  if (cached instanceof Response) return cached;
  return cachedJson(cached.body, cached.hit, cors, 900);
}

/** GET /market/relic-recent → 유물 문장(레벨)마다 최근 1일 통계. 경매장 목록과 상세가 유물의 레벨별 시세를 붙일 때 쓴다. */
export async function marketRelicRecent(request, env, cors, now = Date.now()) {
  if (!env.MARKET)
    return marketError('MARKET_NOT_CONFIGURED', '시세 기록이 아직 없습니다.', 503, cors);
  if (await rateLimited(request, env)) {
    return marketError('MARKET_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }
  const cached = await cachedQuery(
    `https://market.cache${MARKET_RELIC_RECENT_PATH}`,
    async () => {
      const [items, info] = await Promise.all([relicRecentStats(env.MARKET, now), collectionInfo(env.MARKET)]);
      return { items, ...info };
    },
    CACHE_SECONDS,
    cors,
  );
  if (cached instanceof Response) return cached;
  return cachedJson(cached.body, cached.hit, cors);
}

/** POST /market/collect → 지금 한 번 받는다. 운영자 전용. 배포 직후 첫 수집을 확인할 때 쓴다. */
export async function marketCollect(env, cors) {
  const result = await collectTrades(env);
  return jsonResponse(result, cors, { 'cache-control': 'no-store' });
}
