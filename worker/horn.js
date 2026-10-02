/**
 * 거대한 외침의 뿔피리 기록과 찾기.
 *
 * 뿔피리 내역 API 는 서버마다 최근 1,000건만 준다. 붐비는 류트는 30분이면 1,000건이 차서, 그대로는
 * "어제 누가 붉은 개조석을 판다고 했나" 를 찾을 수 없다. 그래서 워커가 받아 D1(MARKET)에 쌓는다.
 *
 *   - 크론이 5분마다 네 서버를 받는다. 아무도 보지 않을 때도 빠지는 글이 없게 하려는 것이다.
 *   - 누가 찾을 때 그 서버를 받은 지 1분이 넘었으면 먼저 받고 찾는다. 그래서 화면은 1분 안쪽으로 새롭다.
 *     여러 사람이 한꺼번에 찾아도 meta 의 받은 시각을 조건부로 바꿔 한 요청만 받으러 간다.
 *
 * 받은 글의 9할은 파티 광고다. 게임이 10초 남짓마다 같은 광고를 다시 외치기 때문이다. 글마다 한 줄씩
 * 두면 찾은 결과가 같은 광고로 덮인다. 그래서 같은 캐릭터가 같은 글을 GAP 안에 다시 외치면 새 줄을
 * 만들지 않고 횟수와 마지막 시각만 올린다. 화면은 한 줄에 "몇 번, 언제부터 언제까지" 를 보여 준다.
 *
 * 표는 migrations/0002_horn.sql 에 있다.
 */

import { SERVER_CHANNELS } from './servers.js';
import { rateLimited, withEdgeCache } from './market.js';

const NEXON_HORN_URL = 'https://open.api.nexon.com/mabinogi/v1/horn-bugle-world/history';

export const HORN_SEARCH_PATH = '/horn/search';
export const HORN_COLLECT_PATH = '/horn/collect';

/** 같은 글을 이 시간 안에 다시 외치면 한 줄로 합친다. */
export const GAP_SECONDS = 30 * 60;

/** 찾을 때 서버를 받은 지 이만큼 지났으면 먼저 받는다. */
export const FRESH_MS = 60 * 1000;

/** 글을 두는 날 수. */
export const KEEP_DAYS = 90;

/** 찾을 수 있는 기간(일). 화면의 기간 고르기와 같다. */
export const SEARCH_DAYS = [1, 7, 30, 90];

/** 한 번에 돌려주는 줄 수 상한. 더 보려면 검색어로 좁힌다. */
export const SEARCH_MAX_LIMIT = 500;
const SEARCH_DEFAULT_LIMIT = 50;

/** 검색어 묶음 수와 묶음 안의 "또는" 수, 낱말 길이 상한. SQL 이 끝없이 길어지지 않게. */
const MAX_GROUPS = 6;
const MAX_ALTERNATIVES = 6;
const MAX_EXCLUDES = 10;
const TERM_MAX = 40;
const NAME_MAX = 40;
const BODY_MAX = 300;

/** 한 번에 지울 오래된 줄 수. 서버 하나를 받을 때마다 이만큼씩. */
const PURGE_LIMIT = 2000;

/** 같은 질문은 이 시간 동안 엣지 캐시에서 답한다. 서버를 받는 간격(1분)보다 짧게 둔다. */
const CACHE_SECONDS = 30;

const DAY_SECONDS = 86400;

export const KINDS = ['party', 'buy', 'sell', 'chat'];

/** 화면의 분류 고르기. noparty 는 파티 광고만 뺀 나머지다. */
const KIND_FILTERS = {
  all: null,
  noparty: ['buy', 'sell', 'chat'],
  party: ['party'],
  buy: ['buy'],
  sell: ['sell'],
};

