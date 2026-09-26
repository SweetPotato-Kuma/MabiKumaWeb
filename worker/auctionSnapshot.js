/**
 * 경매장 장비 매물 모아 두기.
 *
 * 넥슨 경매장 API 는 옵션으로 찾지 못한다. 세공, 인챈트 같은 상세 검색은 매물을 전부 받아 거를
 * 수밖에 없는데, 한 번에 500건씩 앞 쪽의 커서를 받아야 다음 쪽을 부를 수 있다. 모자/가발만 14쪽이라
 * 검색 한 번에 6초가 넘게 걸렸다. 쪽을 한꺼번에 불러도 넥슨이 줄을 세워 초당 2쪽 남짓이다.
 *
 * 그래서 크론이 10분마다 장비 카테고리를 전부 받아 R2 에 카테고리별 파일로 올려 둔다. 화면은 이
 * 파일을 CDN(ICON_BASE_URL, 그림과 같은 도메인)에서 받아 거른다. 2026-09 실측으로 32곳이 99쪽,
 * 40,033건이고 동시에 4곳씩 받아 42초 걸렸다. 가장 큰 파일(천옷)도 CDN 이 압축해 300KB 안팎이다.
 *
 *   ICONS           (R2 바인딩, 필수) 그림과 같은 버킷. auction/ 아래에 둔다
 *   ICON_BASE_URL   (Variable, 필수) 파일을 내보낼 주소. 없으면 화면은 예전처럼 실시간으로 받는다
 *
 * 파일 이름에 모은 시각을 넣는다(auction/<시각>/<카테고리 해시>.js). 이름이 바뀌므로 CDN 에 오래
 * 붙잡아도 옛것이 나가지 않는다. 확장자가 .js 인 것은 그림 목록과 같은 이유다(자체 도메인은 .js 를
 * 기본으로 캐시한다). 어느 파일이 최신인지는 목록 파일(manifest)이 말하고, 목록은 워커가 짧게만
 * 캐시해 내보낸다(GET /auction/snapshot).
 *
 * 받다가 실패한 카테고리는 지난번 파일을 그대로 가리킨다. 카테고리마다 모은 시각이 따로 있어
 * 화면이 얼마나 묵은 것인지 알 수 있다. 새 목록과 바로 앞 목록이 가리키지 않는 파일은 지운다.
 * 앞 목록을 남기는 것은 막 목록을 받아 간 화면이 파일을 받을 수 있게 하려는 것이다.
 */

const NEXON_LIST_URL = 'https://open.api.nexon.com/mabinogi/v1/auction/list';

export const SNAPSHOT_PATH = '/auction/snapshot';
export const SNAPSHOT_COLLECT_PATH = '/auction/snapshot/collect';

const PREFIX = 'auction/';
const MANIFEST_KEY = `${PREFIX}manifest.json`;

/** 모을 카테고리. 화면의 EQUIPMENT_CATEGORIES(src/features/equipment/api.ts)와 같다. */
export const SNAPSHOT_CATEGORIES = [
  '검',
  '경갑옷',
  '기타 장비',
  '너클',
  '대형 낫',
  '도끼',
  '둔기',
  '듀얼건',
  '랜스',
  '마도서',
  '모자/가발',
  '방패',
  '생활 도구',
  '석궁',
  '수리검',
  '스태프',
  '신발',
  '실린더',
  '아틀라틀',
  '악기',
  '액세서리',
  '양손 장비',
  '오브',
  '원드',
  '장갑',
  '중갑옷',
  '천옷',
  '체인 블레이드',
  '한손 장비',
  '핸들',
  '활',
  '힐링 원드',
];

/** 동시에 받는 카테고리 수. 넥슨이 줄을 세우므로 더 늘려도 빨라지지 않고 거래 내역 수집만 밀린다. */
const CONCURRENCY = 4;

/** 한 카테고리에서 받을 쪽 수 상한. 가장 큰 천옷이 16쪽이다. 커서가 끝없이 이어지는 사고를 막는다. */
const MAX_PAGES = 60;

/** 한 쪽을 받다 실패하면 이만큼 더 해 본다. 넥슨이 가끔 한 번씩 늦거나 끊는다. */
const PAGE_RETRIES = 2;

/** 이름에 시각이 들어 있어 내용이 바뀌지 않는다. */
const FILE_CACHE = 'public, max-age=86400, immutable';

/** 목록은 크론 주기보다 훨씬 짧게. 새로 모은 것이 늦게 보이지 않게 한다. */
const MANIFEST_CACHE_SECONDS = 30;

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 옵션 하나를 [종류, 세부, 값, 값2, 설명] 으로 줄인다. 끝의 빈 칸은 뗀다. */
function compactOption(option) {
  const row = [
    option?.option_type ?? null,
    option?.option_sub_type ?? null,
    option?.option_value ?? null,
    option?.option_value2 ?? null,
    option?.option_desc ?? null,
  ];
  while (row.length > 0 && row[row.length - 1] === null) row.pop();
  return row;
}

/**
 * 매물 하나를 [원래 이름, 보이는 이름, 수량, 개당 가격, 만료(초), 옵션] 으로 줄인다.
 * 원래 이름이 보이는 이름과 같으면 0 으로 둔다. 대부분 같아서 크기가 꽤 준다.
 * 원래 모양의 3분의 1 이다. 화면의 decodeSnapshotItems 가 되돌린다.
 */
