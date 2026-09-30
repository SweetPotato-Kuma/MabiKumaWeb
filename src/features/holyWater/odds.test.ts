import { describe, expect, it } from 'vitest';
import { costOfTrials, oddsCounts } from './odds';

describe('oddsCounts', () => {
  it('평균과 절반, 9할 횟수를 센다', () => {
    // p = 4.59%: 평균 22번, 15번 안에 절반, 50번 안에 9할.
    const counts = oddsCounts(0.0459);

    expect(counts?.mean).toBe(22);
    expect(counts?.half).toBe(15);
    expect(counts?.ninety).toBeGreaterThanOrEqual(49);
    expect(counts?.ninety).toBeLessThanOrEqual(50);
  });

  it('확률이 높을수록 횟수가 줄고, 9할이 절반보다 크다', () => {
    const rare = oddsCounts(0.01);
    const common = oddsCounts(0.4);

    expect(common!.mean).toBeLessThan(rare!.mean);
    expect(rare!.ninety).toBeGreaterThan(rare!.half);
    expect(common!.ninety).toBeGreaterThanOrEqual(common!.half);
  });

  it('확률이 1 이면 한 번이면 된다', () => {
    expect(oddsCounts(1)).toEqual({ mean: 1, half: 1, ninety: 1 });
  });

  it('나올 수 없는 수치는 횟수를 세지 않는다', () => {
    expect(oddsCounts(0)).toBeNull();
    expect(oddsCounts(-0.1)).toBeNull();
    expect(oddsCounts(Number.NaN)).toBeNull();
  });
});

describe('costOfTrials', () => {
  it('횟수에 성수 가격을 곱한다', () => {
    expect(costOfTrials(22, 833_000)).toBe(18_326_000);
  });

  it('가격을 모르면 비용도 모른다', () => {
    expect(costOfTrials(22, null)).toBeNull();
  });
});