/**
 * 삽니다와 팝니다. 둘 다 있으면 먼저 나온 쪽으로 가른다("팝니다 ... 구매 문의" 는 판매다).
 * "구해요", "구합니다" 는 넣지 않는다. 파티 광고가 "딜러 구해요" 처럼 사람을 구할 때도 쓴다.
 * "결정 구매" 는 파티가 전리품을 나누는 방식이라 거른다. "팔아 주실 분", "파시는 분" 은 사려는 쪽이다.
 * 한 글자짜리 "삼", "팜" 은 앞뒤가 낱말 경계일 때만 본다. "삼각", "팜플렛" 을 거르려는 것이다.
 */
const BUY_PATTERN =
  /삽니다|삽니당|삼니다|사요(?![가-힣])|사봅니다|(?<!결정\s?)구매|구입|매입|파실\s?분|파시는\s?분|팔아\s?주실|(?<![가-힣])삼(?![가-힣])|ㅅㅅ|ㅅㄴㄷ/;
const SELL_PATTERN =
  /팝니다|팝니당|팜니다|팜다|판매|팔아요|파요(?![가-힣])|사실\s?분|사가세요|사가실|(?<![가-힣])팜(?![가-힣])|ㅍㅍ|ㅍㅁ/;

/** 파티 광고의 모양. 게임이 붙이는 "#[채널15] ... [3/4명]" 이다. */
const PARTY_CHANNEL = /^#\[채널(\d{1,2})\]\s*/;
const PARTY_MEMBERS = /\s*\[(\d{1,2})\/(\d{1,2})명\]\s*$/;
/** 사람이 직접 쓴 글의 채널. "18채 던뱅", "31채널 이벤트" 같은 것. "채팅", "채집" 은 거른다. */
const TEXT_CHANNEL = /(?<!\d)(\d{1,2})\s*채(?:널)?(?![가-힣])/;
/** 사람이 직접 쓴 파티 광고. "5릴", "4/8", "할 분 구함", "모집" 같은 말. */
const PARTY_WORDS = /모집|구인|파티원|\d\s*릴|(?<![\d.])[1-8]\/[2-8](?![\d.])|할\s?분\s?구/;

/**
 * 뿔피리 글 하나를 읽는다. 파티 광고는 게임이 앞에 "이름 : " 을 붙이는데, 사람이 쓴 글은 붙지 않는다.
 * 본문에서는 둘 다 떼고, 채널과 인원은 따로 둔다. 같은 광고의 인원만 바뀐 글이 한 줄로 합쳐지게 하려는 것이다.
 */
export function parseHorn(character, message, server) {
  let body = String(message ?? '').trim();
  const prefix = `${character} : `;
  if (body.startsWith(prefix)) body = body.slice(prefix.length).trim();

  let channel = null;
  let members = null;
  let partyShape = false;

  const channelTag = PARTY_CHANNEL.exec(body);
  if (channelTag) {
    channel = Number(channelTag[1]);
    body = body.slice(channelTag[0].length);
    partyShape = true;
  }
  const count = PARTY_MEMBERS.exec(body);
  if (count) {
    members = `${Number(count[1])}/${Number(count[2])}`;
    body = body.slice(0, count.index);
    partyShape = true;
  }
  body = body.trim().slice(0, BODY_MAX);

  if (channel === null) {
    const written = TEXT_CHANNEL.exec(body);
    if (written) channel = Number(written[1]);
  }
  const maxChannel = SERVER_CHANNELS[server] ?? 0;
  if (channel !== null && (channel < 1 || channel > maxChannel)) channel = null;

  return { body, kind: kindOf(body, partyShape), channel, members };
}

function kindOf(body, partyShape) {
  const buy = BUY_PATTERN.exec(body);
  const sell = SELL_PATTERN.exec(body);
  if (buy && sell) return buy.index <= sell.index ? 'buy' : 'sell';
  if (buy) return 'buy';
  if (sell) return 'sell';
  if (partyShape || PARTY_WORDS.test(body)) return 'party';
  return 'chat';
}