export function compactItem(item) {
  const display = String(item?.item_display_name ?? '');
  const name = String(item?.item_name ?? '');
  return [
    name === display ? 0 : name,
    display,
    Number(item?.item_count) || 0,
    Number(item?.auction_price_per_unit) || 0,
    Math.floor(Date.parse(item?.date_auction_expire) / 1000) || 0,
    Array.isArray(item?.item_option) ? item.item_option.map(compactOption) : [],
  ];
}

async function fetchListPage(env, category, cursor) {
  const url = new URL(NEXON_LIST_URL);
  url.searchParams.set('auction_item_category', category);
  if (cursor) url.searchParams.set('cursor', cursor);
  let lastError;
  for (let attempt = 0; attempt <= PAGE_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url.toString(), {
        headers: { accept: 'application/json', 'x-nxopen-api-key': env.NEXON_API_KEY },
      });
      if (response.ok) return await response.json();
      lastError = new Error(`경매장 목록 HTTP ${response.status}`);
      // 요청이 틀린 것은 다시 해도 같다.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
    } catch (caught) {
      lastError = caught;
    }
  }
  throw lastError;
}

/** 한 카테고리를 끝까지 받아 줄인 매물을 돌려준다. 가격이 싼 순이다. */
async function collectCategory(env, category) {
  const items = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await fetchListPage(env, category, cursor);
    for (const item of body?.auction_item ?? []) items.push(compactItem(item));
    if (!body?.next_cursor) return items.sort((a, b) => a[3] - b[3]);
    cursor = body.next_cursor;
  }
  throw new Error(`${category}: ${MAX_PAGES}쪽을 넘었습니다.`);
}

async function readManifest(env) {
  const object = await env.ICONS.get(MANIFEST_KEY);
  if (!object) return null;
  try {
    return JSON.parse(typeof object.text === 'function' ? await object.text() : String(object.body));
  } catch {
    return null;
  }
}

/** R2 목록을 끝까지 넘긴다. */
async function listKeys(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await env.ICONS.list({ prefix, cursor, limit: 1000 });
    for (const object of page.objects ?? []) keys.push(object.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

/**
 * 장비 카테고리를 전부 받아 올리고 목록을 바꾼다. 크론이 부르고, 운영자가 손으로 부를 수도 있다.
 */
export async function collectSnapshot(env, now = Date.now()) {
  if (!env.ICONS) return { skipped: 'ICONS 바인딩이 없습니다.' };
  if (!env.NEXON_API_KEY) return { skipped: 'NEXON_API_KEY 가 없습니다.' };

  const previous = await readManifest(env);
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const categories = {};
  const failed = [];
  let total = 0;

  const queue = [...SNAPSHOT_CATEGORIES];
  const work = async () => {
    while (queue.length > 0) {
      const category = queue.shift();
      const startedAt = Date.now();
      try {
        const items = await collectCategory(env, category);
        const file = `${PREFIX}${stamp}/${(await sha256Hex(category)).slice(0, 8)}.js`;
        await env.ICONS.put(file, JSON.stringify({ category, at: startedAt, items }), {
          httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: FILE_CACHE },
        });
        categories[category] = { file, at: startedAt, count: items.length };
        total += items.length;
      } catch (caught) {
        failed.push(`${category}: ${caught instanceof Error ? caught.message : String(caught)}`);
        const kept = previous?.categories?.[category];
        if (kept) categories[category] = kept;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, work));

  const manifest = { at: now, categories };
  await env.ICONS.put(MANIFEST_KEY, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' },
  });

  // 새 목록과 바로 앞 목록이 가리키는 파일만 남긴다.
  const keep = new Set([MANIFEST_KEY]);
  for (const entry of Object.values(categories)) keep.add(entry.file);
  for (const entry of Object.values(previous?.categories ?? {})) keep.add(entry.file);
  const stale = (await listKeys(env, PREFIX)).filter((key) => !keep.has(key));
  for (let i = 0; i < stale.length; i += 1000) await env.ICONS.delete(stale.slice(i, i + 1000));

  return {
    categories: Object.keys(categories).length,
    items: total,
    failed,
    removed: stale.length,
    seconds: Math.round((Date.now() - now) / 1000),
  };
}

/**
 * 화면이 받는 목록. 파일 주소를 붙여 준다. 아직 모은 적이 없거나 내보낼 주소가 없으면 404 라
 * 화면은 실시간으로 받는다.
 */
export async function serveSnapshot(env, cors) {
  const base = String(env.ICON_BASE_URL ?? '').replace(/\/+$/, '');
  const manifest = env.ICONS && base ? await readManifest(env) : null;
  if (!manifest) {
    return new Response(
      JSON.stringify({ error: { name: 'SNAPSHOT_NOT_READY', message: '모아 둔 매물이 없습니다.' } }),
      {
        status: 404,
        headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      },
    );
  }
  return new Response(JSON.stringify({ ...manifest, base }), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${MANIFEST_CACHE_SECONDS}`,
    },
  });
}

/** 운영자가 크론을 기다리지 않고 지금 한 번 모을 때. */
export async function snapshotCollect(env, cors) {
  const result = await collectSnapshot(env);
  return new Response(JSON.stringify(result), {
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
