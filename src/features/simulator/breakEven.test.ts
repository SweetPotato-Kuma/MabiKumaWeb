import { describe, expect, it } from 'vitest';
import { formatEstimatedChance, sumAtLeastChance } from './breakEven';

describe('sumAtLeastChance', () => {
  it('한 번이면 값이 문턱 이상인 비율이다', () => {
    expect(sumAtLeastChance([1, 2, 3, 10], 1, 3)).toBe(0.5);
  });

  it('두 번이면 합이 문턱의 두 배 이상일 확률에 가깝다', () => {
    // [0, 10] 에서 두 번: 합 0, 10, 10, 20. 10 이상은 3/4.
    expect(sumAtLeastChance([0, 10], 2, 5)).toBeCloseTo(0.75, 1);
  });

  it('같은 입력이면 늘 같은 답이다', () => {
    const values = [1, 5, 9, 40, 200];
    expect(sumAtLeastChance(values, 30, 50)).toBe(sumAtLeastChance(values, 30, 50));
  });

  it('많이 하면 평균이 문턱보다 크냐 작으냐로 쏠린다', () => {
    const values = [0, 0, 0, 100];
    // 평균 25. 문턱 20 이면 거의 반드시, 30 이면 거의 못 넘는다.
    expect(sumAtLeastChance(values, 5000, 20)).toBeGreaterThan(0.99);
    expect(sumAtLeastChance(values, 5000, 30)).toBeLessThan(0.01);
  });

  it('가장 작은 값으로도 넘으면 1, 가장 큰 값으로도 못 넘으면 0 이다', () => {
    expect(sumAtLeastChance([5, 6], 10, 5)).toBe(1);
    expect(sumAtLeastChance([5, 6], 10, 7)).toBe(0);
  });

  it('값을 모르면 셀 수 없다', () => {
    expect(sumAtLeastChance([], 10, 5)).toBeNull();
  });
});

describe('formatEstimatedChance', () => {
  it('소수 첫째 자리까지만 적고 끝은 미만과 이상으로 적는다', () => {
    expect(formatEstimatedChance(0.4321)).toBe('43.2%');
    expect(formatEstimatedChance(0.0004)).toBe('0.1% 미만');
    expect(formatEstimatedChance(0.9996)).toBe('99.9% 이상');
    expect(formatEstimatedChance(1)).toBe('100%');
  });
});