/** 찾기용 문자열. 공백 차이("탈라 가흐" 와 "탈라가흐")로 놓치지 않게 공백을 모두 뺀다. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function toSeconds(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

async function readMeta(db, key) {
  const row = await db.prepare('SELECT value FROM meta WHERE key = ?1').bind(key).first();
  return row?.value ?? null;
}

function writeMeta(db, key, value) {
  return db
    .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)')
    .bind(key, String(value));
}

/**
 * 받으러 갈 차례인지 정하고, 차례면 그 자리에서 받은 시각을 적는다. 조건부 쓰기 한 번이라 여러 요청이
 * 한꺼번에 와도 한 요청만 바뀐 줄 수 1 을 받는다. 받다가 실패해도 1분 뒤까지는 다시 가지 않는다.
 */
async function claimFetch(db, server, now) {
  const result = await db
    .prepare(
      `INSERT INTO meta (key, value) VALUES (?1, ?2)
ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE CAST(meta.value AS INTEGER) <= ?3`,
    )
    .bind(`horn_claim:${server}`, String(now), String(now - FRESH_MS))
    .run();
  return (result?.meta?.changes ?? 0) > 0;
}

async function fetchHorns(env, server) {
  const url = new URL(NEXON_HORN_URL);
  url.searchParams.set('server_name', server);
  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json', 'x-nxopen-api-key': env.NEXON_API_KEY },
  });
  if (!response.ok) throw new Error(`뿔피리 내역 HTTP ${response.status}`);
  const body = await response.json();
  return Array.isArray(body?.horn_bugle_world_history) ? body.horn_bugle_world_history : [];
}

const UPDATE_SQL = `UPDATE horn_posts SET last_ts = j.last_ts, times = horn_posts.times + j.added,
  members = COALESCE(j.members, horn_posts.members), channel = COALESCE(horn_posts.channel, j.channel)
FROM (SELECT json_extract(value, '$[0]') AS id, json_extract(value, '$[1]') AS last_ts,
  json_extract(value, '$[2]') AS added, json_extract(value, '$[3]') AS members,
  json_extract(value, '$[4]') AS channel FROM json_each(?1)) AS j
WHERE horn_posts.id = j.id`;

const INSERT_SQL = `INSERT INTO horn_posts (server, character, body, norm, kind, channel, members, times, first_ts, last_ts)
SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
  json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'),
  json_extract(value, '$[6]'), json_extract(value, '$[7]'), json_extract(value, '$[8]'),
  json_extract(value, '$[9]')
FROM json_each(?1)`;

/**
 * 서버 하나를 받아 쌓는다. 받을 차례가 아니면(1분 안에 누가 받았으면) 그냥 돌아간다.
 *
 * 받은 목록은 지난번 목록과 겹친다. 지난번에 본 가장 새 글의 시각과, 그 초에 있던 글들을 meta 에 적어 두고
 * 그보다 새것만 넣는다. 같은 초에 글이 여럿일 수 있어 시각만으로는 가를 수 없다.
 */
