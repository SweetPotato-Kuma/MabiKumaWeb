import { describe, expect, it } from 'vitest';
import {
  compareForEquipment,
  equipClass,
  isNotableEnchant,
  keyStatValue,
  sourceTier,
} from './enchantRanking';
import type { EnchantDef } from './types';

const enchant = (overrides: Partial<EnchantDef>): EnchantDef => ({
  id: 1,
  name: '이름',
  slot: 0,
  level: 10,
  desc: [],
  effects: [],
  ...overrides,
});

/** 2026-09 게임 데이터에서 효과와 출처만 옮긴 것들. */
const RELENTLESS = enchant({
  id: 21643,
  name: '거침없는',
  src: ['브리 레흐'],
  gen: 27,
  effects: [['attack_max', 50, 60, 1]],
});
const COLLISION = enchant({
  id: 21538,
  name: '충돌의',
  level: 12,
  src: ['글렌 베르나', '크롬 바스', '테흐 두인 미션'],
  effects: [['attack_max', 15, 32, 1]],
});
const PIERCING = enchant({
  id: 3,
  name: '찌르는',
  src: ['크롬 바스'],
  effects: [
    ['attack_max', 15, 32],
    ['lance_piercing', 2, 2],
  ],
});
const OLD = enchant({
  id: 4,
  name: '야생의',
  level: 6,
  src: ['키아 던전'],
  effects: [['attack_max', 30, 40]],
});
const UNKNOWN = enchant({ id: 5, name: '출처 모름', effects: [['attack_max', 99, 99]] });
const DISTORTED = enchant({
  id: 6,
  name: '왜곡된',
  src: ['탈라 가흐'],
  effects: [
    ['attack_max', 53, 57, 1],
    ['attack_max', 30, 34, 1],
    ['magic_damage', 51, 55, 1],
  ],
});

describe('장비 분류', () => {
  it('사전 카테고리로 가른다', () => {
    expect(equipClass('검')).toBe('physical');
    expect(equipClass('원드')).toBe('magic');
    expect(equipClass('힐링 원드')).toBe('healing');
    expect(equipClass('중갑옷')).toBe('plate');
    expect(equipClass('천옷')).toBe('cloth');
    expect(equipClass('모자/가발')).toBe('armor');
  });
});

describe('출처 등급', () => {
  it('가장 높은 던전이 먼저이고 그다음은 무기와 방어구가 다르다', () => {
    expect(sourceTier(RELENTLESS, 'physical')).toBe(0);
    expect(sourceTier(PIERCING, 'physical')).toBe(1);
    expect(sourceTier(PIERCING, 'plate')).toBe(2);
    expect(sourceTier(COLLISION, 'plate')).toBe(1);
    expect(sourceTier(OLD, 'physical')).toBe(3);
    expect(sourceTier(UNKNOWN, 'physical')).toBe(4);
  });
});

describe('능력치 값', () => {
  it('부위마다 다른 수치는 합치지 않고 가장 큰 값을 쓴다', () => {
    expect(keyStatValue(DISTORTED, 'attack_max')).toBe(57);
  });
});

describe('정렬', () => {
  it('물리 무기는 출처 다음 최대 대미지와 피어싱 순이다', () => {
    const sorted = [UNKNOWN, OLD, COLLISION, PIERCING, RELENTLESS].sort(
      compareForEquipment('physical'),
    );
    expect(sorted.map((e) => e.name)).toEqual([
      '거침없는',
      '찌르는',
      '충돌의',
      '야생의',
      '출처 모름',
    ]);
  });

  it('천옷은 마법 공격력이 높은 것이 먼저다', () => {
    const magic = enchant({
      id: 7,
      name: '마법',
      src: ['키아 던전'],
      effects: [['magic_damage', 20, 20]],
    });
    const melee = enchant({
      id: 8,
      name: '물리',
      src: ['키아 던전'],
      effects: [['attack_max', 40, 40]],
    });
    expect([melee, magic].sort(compareForEquipment('cloth')).map((e) => e.name)).toEqual([
      '마법',
      '물리',
    ]);
  });

  it('눈여겨볼 인챈트는 가까운 출처거나 중요한 능력치를 올린다', () => {
    const useless = enchant({ id: 9, name: '무관', src: ['키아 던전'], effects: [['luck', 5, 5]] });
    expect(isNotableEnchant(RELENTLESS, 'physical')).toBe(true);
    expect(isNotableEnchant(OLD, 'physical')).toBe(true);
    expect(isNotableEnchant(useless, 'physical')).toBe(false);
  });
});
