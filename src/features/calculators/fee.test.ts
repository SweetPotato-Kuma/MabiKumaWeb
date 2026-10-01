import { describe, expect, it } from 'vitest';
import {
  bestOutcome,
  bestRanges,
  couponName,
  feeCalculator,
  feeOutcome,
  FEE_RATE,
  PREMIUM_FEE_RATE,
  type FeeOption,
} from './fee';
import { defaultValues, type Values } from './schema';

const option = (id: string, discount: number, cost: number | null): FeeOption => ({
  id,
  label: id,
  discount,
  cost,
});

describe('수수료', () => {
  it('판매가의 5% 이고 프리미엄은 4% 다', () => {
    expect(feeOutcome(7_000_000, FEE_RATE, 0, option('none', 0, 0)).fee).toBe(350_000);
    expect(feeOutcome(7_000_000, PREMIUM_FEE_RATE, 0, option('none', 0, 0)).fee).toBe(280_000);
  });

  it('공식 안내의 예: 700만 골드의 수수료 35만 골드, 100% 쿠폰은 35만, 30% 쿠폰은 10만 5천 골드를 덜 낸다', () => {
    expect(feeOutcome(7_000_000, FEE_RATE, 0, option('c100', 1, 0)).saved).toBe(350_000);
    expect(feeOutcome(7_000_000, FEE_RATE, 0, option('c30', 0.3, 0)).saved).toBe(105_000);
  });

  it('소수점 이하는 버린다', () => {
    const outcome = feeOutcome(1_234_567, FEE_RATE, 0, option('c10', 0.1, 0));

    expect(outcome.fee).toBe(61_728);
    expect(outcome.saved).toBe(6_172);
  });

  it('수령액은 판매가에서 수수료를 빼고 할인액을 더한 뒤 쿠폰 값과 기타 비용을 뺀다', () => {
    const outcome = feeOutcome(100_000_000, FEE_RATE, 300_000, option('c50', 0.5, 2_000_000));

    // 100,000,000 - 5,000,000 + 2,500,000 - 2,000,000 - 300,000
    expect(outcome.net).toBe(95_200_000);
  });

  it('쿠폰 값을 모르면 수령액도 모른다', () => {
    expect(feeOutcome(100_000_000, FEE_RATE, 0, option('c10', 0.1, null)).net).toBeNull();
  });
});

describe('가장 유리한 선택', () => {
  it('수령액이 가장 큰 것을 고른다', () => {
    const outcomes = [
      feeOutcome(100_000_000, FEE_RATE, 0, option('none', 0, 0)),
      feeOutcome(100_000_000, FEE_RATE, 0, option('c10', 0.1, 400_000)),
      feeOutcome(100_000_000, FEE_RATE, 0, option('c100', 1, 4_000_000)),
    ];

    expect(bestOutcome(outcomes)?.id).toBe('c100');
  });

  it('쿠폰이 할인액보다 비싸면 쓰지 않는다', () => {
    const outcomes = [
      feeOutcome(1_000_000, FEE_RATE, 0, option('none', 0, 0)),
      // 수수료 5만, 10% 할인은 5천 골드인데 쿠폰이 1만 골드다.
      feeOutcome(1_000_000, FEE_RATE, 0, option('c10', 0.1, 10_000)),
    ];

    expect(bestOutcome(outcomes)?.id).toBe('none');
  });

  it('값이 같으면 할인이 작은 쪽을 고르고, 시세를 모르는 쿠폰은 고르지 않는다', () => {
    const outcomes = [
      feeOutcome(1_000_000, FEE_RATE, 0, option('none', 0, 0)),
      feeOutcome(1_000_000, FEE_RATE, 0, option('c10', 0.1, 5_000)),
      feeOutcome(1_000_000, FEE_RATE, 0, option('c100', 1, null)),
    ];

    expect(bestOutcome(outcomes)?.id).toBe('none');
  });
});

