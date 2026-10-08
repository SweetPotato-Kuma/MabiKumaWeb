import { describe, expect, it } from 'vitest';
import {
  abilityChance,
  abilityPool,
  abilityValueText,
  awaken,
  awakenUntil,
  ECHO_ABILITIES,
  ECHO_BOOSTERS,
  ECHO_STONES,
  canReroll,
  echoStone,
  rerollChance,
  rerollLevel,
  fxTierOf,
  levelChances,
  levelRange,
  targetChance,
} from './simulator';

const ability = (name: string) => ECHO_ABILITIES.findIndex((each) => each.name === name);
const booster = (name: string) => ECHO_BOOSTERS.find((each) => each.name === name)!;
const plain = booster('에코스톤 각성제');
const best = booster('최고급 에코스톤 각성제');

/** 정해 둔 값을 차례로 돌려주는 난수. 다 쓰면 처음으로 돌아간다. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe('에코스톤 데이터', () => {
  it('다섯 종류의 돌과 세 가지 각성제가 있고, 모든 능력에 이름이 있다', () => {
    expect(ECHO_STONES.map((stone) => stone.name)).toEqual([
      '레드 에코스톤',
      '블루 에코스톤',
      '옐로 에코스톤',
      '실버 에코스톤',
      '블랙 에코스톤',
    ]);
    expect(ECHO_BOOSTERS).toHaveLength(3);
    for (const each of ECHO_ABILITIES) expect(each.name.trim()).not.toBe('');
  });

  it('돌마다 능력 확률을 모두 더하면 1 이다', () => {
    for (const stone of ECHO_STONES) {
      const pool = abilityPool(stone, 30);
      const sum = pool.reduce((total, entry) => total + abilityChance(stone, 30, entry.ability), 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });
});

describe('레벨', () => {
  const combat = ECHO_ABILITIES[ability('컴뱃 마스터리 최소 대미지')];

  it('30등급은 최대 레벨까지, 1등급은 1레벨만 나온다', () => {
    expect(levelRange(combat, 30, plain)).toEqual({ low: 1, high: 20 });
    expect(levelRange(combat, 1, plain)).toEqual({ low: 1, high: 1 });
  });

  it('최고급 각성제는 20레벨 능력의 1~4레벨을 뺀다. 등급 상한이 더 낮으면 상한만 나온다', () => {
    expect(levelRange(combat, 30, best)).toEqual({ low: 5, high: 20 });
    expect(levelRange(combat, 3, best)).toEqual({ low: 2, high: 2 });
  });

  it('레벨 확률은 레벨별 가중치를 따르고 모두 더하면 1 이다', () => {
    const rows = levelChances(combat, 30, plain);
    expect(rows).toHaveLength(20);
    expect(rows.reduce((sum, row) => sum + row.chance, 0)).toBeCloseTo(1, 10);
    // 1레벨 1000, 20레벨 202.
    expect(rows[0].chance / rows[19].chance).toBeCloseTo(1000 / 202, 10);
  });

  it('수치는 1레벨 값에 레벨마다 더한다', () => {
    expect(abilityValueText(combat, 19)).toBe('9.5');
  });
});

describe('각성', () => {
  const red = echoStone(1);

  it('등급이 낮으면 높은 등급 전용 능력은 나오지 않는다', () => {
    const black = echoStone(5);
    expect(abilityPool(black, 25).length).toBeLessThan(abilityPool(black, 26).length);
  });

  it('목표 확률은 능력 확률과 레벨 확률의 곱이다', () => {
    const target = { ability: red.pool[0][0], minLevel: 1 };
    expect(targetChance(red, 30, plain, target)).toBeCloseTo(
      abilityChance(red, 30, target.ability),
      12,
    );
  });

  it('난수가 0 이면 목록의 첫 능력, 가장 낮은 레벨이 나온다', () => {
    expect(awaken(red, 30, best, sequence(0))).toEqual({
      ability: red.pool[0][0],
      level: levelRange(ECHO_ABILITIES[red.pool[0][0]], 30, best).low,
    });
  });

  it('목표가 나오면 거기서 멈추고, 안 나오면 상한까지 돈다', () => {
    const first = red.pool[0][0];
    const hit = awakenUntil(
      red,
      30,
      plain,
      { ability: first, minLevel: 1 },
      10,
      sequence(0.99, 0.5, 0, 0),
    );
    expect(hit).toMatchObject({ hit: true, tries: 2 });
    const miss = awakenUntil(red, 30, plain, { ability: first, minLevel: 1 }, 5, sequence(0.99));
    expect(miss).toMatchObject({ hit: false, tries: 5 });
  });
});

describe('연출 겹 수', () => {
  it('최대 레벨의 50%, 75%, 90% 이상마다 한 겹씩 올라간다', () => {
    const combat = ability('컴뱃 마스터리 최소 대미지');
    expect(fxTierOf({ ability: combat, level: 9 })).toBe(0);
    expect(fxTierOf({ ability: combat, level: 10 })).toBe(1);
    expect(fxTierOf({ ability: combat, level: 15 })).toBe(2);
    expect(fxTierOf({ ability: combat, level: 18 })).toBe(3);
  });
});

describe('연마석 레벨 재부여', () => {
  const combat = ability('컴뱃 마스터리 최소 대미지');

  it('능력은 그대로 두고 레벨만 다시 정하며, 한 번 하면 다시 할 수 없다', () => {
    const before = { ability: combat, level: 3 };
    expect(canReroll(before)).toBe(true);
    const after = rerollLevel(before, 30, sequence(0.999));
    expect(after).toEqual({ ability: combat, level: 20, rerolled: true });
    expect(canReroll(after)).toBe(false);
    expect(canReroll(null)).toBe(false);
  });

  it('원래 레벨보다 낮게 나오면 원래 레벨을 그대로 둔다', () => {
    const result = { ability: combat, level: 15 };
    expect(rerollLevel(result, 30, sequence(0)).level).toBe(15);
    expect(rerollChance(result, 30, 15)).toBe(1);
  });

  it('각성제 보정 없이 등급 상한 안의 레벨별 확률을 쓴다', () => {
    const result = { ability: combat, level: 1 };
    // 30등급, 20레벨 능력: 1레벨 1000 / 전체 12020.
    expect(1 - rerollChance(result, 30, 2)).toBeCloseTo(1000 / 12020, 10);
    expect(rerollChance(result, 30, 1)).toBeCloseTo(1, 10);
    // 1등급은 1레벨만 나온다.
    expect(rerollLevel(result, 1, sequence(0.999)).level).toBe(1);
  });
});
