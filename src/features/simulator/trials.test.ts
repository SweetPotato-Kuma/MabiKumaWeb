import { describe, expect, it } from 'vitest';
import { atLeastOnce, expectedHits, formatChance, trialsFor } from './trials';

describe('atLeastOnce', () => {
  it('n 번 안에 한 번 이상 일어날 확률은 1 - (1 - p)^n 이다', () => {
    expect(atLeastOnce(0.5, 2)).toBeCloseTo(0.75);
    expect(atLeastOnce(0.1, 10)).toBeCloseTo(1 - 0.9 ** 10);
  });

  it('평균 횟수만큼 해도 63% 남짓이다', () => {
    const p = 1 / 58;
    expect(atLeastOnce(p, 58)).toBeCloseTo(0.635, 2);
  });

  it('아주 작은 확률도 자릿수를 잃지 않는다', () => {
    // 1 - (1 - 1e-12)^1000 은 1e-9 에 가깝다. 그냥 거듭제곱하면 0 이 된다.
    expect(atLeastOnce(1e-12, 1000)).toBeCloseTo(1e-9, 15);
  });

  it('0 번이거나 일어날 수 없으면 0, 반드시 일어나면 1 이다', () => {
    expect(atLeastOnce(0.3, 0)).toBe(0);
    expect(atLeastOnce(0, 100)).toBe(0);
    expect(atLeastOnce(1, 1)).toBe(1);
  });
});

describe('expectedHits', () => {
  it('n 번 동안 일어나는 횟수의 기댓값은 n * p 다', () => {
    expect(expectedHits(0.02, 150)).toBeCloseTo(3);
    expect(expectedHits(0.5, 0)).toBe(0);
  });
});

describe('trialsFor', () => {
  it('목표 확률을 넘기는 가장 적은 횟수를 준다', () => {
    const p = 0.0174;
    for (const goal of [0.5, 0.9, 0.99]) {
      const n = trialsFor(p, goal);
      expect(atLeastOnce(p, n)).toBeGreaterThanOrEqual(goal);
      expect(atLeastOnce(p, n - 1)).toBeLessThan(goal);
    }
  });

  it('반반은 한 번에 50% 면 1 번이다', () => {
    expect(trialsFor(0.5, 0.5)).toBe(1);
  });

  it('일어날 수 없으면 끝이 없고, 반드시 일어나면 1 번이다', () => {
    expect(trialsFor(0, 0.5)).toBe(Infinity);
    expect(trialsFor(1, 0.99)).toBe(1);
  });
});

describe('formatChance', () => {
  it('1% 이상은 소수 둘째 자리까지, 그 아래는 유효 숫자 세 자리로 적는다', () => {
    expect(formatChance(0.63397)).toBe('63.4%');
    expect(formatChance(0.0000123456)).toBe('0.00123%');
  });

  it('100% 에 아주 가깝지만 100% 는 아니면 그렇다고 적는다', () => {
    expect(formatChance(0.999999)).toBe('99.99% 이상');
    expect(formatChance(1)).toBe('100%');
  });
});