describe('유리한 판매가 구간', () => {
  it('쿠폰이 없을 때는 모든 판매가에서 쿠폰 없음이 유리하다', () => {
    expect(bestRanges([option('none', 0, 0)], FEE_RATE)).toEqual([{ id: 'none', from: 0, to: null }]);
  });

  it('판매가가 오를수록 더 큰 할인 쿠폰이 유리해진다', () => {
    const ranges = bestRanges(
      [option('none', 0, 0), option('c10', 0.1, 100_000), option('c100', 1, 4_000_000)],
      FEE_RATE,
    );

    expect(ranges.map((range) => range.id)).toEqual(['none', 'c10', 'c100']);
    // 구간이 빈틈없이 이어진다.
    for (let i = 1; i < ranges.length; i += 1) expect(ranges[i].from).toBeGreaterThanOrEqual(ranges[i - 1].to ?? 0);
    expect(ranges[ranges.length - 1].to).toBeNull();
  });

  it('구간의 경계에서 두 쿠폰의 수령액이 같다', () => {
    // 쿠폰 없음 대 10%: 수수료율 5% x 10% = 0.5% 이익이 쿠폰 값 100,000 을 넘는 판매가는 2천만 골드다.
    const [first] = bestRanges([option('none', 0, 0), option('c10', 0.1, 100_000)], FEE_RATE);

    expect(first.to).toBe(20_000_000);
  });

  it('할인은 작은데 값은 더 비싼 쿠폰은 어느 판매가에서도 고르지 않는다', () => {
    const ranges = bestRanges([option('none', 0, 0), option('c20', 0.2, 100_000), option('c10', 0.1, 500_000)], FEE_RATE);

    expect(ranges.map((range) => range.id)).not.toContain('c10');
  });

  it('시세를 모르는 쿠폰은 구간에 넣지 않는다', () => {
    const ranges = bestRanges([option('none', 0, 0), option('c100', 1, null)], FEE_RATE);

    expect(ranges.map((range) => range.id)).toEqual(['none']);
    expect(bestRanges([option('c10', 0.1, null)], FEE_RATE)).toEqual([]);
  });
});

describe('수수료 계산기 틀', () => {
  const quotes: Record<string, number> = {
    [couponName(10)]: 400_000,
    [couponName(20)]: 900_000,
    [couponName(30)]: 1_300_000,
    [couponName(50)]: 2_000_000,
    [couponName(100)]: 4_000_000,
  };
  const context = { quote: (name: string) => quotes[name] ?? null };
  const valuesOf = (changes: Values = {}): Values => ({ ...defaultValues(feeCalculator.fields), ...changes });

  it('시세를 받을 아이템은 다섯 쿠폰이다', () => {
    expect(feeCalculator.quoteNames?.({})).toEqual([10, 20, 30, 50, 100].map(couponName));
  });

  it('핵심 숫자는 가장 유리한 쿠폰과 수령액이다', () => {
    const result = feeCalculator.compute(valuesOf(), context);

    expect(result.headline[0]).toMatchObject({ label: '가장 유리한 쿠폰', text: '100% 할인' });
    expect(result.headline[1]).toMatchObject({ label: '수령액', gold: 96_000_000, strong: true });
  });

  it('쿠폰 값을 직접 넣으면 시세를 덮어쓴다', () => {
    // 100% 쿠폰이 1천 골드라면 여전히 100%, 50% 쿠폰을 공짜로 넣어도 100% 가 더 남는다.
    const result = feeCalculator.compute(valuesOf({ c100: 1_000 }), context);

    expect(result.headline[1].gold).toBe(99_999_000);
  });

  it('프리미엄이면 수수료가 4% 다', () => {
    const result = feeCalculator.compute(valuesOf({ premium: true }), context);

    // 수수료 4,000,000 을 100% 쿠폰(400만 골드)으로 모두 덜 내도 쿠폰 값이 같아 남는 것이 같다. 같으면 쿠폰을 안 쓴다.
    expect(result.headline[0].text).toBe('쿠폰 안 씀');
    expect(result.headline[1].gold).toBe(96_000_000);
  });

  it('기타 비용은 수령액에서 빠진다', () => {
    const result = feeCalculator.compute(valuesOf({ other: 3_000_000 }), context);

    expect(result.headline[1].gold).toBe(93_000_000);
  });

  it('분배 인원이 둘 이상이면 1인당 금액을 상세에 적는다', () => {
    const result = feeCalculator.compute(valuesOf({ people: 4 }), context);

    expect(result.details).toContainEqual({ label: '4명이 나누면 1인당', gold: 24_000_000 });
    expect(feeCalculator.compute(valuesOf(), context).details?.some((row) => row.label.includes('1인당'))).toBe(false);
  });

  it('시세가 없는 쿠폰은 비교에서 빼고 알린다', () => {
    const result = feeCalculator.compute(valuesOf(), { quote: () => null });

    expect(result.headline[0].text).toBe('쿠폰 안 씀');
    expect(result.notes?.join(' ')).toContain('시세가 없는 쿠폰');
  });

  it('상세 표의 가장 유리한 줄이 강조된다', () => {
    const result = feeCalculator.compute(valuesOf(), context);

    expect(result.table?.rows[result.table.highlight ?? -1][0]).toBe('100% 할인');
  });

  it('계산식을 적어 둔다', () => {
    expect(feeCalculator.compute(valuesOf(), context).formula).toContain('수수료 = 판매가 × 5%');
  });
});
