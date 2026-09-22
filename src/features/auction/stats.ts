import type { AuctionItem } from './types';

export interface PriceStats {
  count: number;
  min: number;
  max: number;
  median: number;
  average: number;
  /** 총 판매 수량 합계 */
  totalCount: number;
}

/**
 * 매물 목록에서 개당 가격 통계를 뽑는다.
 * 평균만 보면 터무니없는 호가에 끌려가므로 중위값을 함께 보여준다.
 */
export function calculatePriceStats(items: readonly AuctionItem[]): PriceStats | null {
  const prices = items
    .map((item) => item.auction_price_per_unit)
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price))
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;

  const sum = prices.reduce((acc, price) => acc + price, 0);
  const middle = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0 ? ((prices[middle - 1] ?? 0) + (prices[middle] ?? 0)) / 2 : prices[middle];

  return {
    count: prices.length,
    min: prices[0] ?? 0,
    max: prices[prices.length - 1] ?? 0,
    median: median ?? 0,
    average: Math.round(sum / prices.length),
    totalCount: items.reduce((acc, item) => acc + (item.item_count ?? 0), 0),
  };
}
