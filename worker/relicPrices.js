/**
 * 무리아스의 유물 시세 모아 두기.
 *
 * 복원 시뮬레이터는 나온 유물(옵션 문장 하나)에 시세를 바로 붙여야 한다. 화면이 유물 매물 목록,
 * 그 파일, 최종 거래가를 따로 받으면 요청 세 번을 차례로 기다려 몇 초씩 걸렸다. 매물을 모으는 크론이
 * 유물 카테고리를 받은 김에 옵션 문장마다 가장 싼 값과 최종 거래가를 파일 하나로 줄여 R2 에 올린다.
 * 화면은 CDN(ICON_BASE_URL)에서 이 작은 파일 하나만 받고, 받은 것을 브라우저에 남겨 다음에는
 * 기다리지 않는다.
 *
 * 파일 이름은 고정이다(prices/murias-relics.js). 던전 코인 시세 파일과 같은 이유로 캐시를 짧게 건다.
 */
import { lastTradesByOption } from './market.js';

export const RELIC_PRICE_FILE = 'prices/murias-relics.js';

/** 화면의 MURIAS_RELIC_NAME, MURIAS_OPTION_TYPE(src/features/relics/murias.ts)과 같다. */
const MURIAS_NAME = '무리아스의 유물';
const MURIAS_OPTION_TYPE = '무리아스 유물';
const IDEA = /\s*\(이데아\)\s*$/;

const FILE_CACHE = 'public, max-age=60';

/**
 * 모아 둔 유물 매물(compactItem 모양)을 옵션 문장마다 [문장, 가장 싼 개당 가격, 매물 수] 로 줄인다.
 * 옵션이 없는 이데아는 따로 [가장 싼 값, 매물 수] 로 센다. 문장을 레벨로 읽는 일은 화면이 한다.
 */
export function summarizeRelicOffers(items) {
  const offers = new Map();
  let idea = null;
  for (const item of items ?? []) {
    const name = String(item?.[0] === 0 ? item?.[1] : item?.[0]);
    if (!name.startsWith(MURIAS_NAME)) continue;
    const price = Number(item?.[3]);
    if (!(price > 0)) continue;
    const option = (Array.isArray(item?.[5]) ? item[5] : []).find(
      (row) => row?.[0] === MURIAS_OPTION_TYPE,
    );
    const text = typeof option?.[2] === 'string' ? option[2].trim() : '';
    if (!text) {
      if (IDEA.test(name)) idea = idea ? [Math.min(idea[0], price), idea[1] + 1] : [price, 1];
      continue;
    }
    const previous = offers.get(text);
    offers.set(text, previous ? [Math.min(previous[0], price), previous[1] + 1] : [price, 1]);
  }
  return {
    idea,
    offers: [...offers.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([text, [lowest, count]]) => [text, lowest, count]),
  };
}

async function readPrevious(env) {
  const object = await env.ICONS.get(RELIC_PRICE_FILE);
  if (!object) return null;
  try {
    return JSON.parse(
      typeof object.text === 'function' ? await object.text() : String(object.body),
    );
  } catch {
    return null;
  }
}

/**
 * 유물 매물로 시세 파일을 새로 쓴다. 최종 거래가는 거래 기록(D1)에서 읽고, 읽지 못하면 지난번
 * 파일의 것을 그대로 둔다. at 은 매물을 받은 시각이다.
 */
export async function writeRelicPrices(env, items, at) {
  const { idea, offers } = summarizeRelicOffers(items);
  let trades = null;
  if (env.MARKET) {
    try {
      trades = await lastTradesByOption(env.MARKET, MURIAS_NAME, MURIAS_OPTION_TYPE);
    } catch {
      trades = null;
    }
  }
  if (trades === null) trades = (await readPrevious(env))?.trades ?? [];
  await env.ICONS.put(RELIC_PRICE_FILE, JSON.stringify({ at, idea, offers, trades }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: FILE_CACHE },
  });
  return { offers: offers.length, trades: trades.length };
}
