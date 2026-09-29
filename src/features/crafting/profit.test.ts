import { describe, expect, it } from 'vitest';
import type { PriceState } from './market';
import type { CostSum } from './plan';
import { craftProfit } from './profit';

const sum = (gold: number, extra: Partial<CostSum> = {}): CostSum => ({
  gold,
  unpriced: [],
  short: [],
  pending: 0,
  ...extra,
});

const listed = (...prices: number[]): PriceState => ({
  status: 'ok',
  price: { offers: prices.map((price) => ({ price, count: 1 })), supply: prices.length, complete: true },
});

const plan = (gold: number, extra: Partial<CostSum> = {}) => ({
  total: sum(gold, extra),
  beads: 0,
  beadsWorth: sum(0),
});

describe('만들어 팔 때의 손익', () => {
  it('완성품 최저가에서 개당 재료비를 뺀다', () => {
    // 소울 리버레이트 스태프: 최저가 22억, 재료비 2,141,566,016
    expect(craftProfit(plan(2_141_566_016), 1, listed(2_200_000_000, 2_300_000_000))).toEqual({
      unitCost: 2_141_566_016,
      lowest: 2_200_000_000,
      profit: 58_433_984,
      partial: false,
    });
  });

  it('여러 개를 만들면 개당으로 나눈다', () => {
    expect(craftProfit(plan(3_000), 3, listed(900))).toEqual({
      unitCost: 1_000,
      lowest: 900,
      profit: -100,
      partial: false,
    });
  });

  it('시세를 받는 중이면 아직 셈하지 않는다', () => {
    expect(craftProfit(plan(1_000, { pending: 2 }), 1, listed(2_000)).unitCost).toBeUndefined();
  });

  it('매물이 모자라거나 값을 모르는 재료가 있으면 셈한 만큼 내고 모자란다고 표시한다', () => {
    // 실제 재료비는 이보다 크다. 화면이 "이상", "최대" 를 붙인다.
    expect(craftProfit(plan(1_000, { short: [7] }), 1, listed(2_000))).toMatchObject({
      profit: 1_000,
      partial: true,
    });
    expect(craftProfit(plan(1_000, { unpriced: [7] }), 1, listed(2_000)).partial).toBe(true);
  });

  it('완성품 매물이 없거나 받는 중이면 최저가와 손익이 없다', () => {
    expect(craftProfit(plan(1_000), 1, listed()).lowest).toBeUndefined();
    expect(craftProfit(plan(1_000), 1, { status: 'loading' }).profit).toBeUndefined();
  });

  it('코인으로 산 재료는 경매장 가치만큼 재료비에 넣는다', () => {
    const withCoins = { total: sum(1_000), beads: 5, beadsWorth: sum(500) };
    expect(craftProfit(withCoins, 1, listed(2_000))).toEqual({
      unitCost: 1_500,
      lowest: 2_000,
      profit: 500,
      partial: false,
    });
  });
});
