import { describe, expect, it } from 'vitest';
import {
  abilityValue,
  baseMaxLevel,
  describeAbility,
  levelRange,
  reforgeCandidates,
} from './reforge';
import { describeStats, formatStatRange } from './stats';
import type { AbilityDef, LevelRow } from './types';

const ability = (overrides: Partial<AbilityDef> = {}): AbilityDef => ({
  id: 1,
  name: '체력',
  unit: '증가',
  init: 1.5,
  per: 1.5,
  std: 1,
  lv: [20, 10, 5],
  lb: true,
  types: ['OHSword'],
  races: 'heg',
  ...overrides,
});

/** 2026-09 세공 레벨 표에서 두 줄만 옮겼다. */
const LEVELS: LevelRow[] = [
  [10, 1, 3, 1, 6, 1, 10, 11, 12],
  [20, 1, 5, 1, 10, 1, 20, 21, 25],
];

describe('세공 레벨 범위', () => {
  it('한손 무기와 장신구는 따로 적힌 기준값을 쓴다', () => {
    expect(baseMaxLevel(ability(), 'THSword')).toBe(20);
    expect(baseMaxLevel(ability(), 'OHSword')).toBe(10);
    expect(baseMaxLevel(ability(), 'Accessary')).toBe(5);
  });

  it('따로 적힌 값이 0 이면 기본 기준값을 쓴다', () => {
    expect(baseMaxLevel(ability({ lv: [20, 0, 0] }), 'OHSword')).toBe(20);
  });

  it('랭크마다 레벨 폭이 다르고 한계 돌파는 1랭크에만 있다', () => {
    expect(levelRange(ability(), 3, 'THSword', LEVELS)).toEqual({
      min: 1,
      max: 5,
      limitBreakMin: 0,
      limitBreakMax: 0,
    });
    expect(levelRange(ability(), 1, 'THSword', LEVELS)).toEqual({
      min: 1,
      max: 20,
      limitBreakMin: 21,
      limitBreakMax: 25,
    });
  });

  it('한계 돌파가 안 되는 옵션은 1랭크에서도 돌파 레벨이 없다', () => {
    expect(levelRange(ability({ lb: false }), 1, 'THSword', LEVELS).limitBreakMax).toBe(0);
  });

  it('기준값 줄이 없는 옵션은 후보에서 빠진다', () => {
    const odd = ability({ id: 2, lv: [7, 0, 0] });
    expect(
      reforgeCandidates([ability(), odd], 1, 'THSword', LEVELS).map((entry) => entry.id),
    ).toEqual([1]);
  });
});

describe('세공 값', () => {
  it('시작값에 레벨마다 증가분을 더한다', () => {
    expect(abilityValue(ability(), 1)).toBe(1.5);
    expect(abilityValue(ability(), 10)).toBe(15);
  });

  it('배율을 곱하고 f32 부스러기를 걷어 낸다', () => {
    const range = ability({ name: '유효 사거리', unit: 'm 증가', init: 70, per: 70, std: 0.01 });
    expect(abilityValue(range, 3)).toBe(2.1);
  });

  it('단위가 값에 붙는지 띄는지 게임 표기를 따른다', () => {
    expect(describeAbility(ability(), 10)).toBe('체력 15 증가');
    expect(
      describeAbility(ability({ name: '공격 속도', unit: '% 증가', init: 1, per: 1 }), 5),
    ).toBe('공격 속도 5% 증가');
    expect(
      describeAbility(ability({ name: '재사용 대기 시간', unit: '초 감소', init: 1, per: 1 }), 2),
    ).toBe('재사용 대기 시간 2초 감소');
  });
});

describe('능력치 표기', () => {
  it('비율로 들어 있는 값은 퍼센트로 바꾼다', () => {
    expect(formatStatRange('immune_melee', 0.05, 0.05, true)).toBe('+5%');
  });

  it('개조 효과를 한 줄로 적는다', () => {
    expect(
      describeStats([
        ['attack_max', 14, 14],
        ['balance', -2, -2],
        ['chain_casting', 30101, 30101, 2],
      ]),
    ).toBe('최대 공격력 +14, 밸런스 -2%, 체인 캐스팅 2단계');
  });

  it('모르는 능력치는 내부 이름을 그대로 보여 준다', () => {
    expect(describeStats([['new_stat', 1, 3]])).toBe('new_stat +1~3');
    expect(describeStats([['critical', 0, 10]])).toBe('크리티컬 +0~10%');
  });
});
