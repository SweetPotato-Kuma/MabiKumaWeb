import { describe, expect, it } from 'vitest';
import { RELIC_MAX_LEVEL } from './murias';
import { relicPricesFromFile } from './priceFile';
import {
  drawPrice,
  drawRelic,
  meetsRelicTarget,
  MURIAS_RELIC_POOL,
  RELIC_OUTCOMES,
  relicTargetChance,
} from './simulator';

/** 정해 둔 값을 차례로 내놓는 난수. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe('drawRelic', () => {
  it('옵션과 레벨을 따로 고른다', () => {
    const draw = drawRelic(3, sequence(0, 0.999_999));
    expect(draw).toEqual({ no: 3, option: MURIAS_RELIC_POOL[0], level: RELIC_MAX_LEVEL });
  });

  it('난수의 구간마다 옵션과 레벨이 하나씩 똑같이 돌아간다', () => {
    const options = new Set<string>();
    const levels = new Set<number>();
    for (let option = 0; option < MURIAS_RELIC_POOL.length; option += 1) {
      for (let level = 0; level < RELIC_MAX_LEVEL; level += 1) {
        const draw = drawRelic(
          1,
          sequence((option + 0.5) / MURIAS_RELIC_POOL.length, (level + 0.5) / RELIC_MAX_LEVEL),
        );
        options.add(draw.option.name);
        levels.add(draw.level);
      }
    }
    expect(options.size).toBe(MURIAS_RELIC_POOL.length);
    expect([...levels].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(RELIC_OUTCOMES).toBe(MURIAS_RELIC_POOL.length * RELIC_MAX_LEVEL);
  });

  it('옵션 이름이 겹치지 않는다', () => {
    expect(new Set(MURIAS_RELIC_POOL.map((option) => option.name)).size).toBe(
      MURIAS_RELIC_POOL.length,
    );
  });
});

describe('drawPrice', () => {
  const overDrive = MURIAS_RELIC_POOL.find(
    (option) => option.name === '오버 드라이브 폭발 공격 대미지',
  )!;
  const prices = relicPricesFromFile({
    at: 0,
    idea: [134_000_000, 2],
    offers: [['오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 80_000_000, 2]],
    trades: [
      ['오버 드라이브 폭발 공격 대미지 560% 증가 (최대 700%)', 200_000_000, '2026-09-25T03:00:00Z'],
    ],
  });

  it('그 레벨의 지금 최저가를 쓴다', () => {
    expect(drawPrice({ option: overDrive, level: 7 }, prices)).toEqual({
      price: 80_000_000,
      source: 'listing',
    });
  });

  it('매물이 없으면 최종 거래가를, 그것도 없으면 null 을 준다', () => {
    expect(drawPrice({ option: overDrive, level: 8 }, prices)).toEqual({
      price: 200_000_000,
      source: 'trade',
    });
    expect(drawPrice({ option: overDrive, level: 1 }, prices)).toBeNull();
  });
});

describe('relicTargetChance', () => {
  it('옵션 하나를 10레벨로 보려면 결과 하나의 확률과 같다', () => {
    expect(relicTargetChance({ option: 0, minLevel: RELIC_MAX_LEVEL })).toBeCloseTo(
      1 / RELIC_OUTCOMES,
    );
  });

  it('레벨을 낮추면 그 위 레벨의 몫만큼 늘어난다', () => {
    expect(relicTargetChance({ option: 0, minLevel: 8 })).toBeCloseTo(3 / RELIC_OUTCOMES);
    expect(relicTargetChance({ option: 0, minLevel: 1 })).toBeCloseTo(1 / MURIAS_RELIC_POOL.length);
  });

  it('없는 옵션이면 0 이다', () => {
    expect(relicTargetChance({ option: 999, minLevel: 1 })).toBe(0);
  });
});

describe('meetsRelicTarget', () => {
  it('그 옵션이 그 레벨 이상으로 나와야 한다', () => {
    const option = MURIAS_RELIC_POOL[3];
    expect(meetsRelicTarget({ option, level: 9 }, { option: 3, minLevel: 9 })).toBe(true);
    expect(meetsRelicTarget({ option, level: 8 }, { option: 3, minLevel: 9 })).toBe(false);
    expect(
      meetsRelicTarget({ option: MURIAS_RELIC_POOL[4], level: 10 }, { option: 3, minLevel: 1 }),
    ).toBe(false);
  });
});
