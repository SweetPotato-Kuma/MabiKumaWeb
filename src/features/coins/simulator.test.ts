import { describe, expect, it } from 'vitest';
import {
  atLeastChance,
  COIN_DUNGEONS,
  coinTargetChance,
  drawCoin,
  formatCoinValue,
  isHighValue,
  meetsCoinTarget,
  optionValues,
  stepCount,
  valueAt,
} from './simulator';

const brieLech = COIN_DUNGEONS[0];
const physical = brieLech.totems[0];
const [maxDamage, critical, arcanaBonus] = physical.options;

describe('주화 옵션', () => {
  it('간격대로 최소부터 최대까지 수치가 이어진다', () => {
    expect(stepCount(maxDamage)).toBe(20);
    expect(stepCount(arcanaBonus)).toBe(20);
    expect(optionValues(arcanaBonus).at(-1)).toBe(3);
    // 0.15 를 거듭 더해도 찌꺼기가 남지 않는다.
    expect(valueAt(arcanaBonus, 6)).toBe(1.05);
    expect(formatCoinValue(arcanaBonus, 3)).toBe('3.00%');
    expect(formatCoinValue(critical, 7)).toBe('7%');
  });

  it('높은 수치는 수치 칸 순번이 전체의 90% 이상인 것이다', () => {
    // 1~20 은 18 부터 높다.
    expect(isHighValue(maxDamage, 17)).toBe(true);
    expect(isHighValue(maxDamage, 16)).toBe(false);
    expect(isHighValue(critical, 8)).toBe(true);
    expect(isHighValue(critical, 7)).toBe(false);
  });

  it('특정 수치 이상이 나올 확률은 줄마다 따로 세어 곱한다', () => {
    expect(atLeastChance(maxDamage, 20)).toBe(1 / 20);
    expect(atLeastChance(arcanaBonus, 2.85)).toBe(2 / 20);
    expect(coinTargetChance(physical, [20, 10, 3])).toBeCloseTo((1 / 20) * (1 / 10) * (1 / 20));
    expect(coinTargetChance(physical, [1, 1, 0.15])).toBe(1);
  });
});

describe('주화 만들기', () => {
  it('줄마다 수치 칸 하나를 고르게 고른다', () => {
    const draw = drawCoin(brieLech, 0, 1, () => 0.999);
    expect(draw.steps).toEqual([19, 9, 19]);
    expect(meetsCoinTarget(brieLech, draw, [20, 10, 3])).toBe(true);
    const low = drawCoin(brieLech, 0, 2, () => 0);
    expect(meetsCoinTarget(brieLech, low, [2, 1, 0.15])).toBe(false);
  });
});
