import { describe, expect, it } from 'vitest';
import type { AuctionItem } from '@/features/auction/types';
import {
  emptyColorChannel,
  emptyColorChannels,
  type ColorChannels,
} from '@/features/colorChannels';
import { bagColorsOf, buildAuctionBagListings } from './auction';

const color = (part: string, value: string) => ({
  option_type: '아이템 색상',
  option_sub_type: `파트 ${part}`,
  option_value: value,
});

function bag(name: string, price: number, colors: Record<string, string>): AuctionItem {
  return {
    item_name: name,
    item_display_name: name,
    item_count: 1,
    auction_item_category: '주머니',
    auction_price_per_unit: price,
    date_auction_expire: '2026-10-10T00:00:00Z',
    item_option: Object.entries(colors).map(([part, value]) => color(part, value)),
  };
}

/** 빨강이 200 이상인 조건. */
const reddish = (): ColorChannels => ({
  ...emptyColorChannels(),
  r: { ...emptyColorChannel(), min: 200 },
});

describe('경매장 주머니 색', () => {
  it('파트 A, B, C 의 "r,g,b" 를 16진수로 읽고, 빠진 파트에서 멈춘다', () => {
    expect(bagColorsOf(bag('튼튼한 감자 주머니', 1, { A: '255,0,16', B: '1,2,3' }))).toEqual([
      'ff0010',
      '010203',
    ]);
    expect(bagColorsOf(bag('튼튼한 감자 주머니', 1, { B: '1,2,3' }))).toEqual([]);
    expect(bagColorsOf(bag('튼튼한 감자 주머니', 1, { A: '256,0,0' }))).toEqual([]);
  });
});

describe('경매장 주머니 목록', () => {
  const items = [
    bag('튼튼한 감자 주머니', 3000, { A: '250,0,0' }),
    bag('튼튼한 감자 주머니', 1000, { A: '10,10,10' }),
    bag('튼튼한 밀 주머니', 2000, { A: '210,0,0' }),
    // 같은 카테고리에 섞여 오는 일반 주머니. 튼튼한 주머니가 아니라 빠진다.
    bag('양털 주머니', 500, { A: '250,0,0' }),
  ];

  it('일반 주머니는 빼고, 조건이 없으면 튼튼한 주머니를 모두 싼 순으로 늘어놓는다', () => {
    const rows = buildAuctionBagListings(items, { bagNames: null, parts: [] });
    expect(rows.map((row) => row.price)).toEqual([1000, 2000, 3000]);
    expect(rows.every((row) => row.score === null)).toBe(true);
  });

  it('주머니 종류와 파트 색으로 거르고 가까운 순으로 늘어놓는다', () => {
    const rows = buildAuctionBagListings(items, { bagNames: null, parts: [reddish()] });
    // 범위는 가운데(200~255 의 227.5)와 가까울수록 앞이다. NPC 상점과 같은 규칙이다.
    expect(rows.map((row) => row.price)).toEqual([2000, 3000]);
    expect(rows[0].comparedParts).toEqual([0]);
    const potato = buildAuctionBagListings(items, {
      bagNames: new Set(['튼튼한 감자 주머니']),
      parts: [reddish()],
    });
    expect(potato.map((row) => row.price)).toEqual([3000]);
  });
});
