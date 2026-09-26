import { describe, expect, it } from 'vitest';
import type { PriceState } from '@/features/crafting/market';
import { DUNGEON_COINS, dungeonCoinOf } from './exchanges';
import { rankExchanges, valueOf } from './value';

function priced(...prices: number[]): PriceState {
  return {
    status: 'ok',
    price: {
      offers: prices.map((price) => ({ price, count: 1 })),
      supply: prices.length,
      complete: true,
    },
  };
}

const EXCHANGES = [
  { id: 1, name: '코어', cost: 100 },
  { id: 2, name: '마력석', cost: 3 },
  { id: 3, name: '에르그 결정', cost: 7 },
  { id: 4, name: '자수실', cost: 3 },
];

describe('valueOf', () => {
  it('최저가를 코인 개수로 나누고 골드 아래는 버린다', () => {
    expect(valueOf({ id: 1, name: '마력석', cost: 3 }, priced(1_050_000, 2_000_000))).toEqual({
      status: 'ok',
      lowest: 1_050_000,
      perCoin: 350_000,
    });
    expect(valueOf({ id: 1, name: '자수실', cost: 3 }, priced(78_999))).toMatchObject({
      perCoin: 26_333,
    });
  });

  it('매물이 없으면 없다고, 받는 중이거나 실패했으면 그대로 알린다', () => {
    const exchange = { id: 1, name: '결정', cost: 7 };
    expect(valueOf(exchange, priced())).toEqual({ status: 'none' });
    expect(valueOf(exchange, undefined)).toEqual({ status: 'loading' });
    expect(valueOf(exchange, { status: 'loading' })).toEqual({ status: 'loading' });
    expect(valueOf(exchange, { status: 'error', error: new Error('x') })).toEqual({
      status: 'error',
    });
  });
});

describe('rankExchanges', () => {
  it('코인 1개당 가치가 높은 순으로 세우고 가장 높은 줄을 표시한다', () => {
    const prices = new Map<string, PriceState>([
      ['코어', priced(37_000_000)],
      ['마력석', priced(1_050_000)],
      ['에르그 결정', priced()],
      ['자수실', { status: 'loading' }],
    ]);
    const rows = rankExchanges(EXCHANGES, prices);
    expect(rows.map((row) => row.name)).toEqual(['코어', '마력석', '에르그 결정', '자수실']);
    expect(rows.map((row) => row.best)).toEqual([true, false, false, false]);
  });

  it('값을 아는 줄이 없으면 원래 순서를 지키고 아무것도 표시하지 않는다', () => {
    const rows = rankExchanges(EXCHANGES, new Map());
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4]);
    expect(rows.some((row) => row.best)).toBe(false);
  });

  it('가치가 같은 줄은 모두 가장 높은 줄이다', () => {
    const prices = new Map<string, PriceState>([
      ['마력석', priced(300)],
      ['자수실', priced(300)],
    ]);
    const rows = rankExchanges(EXCHANGES, prices);
    expect(rows.filter((row) => row.best).map((row) => row.name)).toEqual(['마력석', '자수실']);
  });
});

describe('교환 표', () => {
  it('던전마다 주소 키가 다르고, 한 던전 안에서 같은 교환품이 두 번 나오지 않는다', () => {
    expect(new Set(DUNGEON_COINS.map((entry) => entry.key)).size).toBe(DUNGEON_COINS.length);
    for (const entry of DUNGEON_COINS) {
      const names = entry.exchanges.map((exchange) => exchange.name);
      expect(new Set(names).size).toBe(names.length);
      for (const exchange of entry.exchanges) expect(exchange.cost).toBeGreaterThan(0);
    }
  });

  it('모르는 키는 첫 던전으로 연다', () => {
    expect(dungeonCoinOf('tala-gah').dungeon).toBe('탈라 가흐');
    expect(dungeonCoinOf('nope')).toBe(DUNGEON_COINS[0]);
    expect(dungeonCoinOf(null)).toBe(DUNGEON_COINS[0]);
  });
});
