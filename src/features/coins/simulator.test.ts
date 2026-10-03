import { describe, expect, it } from 'vitest';
import {
  coinScore,
  coinTierOf,
  maxScore,
  scoreAtLeastChance,
  scoreDistribution,
  tierChance,
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

describe('주화 점수', () => {
  const support = brieLech.totems[3];

  it('공격 토템은 공격 수치 1 에 1점, 크리티컬 1% 에 6점, 아르카나 보너스 0.15% 에 4점이다', () => {
    expect(maxScore(physical)).toBe(20 + 60 + 80);
    expect(coinScore(physical, [0, 0, 0])).toBe(1 + 6 + 4);
    // 최대 대미지 10, 크리티컬 5%, 아르카나 보너스 1.50%
    expect(coinScore(physical, [9, 4, 9])).toBe(10 + 30 + 40);
  });

  it('지원 토템은 힐링과 음악 버프만 세고 음악 버프 지속 시간은 넣지 않는다', () => {
    expect(maxScore(support)).toBe(10 + 20);
    expect(coinScore(support, [9, 19, 19])).toBe(30);
    expect(coinScore(support, [9, 0, 19])).toBe(30);
  });

  it('점수가 만점의 몇 % 이상인지로 등급을 가른다', () => {
    expect(coinTierOf(physical, 160)).toBe(95);
    expect(coinTierOf(physical, 152)).toBe(95);
    expect(coinTierOf(physical, 151)).toBe(90);
    expect(coinTierOf(physical, 120)).toBe(75);
    expect(coinTierOf(physical, 80)).toBe(50);
    expect(coinTierOf(physical, 79)).toBeNull();
  });

  it('점수 분포는 모든 조합을 고르게 센 것과 같다', () => {
    const dist = scoreDistribution(physical);
    expect(dist.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1);
    let hits = 0;
    for (let a = 0; a < 20; a += 1)
      for (let b = 0; b < 10; b += 1)
        for (let c = 0; c < 20; c += 1) if (coinScore(physical, [a, b, c]) >= 152) hits += 1;
    expect(scoreAtLeastChance(physical, 152)).toBeCloseTo(hits / 4000);
    expect(tierChance(physical, 95)).toBeCloseTo(hits / 4000);
    expect(scoreAtLeastChance(physical, 160)).toBeCloseTo(1 / 4000);
    expect(scoreAtLeastChance(physical, 0)).toBeCloseTo(1);
  });
});
