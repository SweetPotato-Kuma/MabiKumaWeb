import { useQueries } from '@tanstack/react-query';
import { fetchAuctionList } from '@/features/auction/api';
import type { AuctionItem } from '@/features/auction/types';
import { NexonApiError } from '@/lib/nexonClient';

/**
 * 재료 시세.
 *
 * 재료 이름을 정확히 알고 있으므로 auction/list 의 item_name 으로 그 아이템 매물만 받는다.
 * keyword-search 는 이름이 겹치는 다른 아이템까지 섞어 준다.
 *
 * 값은 "최저가 x 개수" 가 아니라 **싼 매물부터 필요한 개수만큼 채운 합**이다. 철괴 100개가
 * 필요한데 최저가 매물이 55개뿐이면 나머지 45개는 다음 가격에 사야 한다.
 */

/** 매물 한 칸. */
export interface Offer {
  price: number;
  count: number;
}

export interface MarketPrice {
  /** 개당 가격 오름차순. */
  offers: Offer[];
  /** 올라와 있는 총 개수. */
  supply: number;
  /** 매물을 끝까지 받았는지. 쪽수 제한에 걸렸으면 더 있을 수 있다. */
  complete: boolean;
}

export interface BuyQuote {
  /** 채운 개수의 값. */
  cost: number;
  /** 매물로 채운 개수. 필요한 개수보다 적으면 매물이 모자란 것이다. */
  filled: number;
  /** 가장 싼 매물의 개당 가격. 매물이 없으면 undefined. */
  lowest?: number;
}

/**
 * 한 아이템 매물은 보통 한 쪽(수백 건)에 다 들어온다. 더 많아도 싼 쪽은 앞에 몰려 있지 않아
 * 전부 받아야 하지만, 호출량을 지키려고 몇 쪽에서 멈추고 그 사실을 complete 로 남긴다.
 */
const MAX_PAGES = 4;

/** 한꺼번에 보내는 시세 요청 수. 재료 수십 종을 동시에 쏘면 API 호출량 제한에 걸린다. */
const MAX_CONCURRENT = 4;

const FIVE_MINUTES = 5 * 60 * 1000;

export function summarizeListings(
  items: readonly AuctionItem[],
  name: string,
  complete: boolean,
): MarketPrice {
  const offers = items
    // 이름으로 물었으니 모두 같은 아이템이어야 하지만, 혹시 섞여 오면 값이 틀어지므로 거른다.
    .filter(
      (item) => item.item_name === name && item.auction_price_per_unit > 0 && item.item_count > 0,
    )
    .map((item) => ({ price: item.auction_price_per_unit, count: item.item_count }))
    .sort((a, b) => a.price - b.price);
  return { offers, supply: offers.reduce((sum, offer) => sum + offer.count, 0), complete };
}

/** 싼 매물부터 count 개를 채운 값. */
export function quoteBuy(price: MarketPrice, count: number): BuyQuote {
  let cost = 0;
  let filled = 0;
  for (const offer of price.offers) {
    if (filled >= count) break;
    const take = Math.min(offer.count, count - filled);
    cost += take * offer.price;
    filled += take;
  }
  return { cost, filled, lowest: price.offers[0]?.price };
}

let running = 0;
const waiting: (() => void)[] = [];

/** 동시에 MAX_CONCURRENT 개까지만 돌린다. 나머지는 앞의 것이 끝나면 차례로 나간다. */
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

export async function fetchMarketPrice(name: string, signal?: AbortSignal): Promise<MarketPrice> {
  const items: AuctionItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let response;
    try {
      response = await limited(() => fetchAuctionList({ itemName: name, cursor }, signal));
    } catch (error) {
      // 경매장이 모르는 이름은 빈 목록이 아니라 파라미터 오류(OPENAPI00004)로 온다.
      // 거래는 되지만 경매장에 올릴 수 없는 아이템이 그렇다. 매물이 없는 것과 같다.
      if (error instanceof NexonApiError && error.code === 'OPENAPI00004')
        return summarizeListings([], name, true);
      throw error;
    }
    items.push(...(response.auction_item ?? []));
    if (!response.next_cursor) return summarizeListings(items, name, true);
    cursor = response.next_cursor;
  }
  return summarizeListings(items, name, false);
}

export type PriceState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ok'; price: MarketPrice };

/** 이름마다 시세. 같은 이름은 5분 동안 다시 묻지 않는다. */
export function useMarketPrices(names: readonly string[]): Map<string, PriceState> {
  return useQueries({
    queries: names.map((name) => ({
      queryKey: ['crafting', 'price', name],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchMarketPrice(name, signal),
      staleTime: FIVE_MINUTES,
      retry: false,
    })),
    combine: (results) => {
      const map = new Map<string, PriceState>();
      results.forEach((result, index) => {
        const state: PriceState = result.data
          ? { status: 'ok', price: result.data }
          : result.error
            ? { status: 'error', error: result.error }
            : { status: 'loading' };
        map.set(names[index], state);
      });
      return map;
    },
  });
}
