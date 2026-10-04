/**
 * 이름으로 묻는 시세 모아 두기.
 *
 * 던전 코인 화면은 교환품과 가공 재료 80여 종의 시세를 이름마다 한 번씩 묻는다. 넥슨이 요청을
 * 줄 세우고 화면은 동시에 4개씩만 보내서, 다 받는 데 10초 넘게 걸렸다. 크론이 10분마다 그 이름들을
 * 받아 파일 하나로 R2 에 올려 두면 화면은 CDN(ICON_BASE_URL)에서 그 파일 하나만 받으면 된다.
 *
 *   ICONS           (R2 바인딩, 필수) 그림과 같은 버킷. prices/ 아래에 둔다
 *   ICON_BASE_URL   (Variable) 화면이 파일을 받는 주소. 없으면 화면은 예전처럼 하나씩 묻는다
 *
 * 모을 이름은 화면과 같은 목록을 쓴다. 던전 코인은 src/features/dungeonCoins/priceNames.json(화면 쪽 테스트가
 * 그 목록이 화면이 묻는 이름을 모두 담고 있는지 본다), 탈틴 농장 계산기는 그 데이터가 내보내는 이름 목록이다.
 *
 * 파일 이름은 고정이다(prices/dungeon-coins.js). 캐시를 짧게 걸어 CDN 이 1분 안에 새것을 받는다.
 * 확장자가 .js 인 것은 매물 파일과 같은 이유다(자체 도메인은 .js 를 기본으로 캐시한다).
 * 받다가 실패한 이름은 지난번 값을 모은 시각과 함께 그대로 둔다.
 */
import DUNGEON_PRICE_NAMES from '../src/features/dungeonCoins/priceNames.json';
import { FARM_PRICE_NAMES } from '../src/features/taltinFarm/data';
import { isListingOf, listingNameOf } from '../src/features/crafting/listing';

/** 모을 이름 전부. 두 화면이 같이 묻는 이름은 한 번만 받는다. */
const PRICE_NAMES = [...new Set([...DUNGEON_PRICE_NAMES, ...FARM_PRICE_NAMES])];

const NEXON_LIST_URL = 'https://open.api.nexon.com/mabinogi/v1/auction/list';

export const PRICE_FILE = 'prices/dungeon-coins.js';
export const PRICE_COLLECT_PATH = '/prices/collect';

/** 이 크론일 때 시세를 모은다. 장비 매물(10분마다 정각)과 겹치지 않게 5분 어긋나게 돈다. */
export const PRICE_CRON = '5,15,25,35,45,55 * * * *';

/** 동시에 묻는 이름 수. 넥슨이 줄을 세우므로 더 늘려도 빨라지지 않는다. */
const CONCURRENCY = 4;

/** 한 이름에서 받을 쪽 수 상한. 화면의 시세 조회(src/features/crafting/market.ts)와 같다. */
const MAX_PAGES = 4;

/** 한 쪽을 받다 실패하면 이만큼 더 해 본다. */
const PAGE_RETRIES = 2;

/**
 * 이름마다 남길 매물 수. 싼 것부터 남긴다. 화면은 재료를 많아야 100개 남짓 채우고 판매가는
 * 가장 싼 하나만 보므로 이만큼이면 넉넉하다. 파일을 작게 두려는 것이다.
 */
const MAX_OFFERS = 100;

const FILE_CACHE = 'public, max-age=60';

async function fetchPage(env, name, cursor) {
  const url = new URL(NEXON_LIST_URL);
  url.searchParams.set('item_name', name);
  if (cursor) url.searchParams.set('cursor', cursor);
  let lastError;
  for (let attempt = 0; attempt <= PAGE_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url.toString(), {
        headers: { accept: 'application/json', 'x-nxopen-api-key': env.NEXON_API_KEY },
      });
      if (response.ok) return await response.json();
      // 경매장에 올릴 수 없는 이름은 파라미터 오류로 온다. 매물이 없는 것과 같다.
      if (response.status === 400) {
        const body = await response.json().catch(() => null);
        if (body?.error?.name === 'OPENAPI00004') return { auction_item: [] };
      }
      lastError = new Error(`경매장 목록 HTTP ${response.status}`);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
    } catch (caught) {
      lastError = caught;
    }
  }
  throw lastError;
}

/**
 * 경매장에 item_name 으로 묻는 이름 하나의 매물을 모두 받는다. complete 는 끝까지 받았는지다.
 * 옷본과 도면은 종류째 오므로 한 번 받은 것을 이름마다 나눠 쓴다.
 */
async function fetchListing(env, listing) {
  const items = [];
  let cursor = '';
  let complete = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await fetchPage(env, listing, cursor);
    items.push(...(body?.auction_item ?? []));
    if (!body?.next_cursor) {
      complete = true;
      break;
    }
    cursor = body.next_cursor;
  }
  return { items, complete };
}

/**
 * 받아 둔 매물에서 한 이름의 것을 [개당 가격, 개수] 로 줄여 싼 순으로 돌려준다. complete 는 매물을
 * 끝까지 받았고 잘라 내지 않았는지다.
 */
function offersOf({ items, complete }, name) {
  const offers = [];
  for (const item of items) {
    const price = Number(item?.auction_price_per_unit) || 0;
    const count = Number(item?.item_count) || 0;
    // 이름으로 물었으니 모두 같은 아이템이어야 하지만, 섞여 오면 값이 틀어지므로 거른다.
    if (isListingOf(item ?? {}, name) && price > 0 && count > 0) offers.push([price, count]);
  }
  offers.sort((a, b) => a[0] - b[0]);
  return {
    offers: offers.slice(0, MAX_OFFERS),
    complete: complete && offers.length <= MAX_OFFERS,
  };
}

async function readPrices(env) {
  const object = await env.ICONS.get(PRICE_FILE);
  if (!object) return null;
  try {
    return JSON.parse(typeof object.text === 'function' ? await object.text() : String(object.body));
  } catch {
    return null;
  }
}

/** 이름을 모두 받아 파일 하나로 올린다. 크론이 부르고, 운영자가 손으로 부를 수도 있다. */
export async function collectPrices(env, now = Date.now(), names = PRICE_NAMES) {
  if (!env.ICONS) return { skipped: 'ICONS 바인딩이 없습니다.' };
  if (!env.NEXON_API_KEY) return { skipped: 'NEXON_API_KEY 가 없습니다.' };

  const previous = await readPrices(env);
  const prices = {};
  const failed = [];
  const byListing = new Map();
  for (const name of names) {
    const listing = listingNameOf(name);
    byListing.set(listing, [...(byListing.get(listing) ?? []), name]);
  }
  const queue = [...byListing];
  const work = async () => {
    while (queue.length > 0) {
      const [listing, group] = queue.shift();
      const startedAt = Date.now();
      try {
        const received = await fetchListing(env, listing);
        for (const name of group) prices[name] = { at: startedAt, ...offersOf(received, name) };
      } catch (caught) {
        for (const name of group) {
          failed.push(`${name}: ${caught instanceof Error ? caught.message : String(caught)}`);
          const kept = previous?.prices?.[name];
          if (kept) prices[name] = kept;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, work));

  await env.ICONS.put(PRICE_FILE, JSON.stringify({ at: now, prices }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: FILE_CACHE },
  });
  return {
    names: Object.keys(prices).length,
    failed,
    seconds: Math.round((Date.now() - now) / 1000),
  };
}

/** 운영자가 크론을 기다리지 않고 지금 한 번 모을 때. */
export async function pricesCollect(env, cors) {
  const result = await collectPrices(env);
  return new Response(JSON.stringify(result), {
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
