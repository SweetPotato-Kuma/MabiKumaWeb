import { describe, expect, it } from 'vitest';
import type { PriceState } from '@/features/crafting/market';
import { costOf, isCostComplete, priceNamesOf, sumCosts } from './cost';

const market = (...offers: [price: number, count: number][]): PriceState => ({
  status: 'ok',
  price: {
    offers: offers.map(([price, count]) => ({ price, count })),
    supply: offers.reduce((sum, [, count]) => sum + count, 0),
    complete: true,
  },
});

describe('costOf', () => {
  it('경매장 재료는 싼 매물부터 필요한 개수만큼 채운 값이다', () => {
    const cost = costOf(7, { tradable: true, price: market([100, 5], [150, 10]) });
    expect(cost).toEqual({ status: 'ok', gold: 5 * 100 + 2 * 150, source: 'auction', shortfall: false });
  });

  it('매물이 모자라면 채운 만큼만 값에 넣고 모자람을 알린다', () => {
    const cost = costOf(10, { tradable: true, price: market([100, 4]) });
    expect(cost).toMatchObject({ status: 'ok', gold: 400, shortfall: true });
  });

  it('NPC 가 파는 재료는 거래 여부와 상관없이 NPC 값이다', () => {
    expect(costOf(3, { tradable: false, npcUnit: 50 })).toMatchObject({ gold: 150, source: 'npc' });
    expect(costOf(3, { tradable: true, npcUnit: 50, price: market([10, 9]) })).toMatchObject({
      gold: 150,
      source: 'npc',
    });
  });

  it('값을 모르는 경우를 가른다', () => {
    expect(costOf(1, { tradable: false }).status).toBe('untradable');
    expect(costOf(1, { tradable: true }).status).toBe('loading');
    expect(costOf(1, { tradable: true, price: { status: 'loading' } }).status).toBe('loading');
    expect(costOf(1, { tradable: true, price: { status: 'error', error: null } }).status).toBe('error');
    expect(costOf(1, { tradable: true, price: market() }).status).toBe('empty');
  });

  it('필요한 개수가 없으면 시세를 묻지 않아도 0 이다', () => {
    expect(costOf(0, { tradable: true })).toEqual({ status: 'ok', gold: 0, shortfall: false });
  });
});

describe('sumCosts', () => {
  it('값을 모르는 재료와 받는 중인 재료를 따로 센다', () => {
    const total = sumCosts([
      costOf(1, { tradable: true, price: market([100, 5]) }),
      costOf(1, { tradable: true }),
      costOf(1, { tradable: false }),
      costOf(9, { tradable: true, price: market([10, 2]) }),
    ]);
    expect(total).toEqual({ gold: 120, pending: 1, unknown: 1, shortfall: 1 });
    expect(isCostComplete(total)).toBe(false);
    expect(isCostComplete(sumCosts([costOf(1, { tradable: false, npcUnit: 5 })]))).toBe(true);
  });
});

describe('priceNamesOf', () => {
  it('모자란 재료 가운데 경매장에서만 사는 것의 이름만 묻는다', () => {
    const names: Record<number, string> = { 1: '철괴', 2: '가죽', 3: '실', 4: '시위' };
    const rows = [
      { itemId: 1, required: 3, owned: 0, short: 3 },
      { itemId: 2, required: 3, owned: 3, short: 0 },
      { itemId: 3, required: 3, owned: 0, short: 3 },
      { itemId: 4, required: 3, owned: 0, short: 3 },
    ];
    expect(
      priceNamesOf(
        rows,
        (id) => names[id],
        (id) => id !== 4,
        (id) => (id === 3 ? 100 : undefined),
      ),
    ).toEqual(['철괴']);
  });
});
