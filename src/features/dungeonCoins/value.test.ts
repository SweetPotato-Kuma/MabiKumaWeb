import { describe, expect, it } from 'vitest';
import type { PriceState } from '@/features/crafting/market';
import { DUNGEON_COINS, dungeonCoinOf } from './exchanges';
import { LOW_VOLUME, rankExchanges, tradeOf, valueOf, type TradeStats } from './value';

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

const recent = (mid: number, qty: number) => ({ n: 3, qty, lo: mid, hi: mid, mid, avg: mid, last: '2026-09-30T00:00:00Z' });
const statsOf = (items: TradeStats['items'], loading = false): TradeStats => ({ items, loading });

describe('거래가 기준 값', () => {
  it('24시간 거래 중위가를 코인 개수로 나누고 골드 아래는 버린다', () => {
    const exchange = { id: 1, name: '마력석', cost: 3 };

    expect(tradeOf(exchange, statsOf({ 마력석: recent(1_000_000, 50) }))).toEqual({
      status: 'ok',
      mid: 1_000_000,
      qty: 50,
      perCoin: 333_333,
    });
  });

  it('거래가 없었으면 없다고, 받는 중이면 받는 중이라고 한다', () => {
    const exchange = { id: 1, name: '마력석', cost: 3 };

    expect(tradeOf(exchange, statsOf({}))).toEqual({ status: 'none' });
    expect(tradeOf(exchange, statsOf({}, true))).toEqual({ status: 'loading' });
    // 조회할 수 없거나 받지 못한 것은 거래가 없었다는 뜻이 아니다.
    expect(tradeOf(exchange, undefined)).toEqual({ status: 'unknown' });
    expect(tradeOf(exchange, { items: {}, loading: false, failed: true })).toEqual({ status: 'unknown' });
  });

  it('거래량이 기준보다 적으면, 거래가 아예 없었으면 거래 적음이다', () => {
    const prices = new Map<string, PriceState>([
      ['코어', priced(37_000_000)],
      ['마력석', priced(1_050_000)],
      ['에르그 결정', priced(700_000)],
      ['자수실', priced(300_000)],
    ]);
    const stats = statsOf({
      코어: recent(30_000_000, LOW_VOLUME - 1),
      마력석: recent(1_000_000, LOW_VOLUME),
      // 에르그 결정과 자수실은 거래가 없었다.
    });
    const byName = Object.fromEntries(rankExchanges(EXCHANGES, prices, stats).map((row) => [row.name, row.lowVolume]));

    expect(byName).toEqual({ 코어: true, 마력석: false, '에르그 결정': true, 자수실: true });
  });

  it('받는 중인 것은 거래 적음으로 치지 않는다', () => {
    const rows = rankExchanges(EXCHANGES, new Map(), statsOf({}, true));

    expect(rows.every((row) => !row.lowVolume)).toBe(true);
    // 받지 못한 것도 마찬가지다.
    expect(rankExchanges(EXCHANGES, new Map(), undefined).every((row) => !row.lowVolume)).toBe(true);
  });
});

describe('기준과 거래 적음에 따른 줄 세우기', () => {
  const prices = new Map<string, PriceState>([
    ['코어', priced(37_000_000)], // 최저가 기준 370,000/코인이지만 거래가 거의 없다
    ['마력석', priced(1_050_000)], // 350,000/코인
    ['에르그 결정', priced(700_000)],
    ['자수실', priced(300_000)],
  ]);
  const stats = statsOf({
    코어: recent(20_000_000, 2), // 거래가 기준 200,000/코인
    마력석: recent(1_020_000, 500), // 340,000/코인
    '에르그 결정': recent(1_400_000, 300), // 200,000/코인
    자수실: recent(250_000, 400), // 83,333/코인
  });
  const names = (rows: ReturnType<typeof rankExchanges>) => rows.map((row) => row.name);

  it('기본은 최저가 기준이다', () => {
    const rows = rankExchanges(EXCHANGES, prices, stats);

    expect(names(rows)).toEqual(['코어', '마력석', '에르그 결정', '자수실']);
    expect(rows.find((row) => row.best)?.name).toBe('코어');
  });

  it('거래가 기준으로 바꾸면 그 값으로 줄 세우고 가장 이득도 그 값으로 고른다', () => {
    const rows = rankExchanges(EXCHANGES, prices, stats, { basis: 'trade' });

    expect(names(rows)).toEqual(['마력석', '코어', '에르그 결정', '자수실']);
    expect(rows.filter((row) => row.best).map((row) => row.name)).toEqual(['마력석']);
  });

  it('거래 적음 제외를 켜면 줄 순서는 그대로고 가장 이득만 다음 줄로 넘어간다', () => {
    const rows = rankExchanges(EXCHANGES, prices, stats, { skipLowVolume: true });

    expect(names(rows)).toEqual(['코어', '마력석', '에르그 결정', '자수실']);
    expect(rows.find((row) => row.name === '코어')?.best).toBe(false);
    expect(rows.find((row) => row.best)?.name).toBe('마력석');
  });

  it('거래 통계가 없으면 거래가 기준은 모두 모르는 것이라 아무것도 표시하지 않는다', () => {
    const rows = rankExchanges(EXCHANGES, prices, undefined, { basis: 'trade' });

    expect(rows.some((row) => row.best)).toBe(false);
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