export async function collectServer(env, server, now = Date.now()) {
  const db = env.MARKET;
  if (!db) return { skipped: 'MARKET 바인딩이 없습니다.' };
  if (!env.NEXON_API_KEY) return { skipped: 'NEXON_API_KEY 가 없습니다.' };
  if (!(await claimFetch(db, server, now))) return { skipped: 'fresh' };

  const list = await fetchHorns(env, server);
  const edgeKey = `horn_edge:${server}`;
  const edge = JSON.parse((await readMeta(db, edgeKey)) ?? 'null') ?? { ts: 0, keys: [] };
  const seenAtEdge = new Set(edge.keys);

  const fresh = [];
  for (const item of list) {
    const ts = toSeconds(item?.date_send);
    const character = String(item?.character_name ?? '')
      .trim()
      .slice(0, NAME_MAX);
    const message = String(item?.message ?? '');
    if (ts === null || !character || !message.trim()) continue;
    if (ts < edge.ts) continue;
    if (ts === edge.ts && seenAtEdge.has(`${character}\u0000${message}`)) continue;
    fresh.push({ ts, character, message });
  }

  const statements = [];
  const newestTs = fresh.reduce((max, item) => Math.max(max, item.ts), edge.ts);
  if (fresh.length > 0) {
    const keys = new Set(newestTs === edge.ts ? edge.keys : []);
    for (const item of fresh) {
      if (item.ts === newestTs) keys.add(`${item.character}\u0000${item.message}`);
    }
    statements.push(writeMeta(db, edgeKey, JSON.stringify({ ts: newestTs, keys: [...keys] })));
  }

  // 오래된 것부터 차례로 합친다. 앞 글에 뒤 글이 붙는다.
  fresh.sort((a, b) => a.ts - b.ts);
  let updated = 0;
  let inserted = 0;
  if (fresh.length > 0) {
    const since = fresh[0].ts - GAP_SECONDS;
    const { results } = await db
      .prepare(
        'SELECT id, character, body, last_ts FROM horn_posts WHERE server = ?1 AND last_ts >= ?2',
      )
      .bind(server, since)
      .all();

    /** 캐릭터와 본문이 같은 가장 최근 줄. 이미 있는 줄이거나 이번에 새로 만들 줄이다. */
    const open = new Map();
    for (const row of results ?? []) {
      const key = `${row.character}\u0000${row.body}`;
      const known = open.get(key);
      if (!known || known.last_ts < row.last_ts) {
        open.set(key, { id: row.id, last_ts: row.last_ts, added: 0, members: null, channel: null });
      }
    }

    const created = [];
    for (const item of fresh) {
      const parsed = parseHorn(item.character, item.message, server);
      if (!parsed.body) continue;
      const key = `${item.character}\u0000${parsed.body}`;
      const current = open.get(key);
      if (current && item.ts - current.last_ts <= GAP_SECONDS) {
        current.last_ts = Math.max(current.last_ts, item.ts);
        current.added += 1;
        if (parsed.members) current.members = parsed.members;
        if (parsed.channel !== null && current.channel === null) current.channel = parsed.channel;
        continue;
      }
      const post = {
        id: null,
        server,
        character: item.character,
        body: parsed.body,
        norm: normalize(`${item.character}|${parsed.body}`),
        kind: parsed.kind,
        channel: parsed.channel,
        members: parsed.members,
        added: 1,
        first_ts: item.ts,
        last_ts: item.ts,
      };
      created.push(post);
      open.set(key, post);
    }

    const changed = [...open.values()].filter((post) => post.id !== null && post.added > 0);
    if (changed.length > 0) {
      statements.push(
        db
          .prepare(UPDATE_SQL)
          .bind(
            JSON.stringify(
              changed.map((post) => [post.id, post.last_ts, post.added, post.members, post.channel]),
            ),
          ),
      );
    }
    if (created.length > 0) {
      statements.push(
        db.prepare(INSERT_SQL).bind(
          JSON.stringify(
            created.map((post) => [
              post.server,
              post.character,
              post.body,
              post.norm,
              post.kind,
              post.channel,
              post.members,
              post.added,
              post.first_ts,
              post.last_ts,
            ]),
          ),
        ),
      );
    }
    updated = changed.length;
    inserted = created.length;
  }

  statements.push(writeMeta(db, `horn_updated:${server}`, now));
  statements.push(
    db
      .prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('horn_started', ?1)")
      .bind(String(Math.floor(now / 1000))),
  );
  statements.push(
    db
      .prepare(
        'DELETE FROM horn_posts WHERE id IN (SELECT id FROM horn_posts WHERE server = ?1 AND last_ts < ?2 LIMIT ?3)',
      )
      .bind(server, Math.floor(now / 1000) - KEEP_DAYS * DAY_SECONDS, PURGE_LIMIT),
  );
  await db.batch(statements);

  // 목록의 가장 오래된 글이 지난번에 본 곳보다 새로우면 그 사이 글을 놓쳤다(1,000건 상한).
  const oldest = list.length > 0 ? toSeconds(list[list.length - 1]?.date_send) : null;
  const gap = edge.ts > 0 && oldest !== null && oldest > edge.ts;
  return { fetched: list.length, fresh: fresh.length, updated, inserted, gap };
}

