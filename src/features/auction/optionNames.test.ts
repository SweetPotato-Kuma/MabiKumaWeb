import { describe, expect, it } from 'vitest';
import {
  reforgeCap,
  reforgeLevelSuggestions,
  scanCategoriesFor,
  type OptionNames,
} from './optionNames';

/** 실제 게임 데이터에서 옮긴 두 세공과 레벨 표 일부. */
const names: OptionNames = {
  updated: '2026-09-22',
  reforges: ['랜스 차지 쿨타임 감소', '스매시 대미지'],
  reforgeCaps: {
    '랜스 차지 쿨타임 감소': [5, 5, 5, 1],
    '스매시 대미지': [20, 10, 3, 1],
    '한계 없는 세공': [5, 5, 5, 0],
  },
  reforgeLevels: { 3: [3, 4, 4], 5: [5, 6, 7], 10: [10, 11, 13], 20: [20, 21, 25] },
  enchants: { prefix: [], suffix: [] },
};

describe('reforgeCap', () => {
  it('세공마다 최대 레벨과 한계 돌파 레벨을 찾는다', () => {
    expect(reforgeCap(names, '랜스 차지 쿨타임 감소', '랜스')).toEqual({
      max: 5,
      limitBreakMax: 7,
    });
    expect(reforgeCap(names, '한계 없는 세공', '랜스')).toEqual({ max: 5, limitBreakMax: 0 });
    expect(reforgeCap(names, '모르는 세공', '랜스')).toBeNull();
  });

  it('한손 장비와 액세서리는 따로 적힌 상한을 쓴다', () => {
    expect(reforgeCap(names, '스매시 대미지', '검')).toEqual({ max: 20, limitBreakMax: 25 });
    expect(reforgeCap(names, '스매시 대미지', '한손 장비')).toEqual({ max: 10, limitBreakMax: 13 });
    expect(reforgeCap(names, '스매시 대미지', '액세서리')).toEqual({ max: 3, limitBreakMax: 4 });
  });
});

describe('reforgeLevelSuggestions', () => {
  it('한계 돌파 레벨부터 1까지, 최대와 한계 돌파를 표시한다', () => {
    const levels = reforgeLevelSuggestions({ max: 5, limitBreakMax: 7 }, undefined);
    expect(levels.map((each) => each.value)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(levels.slice(0, 3).map((each) => each.note)).toEqual(['한계 돌파', '한계 돌파', '최대']);
    expect(levels[3].count).toBeUndefined();
  });

  it('불러온 매물이 있으면 그 레벨 이상인 매물 수를 붙인다', () => {
    const levels = reforgeLevelSuggestions({ max: 5, limitBreakMax: 0 }, [5, 3, 3, 1]);
    expect(levels.map((each) => [each.value, each.count])).toEqual([
      [5, 1],
      [4, 1],
      [3, 3],
      [2, 3],
      [1, 4],
    ]);
  });
});

describe('scanCategoriesFor', () => {
  it('무리아스 유물 조건이 있으면 유물 카테고리만 훑는다', () => {
    const filter = {
      conditions: [{ id: 1, kind: 'relic' as const, name: '', minLevel: 7, maxLevel: null }],
    };
    expect(scanCategoriesFor(filter, names)).toEqual(['유물']);
  });
});
