import { describe, expect, it } from 'vitest';
import { availableGrades, ergStats, ergSummary, fillErg, unlockLevels } from './erg';
import type { ErgSet } from './types';

/** 스태프 묶음을 줄여 옮겼다. 값은 2026-09 게임 데이터 그대로다(S 1, 21, 50 레벨과 어둠의 에르그). */
const levels = (rows: Record<number, number[]>, count: number) =>
  Array.from({ length: count }, (_, index) => rows[index + 1] ?? rows[1]);

const STAFF: ErgSet = {
  S: {
    effects: [
      '무기 마법 공격력 {0} 증가',
      '중급 마법 스킬 시전 시간 {0}% 감소',
      '메테오, 헤일 스톰 시전 시간 / 라이트닝 로드 차징 시간 {0}% 감소',
      '중급 마법 대미지 {0}% 증가',
    ],
    levels: levels(
      { 1: [1], 21: [8, 1], 31: [12, 11, 1], 41: [16, 21, 12, 1], 50: [20, 30, 30, 10] },
      50,
    ),
  },
  B: {
    effects: ['무기 마법 공격력 {0} 증가', '중급 마법 스킬 시전 시간 {0}% 감소', '', ''],
    levels: levels({ 1: [1] }, 50),
  },
  D: {
    effects: ['마법 재능 스킬 대미지 {0}% 증가 (아르카나 링크 효과와 합산)'],
    levels: levels({ 1: [0.14], 50: [7] }, 50),
  },
};

describe('효과 채우기', () => {
  it('낮은 레벨은 기본 효과만 나온다', () => {
    expect(fillErg(STAFF.S, 1).map((effect) => effect.text)).toEqual(['무기 마법 공격력 1 증가']);
  });

  it('레벨이 오르면 추가 효과가 차례로 열린다', () => {
    expect(fillErg(STAFF.S, 21).map((effect) => effect.text)).toEqual([
      '무기 마법 공격력 8 증가',
      '중급 마법 스킬 시전 시간 1% 감소',
    ]);
    expect(fillErg(STAFF.S, 50)).toHaveLength(4);
  });

  it('효과마다 처음 열리는 레벨을 안다', () => {
    expect(unlockLevels(STAFF.S).map((entry) => entry.level)).toEqual([1, 21, 31, 41]);
  });
});

describe('등급', () => {
  it('어둠의 에르그는 S 등급이 있어야 고를 수 있다', () => {
    expect(availableGrades(STAFF)).toEqual(['B', 'S', 'D']);
    expect(availableGrades({ D: STAFF.D })).toEqual([]);
  });

  it('어둠의 에르그는 S 등급 50레벨 효과 위에 더해진다', () => {
    const summary = ergSummary(STAFF, { grade: 'D', level: 50 });
    expect(summary?.base).toHaveLength(4);
    expect(summary?.dark.map((effect) => effect.text)).toEqual([
      '마법 재능 스킬 대미지 7% 증가 (아르카나 링크 효과와 합산)',
    ]);
    expect(summary?.label).toBe('S 등급 50레벨, 어둠의 에르그 (50/50 레벨)');
  });

  it('없는 등급이나 0 레벨은 고르지 않은 것으로 본다', () => {
    expect(ergSummary(STAFF, { grade: 'A', level: 50 })).toBeNull();
    expect(ergSummary(STAFF, { grade: 'S', level: 0 })).toBeNull();
  });
});

describe('능력치', () => {
  it('무기 능력치 효과만 더한다', () => {
    expect(ergStats(ergSummary(STAFF, { grade: 'S', level: 50 }))).toEqual([['magic_damage', 20]]);
  });

  it('무기 공격력은 최소와 최대에 모두, 자동 방어는 비율로 더한다', () => {
    const lance: ErgSet = {
      S: {
        effects: ['무기 공격력 {0} 증가', '근접공격, 원거리공격, 마법공격 자동방어 확률 {0}% 증가'],
        levels: [[20, 15]],
      },
    };
    expect(ergStats(ergSummary(lance, { grade: 'S', level: 1 }))).toEqual([
      ['attack_min', 20],
      ['attack_max', 20],
      ['immune_melee', 0.15],
      ['immune_ranged', 0.15],
      ['immune_magic', 0.15],
    ]);
  });
});
