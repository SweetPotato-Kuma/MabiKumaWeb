import { describe, expect, it } from 'vitest';
import {
  groupScrolls,
  isPersonalEnchant,
  isPlaceholderEnchant,
  parseScrollName,
  scrollName,
  scrollSubtitle,
} from './enchant-scrolls.mjs';

const def = (patch) => ({ shown: '올빼미', slot: 1, level: 8, desc: ['무기에 인챈트 가능', '최대대미지 10 증가'], ...patch });

describe('인챈트 스크롤 이름', () => {
  it('전용 인챈트는 전용 스크롤 이름이 된다', () => {
    expect(scrollName('올빼미', false)).toBe('인챈트 스크롤 - 올빼미');
    expect(scrollName('판타지', true)).toBe('전용 인챈트 스크롤 - 판타지');
  });

  it('이름을 기본 스크롤과 인챈트로 가른다', () => {
    expect(parseScrollName('전용 인챈트 스크롤 - 마나 해머')).toEqual({
      base: '전용 인챈트 스크롤',
      enchant: '마나 해머',
    });
    expect(parseScrollName('인챈트 스크롤')).toBeNull();
    expect(parseScrollName('인챈트 능력 상승의 스크롤')).toBeNull();
  });
});

describe('인챈트 가려내기', () => {
  it('문자열이 풀리지 않은 칸과 랭크 0 은 스크롤이 아니다', () => {
    expect(isPlaceholderEnchant(def({ desc: ['not found key, optionset.9821'] }))).toBe(true);
    expect(isPlaceholderEnchant(def({ level: 0 }))).toBe(true);
    expect(isPlaceholderEnchant(def({ desc: [] }))).toBe(true);
    expect(isPlaceholderEnchant(def({}))).toBe(false);
  });

  it('효과식이나 설명 문장이 전용이라고 하면 전용이다', () => {
    expect(isPersonalEnchant(def({ personal: true }))).toBe(true);
    expect(isPersonalEnchant(def({ desc: ['[인챈트 장비를 전용으로 만듦]'] }))).toBe(true);
    expect(isPersonalEnchant(def({}))).toBe(false);
  });
});

describe('스크롤 묶기', () => {
  it('같은 이름의 접두와 접미를 한 이름 아래 접두 먼저, 높은 랭크 먼저 둔다', () => {
    const groups = groupScrolls([
      def({ slot: 1, level: 9 }),
      def({ slot: 0, level: 7 }),
      def({ slot: 1, level: 12 }),
    ]);
    expect([...groups.keys()]).toEqual(['인챈트 스크롤 - 올빼미']);
    expect(groups.get('인챈트 스크롤 - 올빼미').map((v) => [v.slot, v.level])).toEqual([
      [0, 7],
      [1, 12],
      [1, 9],
    ]);
  });

  it('출처와 제너레이션은 있을 때만 싣고, 빈 칸은 뺀다', () => {
    const [variant] = groupScrolls([def({ src: ['브리 레흐'], gen: 28 })]).get('인챈트 스크롤 - 올빼미');
    expect(variant).toMatchObject({ src: ['브리 레흐'], gen: 28 });
    const [bare] = groupScrolls([def({ src: [] })]).get('인챈트 스크롤 - 올빼미');
    expect(bare).not.toHaveProperty('src');
    expect(bare).not.toHaveProperty('gen');
  });

  it('자리표시 칸은 묶지 않는다', () => {
    expect(groupScrolls([def({ desc: ['not found key, optionset.1'] })]).size).toBe(0);
  });

  it('부제는 접두/접미와 랭크다', () => {
    expect(scrollSubtitle([{ slot: 1, level: 8 }])).toBe('접미 8 랭크');
    expect(
      scrollSubtitle([
        { slot: 0, level: 6 },
        { slot: 1, level: 12 },
      ]),
    ).toBe('접두 A 랭크 / 접미 4 랭크');
  });
});
