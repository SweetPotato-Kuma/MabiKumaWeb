import { describe, expect, it } from 'vitest';
import { calculatePriceStats } from './stats';
import type { AuctionItem } from './types';

function item(price: number, count = 1): AuctionItem {
  return {
    item_name: '롱 소드',
    item_display_name: '롱 소드',
    item_count: count,
    auction_item_category: '검',
    auction_price_per_unit: price,
    date_auction_expire: '2026-01-01T00:00:00Z',
  };
}

describe('calculatePriceStats', () => {
  it('빈 목록은 null 을 돌려준다', () => {
    expect(calculatePriceStats([])).toBeNull();
  });

  it('홀수 개일 때 중위값은 가운데 값이다', () => {
    const stats = calculatePriceStats([item(300), item(100), item(200)]);
    expect(stats).not.toBeNull();
    expect(stats?.min).toBe(100);
    expect(stats?.max).toBe(300);
    expect(stats?.median).toBe(200);
    expect(stats?.average).toBe(200);
    expect(stats?.count).toBe(3);
  });

  it('짝수 개일 때 중위값은 가운데 두 값의 평균이다', () => {
    const stats = calculatePriceStats([item(100), item(200), item(300), item(1000)]);
    expect(stats?.median).toBe(250);
  });

  it('총 수량을 합산한다', () => {
    const stats = calculatePriceStats([item(100, 5), item(200, 3)]);
    expect(stats?.totalCount).toBe(8);
  });
});
