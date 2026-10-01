import { describe, expect, it } from 'vitest';
import {
  drawHolyWater,
  effectChance,
  HOLY_WATER_EFFECTS,
  HOLY_WATER_SCROLLS,
  scrollLabel,
  tierChance,
  tierOf,
} from './simulator';

/** 정해 둔 값을 차례로 내놓는 난수. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

const effectIndex = (name: string) =>
  HOLY_WATER_EFFECTS.findIndex((effect) => effect.name === name);
const effectNamed = (name: string) => HOLY_WATER_EFFECTS[effectIndex(name)];

describe('성수 스크롤', () => {
  it('모두 102장이다', () => {
    expect(HOLY_WATER_SCROLLS).toHaveLength(102);
  });

  it('효과마다 단계가 1부터 빈틈없이 이어진다', () => {
    for (const effect of HOLY_WATER_EFFECTS) {
      let next = 1;
      for (const [min, max] of effect.ranges) {
        expect(min).toBe(next);
        expect(max).toBeGreaterThanOrEqual(min);
        next = max + 1;
      }
    }
  });

  it('단계 글자를 붙여 이름을 짓고, 세트 효과에는 붙이지 않는다', () => {
    const labels = HOLY_WATER_SCROLLS.map(scrollLabel);
    expect(labels).toContain('최대 대미지 E');
    expect(labels).toContain('생명력 F');
    expect(labels).toContain('음악 버프 효과 A');
    expect(labels).toContain('아이스볼트 세트 효과');
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('drawHolyWater', () => {
  it('스크롤을 고른 뒤 그 폭 안에서 수치를 고른다', () => {
    // 최대 대미지 E(25~30) 는 다섯 번째 스크롤이다.
    const draw = drawHolyWater(7, sequence(4.5 / 102, 0.999_999));
    expect(scrollLabel(HOLY_WATER_SCROLLS[draw.scroll])).toBe('최대 대미지 E');
    expect(draw).toMatchObject({ no: 7, value: 30 });
    expect(drawHolyWater(1, sequence(4.5 / 102, 0)).value).toBe(25);
  });
});

describe('effectChance', () => {
  it('효과 하나 한 장짜리는 1/102 다', () => {
    expect(effectChance(effectIndex('음악 버프 효과'), 1)).toBeCloseTo(1 / 102, 12);
  });

  it('최대 대미지 30 은 1/102 x 1/6, 20 이상은 1/102 x 5/6 + 1/102', () => {
    const maxDamage = effectIndex('최대 대미지');
    expect(effectChance(maxDamage, 30)).toBeCloseTo(1 / 612, 12);
    expect(effectChance(maxDamage, 20)).toBeCloseTo((5 / 6 + 1) / 102, 12);
    expect(effectChance(maxDamage, 1)).toBeCloseTo(5 / 102, 12);
  });

  it('4대 속성 연금 대미지 50 은 1/1020, 힐링 효과 4 이상은 (2/5 + 1)/102', () => {
    expect(effectChance(effectIndex('4대 속성 연금 대미지'), 50)).toBeCloseTo(1 / 1020, 12);
    expect(effectChance(effectIndex('힐링 효과'), 4)).toBeCloseTo((2 / 5 + 1) / 102, 12);
  });

  it('최대치를 넘는 수치는 나올 수 없다', () => {
    expect(effectChance(effectIndex('최대 대미지'), 31)).toBe(0);
  });
});

describe('tierOf', () => {
  it('최대치의 50, 90, 95, 98% 에 가장 가까운 수치로 나눈다', () => {
    const maxDamage = effectNamed('최대 대미지');
    expect(tierOf(maxDamage, 14)).toBeNull();
    expect(tierOf(maxDamage, 15)).toBe(50);
    expect(tierOf(maxDamage, 28)).toBe(90);
    // 30 의 98% 는 29.4 라 29 도 최상위다.
    expect(tierOf(maxDamage, 29)).toBe(98);
    expect(tierOf(maxDamage, 30)).toBe(98);
    const alchemy = effectNamed('4대 속성 연금 대미지');
    expect(tierOf(alchemy, 48)).toBe(95);
    expect(tierOf(alchemy, 49)).toBe(98);
    const regen = effectNamed('생명력 자연 회복량');
    expect(tierOf(regen, 489)).toBe(95);
    expect(tierOf(regen, 490)).toBe(98);
  });

  it('수치가 하나뿐인 효과는 등급을 매기지 않는다', () => {
    expect(tierOf(effectNamed('음악 버프 효과'), 1)).toBeNull();
    expect(tierOf(effectNamed('아이스볼트 세트 효과'), 1)).toBeNull();
  });

  it('등급 확률은 높을수록 작다', () => {
    const chances = ([50, 90, 95, 98] as const).map(tierChance);
    for (let index = 1; index < chances.length; index += 1)
      expect(chances[index]).toBeLessThan(chances[index - 1]);
    // 수치가 하나뿐인 19장을 빼면 83장이고, 그 가운데 절반 남짓이 50% 이상이다.
    expect(chances[0]).toBeGreaterThan(0.4);
    expect(chances[0]).toBeLessThan(83 / 102);
  });
});