/** 크론. 네 서버를 차례로 받는다. 한 서버가 실패해도 나머지는 받는다. */
export async function collectHorns(env, now = Date.now()) {
  const outcome = {};
  for (const server of Object.keys(SERVER_CHANNELS)) {
    try {
      outcome[server] = await collectServer(env, server, now);
    } catch (caught) {
      outcome[server] = { error: caught instanceof Error ? caught.message : String(caught) };
    }
  }
  return outcome;
}

/**
 * 검색어를 읽는다. 띄어쓰기로 나눈 낱말은 모두 들어 있어야 하고(그리고), 쉼표로 이은 낱말은 그중 하나만
 * 있으면 된다(또는). "탈라,탈가 세바" 는 (탈라 또는 탈가) 그리고 세바다.
 */
export function parseTerms(text) {
  return String(text ?? '')
    .split(/\s+/)
    .map((group) =>
      [...new Set(group.split(',').map((term) => normalize(term).slice(0, TERM_MAX)))].filter(Boolean),
    )
    .filter((group) => group.length > 0)
    .slice(0, MAX_GROUPS)
    .map((group) => group.slice(0, MAX_ALTERNATIVES));
}

/** 뺄 말. 띄어쓰기와 쉼표 어느 쪽으로 나눠도 하나라도 있으면 뺀다. */
export function parseExcludes(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[\s,]+/)
        .map((term) => normalize(term).slice(0, TERM_MAX))
        .filter(Boolean),
    ),
  ].slice(0, MAX_EXCLUDES);
}

/**
 * 찾기 조건을 SQL 로. 값은 모두 바인딩으로 넘긴다.
 *
 * 글에 검색어가 들어 있는지는 LIKE 가 아니라 instr 로 본다. D1 은 LIKE 패턴을 50바이트로 막는데 한글은 글자당
 * 3바이트라, 검색어가 17글자를 넘으면 "LIKE or GLOB pattern too complex" 로 터진다(검색어는 40자까지 받는다).
 * instr 은 길이 한도가 없고 %, _ 를 따로 가릴 필요도 없다. 글과 검색어는 둘 다 normalize 로 소문자에 공백이 없다.
 */
export function buildSearch({ server, since, character, kinds, groups, excludes, limit }) {
  const where = ['server = ?1', 'last_ts >= ?2'];
  const params = [server, since];
  const bind = (value) => {
    params.push(value);
    return `?${params.length}`;
  };
  if (character) where.push(`character = ${bind(character)}`);
  if (kinds) where.push(`kind IN (${kinds.map(bind).join(', ')})`);
  for (const group of groups) {
    where.push(`(${group.map((term) => `instr(norm, ${bind(term)}) > 0`).join(' OR ')})`);
  }
  if (excludes.length > 0) {
    where.push(
      `NOT (${excludes.map((term) => `instr(norm, ${bind(term)}) > 0`).join(' OR ')})`,
    );
  }
  const sql = `SELECT id, character, body, kind, channel, members, times, first_ts, last_ts
FROM horn_posts WHERE ${where.join(' AND ')}
ORDER BY last_ts DESC, id DESC LIMIT ${bind(limit + 1)}`;
  return { sql, params };
}

function hornError(name, message, status, cors) {
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
 * GET /horn/search?server=류트&q=&not=&char=&kind=all&days=1&limit=50
 * → { server, days, posts, more, updated, since }
 *
 * posts 는 마지막으로 외친 시각이 새로운 순이다. 시각은 초 단위 유닉스 시각이다.
 */
export async function hornSearch(request, url, env, cors, now = Date.now()) {
  if (!env.MARKET) return hornError('HORN_NOT_CONFIGURED', '뿔피리 기록이 아직 없습니다.', 503, cors);

  const server = url.searchParams.get('server') ?? '';
  if (!Object.hasOwn(SERVER_CHANNELS, server)) {
    return hornError('HORN_INVALID_SERVER', '서버 이름이 올바르지 않습니다.', 400, cors);
  }
  const requestedDays = Number(url.searchParams.get('days'));
  const days = SEARCH_DAYS.includes(requestedDays) ? requestedDays : SEARCH_DAYS[0];
  const requestedLimit = Number(url.searchParams.get('limit'));
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, SEARCH_MAX_LIMIT)
      : SEARCH_DEFAULT_LIMIT;
  const kindKey = url.searchParams.get('kind') ?? 'all';
  const kinds = Object.hasOwn(KIND_FILTERS, kindKey) ? KIND_FILTERS[kindKey] : null;
  const character = (url.searchParams.get('char') ?? '').trim().slice(0, NAME_MAX);
  const groups = parseTerms(url.searchParams.get('q'));
  const excludes = parseExcludes(url.searchParams.get('not'));

  if (await rateLimited(request, env)) {
    return hornError('HORN_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }

  const cacheKey = new URL(`https://horn.cache${HORN_SEARCH_PATH}`);
  cacheKey.searchParams.set('server', server);
  cacheKey.searchParams.set('days', String(days));
  cacheKey.searchParams.set('limit', String(limit));
  cacheKey.searchParams.set('kind', Object.hasOwn(KIND_FILTERS, kindKey) ? kindKey : 'all');
  cacheKey.searchParams.set('char', character);
  cacheKey.searchParams.set('q', JSON.stringify(groups));
  cacheKey.searchParams.set('not', JSON.stringify(excludes));

  const { body, hit } = await withEdgeCache(
    cacheKey.toString(),
    async () => {
      // 찾기 전에 새 글을 받는다. 받지 못해도 쌓아 둔 것으로 답한다. 화면이 받은 시각을 보고 알린다.
      await collectServer(env, server, now).catch((caught) =>
        console.log(JSON.stringify({ horn: server, error: String(caught) })),
      );
      const { sql, params } = buildSearch({
        server,
        since: Math.floor(now / 1000) - days * DAY_SECONDS,
        character,
        kinds,
        groups,
        excludes,
        limit,
      });
      const [{ results }, updated, started] = await Promise.all([
        env.MARKET.prepare(sql)
          .bind(...params)
          .all(),
        readMeta(env.MARKET, `horn_updated:${server}`),
        readMeta(env.MARKET, 'horn_started'),
      ]);
      const rows = results ?? [];
      return {
        server,
        days,
        posts: rows.slice(0, limit).map((row) => ({
          id: row.id,
          character: row.character,
          body: row.body,
          kind: row.kind,
          channel: row.channel,
          members: row.members,
          times: row.times,
          first: row.first_ts,
          last: row.last_ts,
        })),
        more: rows.length > limit,
        updated: updated ? new Date(Number(updated)).toISOString() : null,
        since: started ? new Date(Number(started) * 1000).toISOString() : null,
      };
    },
    CACHE_SECONDS,
  );

  return new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
      'x-horn-cache': hit ? 'hit' : 'miss',
    },
  });
}

/** POST /horn/collect → 지금 네 서버를 받는다. 운영자 전용. 배포 직후 첫 수집을 확인할 때 쓴다. */
export async function hornCollect(env, cors) {
  // 1분 안에 받은 서버도 다시 받게 받은 시각을 비운다.
  await env.MARKET?.prepare("DELETE FROM meta WHERE key LIKE 'horn_claim:%'").run();
  return new Response(JSON.stringify(await collectHorns(env)), {
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
