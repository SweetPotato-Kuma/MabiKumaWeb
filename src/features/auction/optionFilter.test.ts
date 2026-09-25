import { describe, expect, it } from 'vitest';
import {
  activeConditionCount,
  describeMatch,
  EMPTY_OPTION_FILTER,
  matchesOptionFilter,
  parseReforge,
  type OptionFilter,
} from './optionFilter';
import type { ItemOption } from './types';

const option = (
  option_type: string,
  option_value?: string,
  option_sub_type?: string,
  option_value2?: string,
): ItemOption => ({ option_type, option_value, option_sub_type, option_value2 });

/** 실제 경매장 응답 모양을 줄인 검 한 자루. */
const sword = {
  item_option: [
    option('공격', '40', undefined, '100'),
    option('아이템 색상', '198,193,188', '파트 A'),
    option('아이템 색상', '247,205,125', '파트 B'),
    option('인챈트', '울프헌터 (랭크 C)', '접두'),
    option('세공 옵션', '스매시 대미지(5레벨:10 % 증가)', '1'),
    option('세공 옵션', '윈드밀 대미지(3레벨:6 % 증가)', '2'),
    option('특별 개조', '6', 'R'),
    option('에르그', '35', 'S', '50'),
    option('세트 효과', '파이널 히트 강화', '1', '10'),
  ],
};

const ampoule = { item_option: [option('색상', '132,192,122')] };

const filter = (patch: Partial<OptionFilter>): OptionFilter => ({
  ...EMPTY_OPTION_FILTER,
  ...patch,
});

describe('parseReforge', () => {
  it('세공 문장에서 이름과 레벨을 뗀다', () => {
    expect(parseReforge('퓨리 오브 라이트 대미지(4레벨:12 % 증가)')).toEqual({
      name: '퓨리 오브 라이트 대미지',
      level: 4,
    });
    expect(parseReforge('레벨 표시가 없는 문장')).toBeNull();
  });
});

describe('matchesOptionFilter', () => {
  it('조건이 없으면 모두 통과한다', () => {
    expect(activeConditionCount(EMPTY_OPTION_FILTER)).toBe(0);
    expect(matchesOptionFilter(sword, EMPTY_OPTION_FILTER)).toBe(true);
    expect(matchesOptionFilter({}, EMPTY_OPTION_FILTER)).toBe(true);
  });

  it('세공은 이름 일부와 최소 레벨로 거른다', () => {
    expect(
      matchesOptionFilter(sword, filter({ reforges: [{ keyword: '스매시', minLevel: 5 }] })),
    ).toBe(true);
    expect(
      matchesOptionFilter(sword, filter({ reforges: [{ keyword: '스매시', minLevel: 6 }] })),
    ).toBe(false);
    // 이름 없이 레벨만: 어느 세공이든 5레벨 이상이면 된다.
    expect(matchesOptionFilter(sword, filter({ reforges: [{ keyword: '', minLevel: 5 }] }))).toBe(
      true,
    );
    // 띄어쓰기는 달라도 된다.
    expect(
      matchesOptionFilter(
        sword,
        filter({ reforges: [{ keyword: '윈드밀대미지', minLevel: null }] }),
      ),
    ).toBe(true);
  });

  it('세공 조건 둘을 한 옵션으로 채우지 않는다', () => {
    const twoFives = filter({
      reforges: [
        { keyword: '', minLevel: 5 },
        { keyword: '', minLevel: 5 },
      ],
    });
    expect(matchesOptionFilter(sword, twoFives)).toBe(false);
    const fiveAndThree = filter({
      reforges: [
        { keyword: '', minLevel: 3 },
        { keyword: '스매시', minLevel: 5 },
      ],
    });
    expect(matchesOptionFilter(sword, fiveAndThree)).toBe(true);
  });

  it('인챈트, 특별 개조, 에르그로 거른다', () => {
    expect(matchesOptionFilter(sword, filter({ enchant: '울프 헌터' }))).toBe(true);
    expect(matchesOptionFilter(sword, filter({ enchant: '블러드' }))).toBe(false);
    expect(matchesOptionFilter(sword, filter({ specialType: 'R', minSpecialStep: 6 }))).toBe(true);
    expect(matchesOptionFilter(sword, filter({ specialType: 'S' }))).toBe(false);
    expect(matchesOptionFilter(sword, filter({ minSpecialStep: 7 }))).toBe(false);
    expect(matchesOptionFilter(sword, filter({ minErgLevel: 35 }))).toBe(true);
    expect(matchesOptionFilter(sword, filter({ minErgLevel: 36 }))).toBe(false);
  });

  it('색은 비슷함 점수로, 파트를 고르면 그 파트만 본다', () => {
    const cream = { hex: '#c6c1bc', part: '', minSimilarity: 95 };
    expect(matchesOptionFilter(sword, filter({ color: cream }))).toBe(true);
    expect(matchesOptionFilter(sword, filter({ color: { ...cream, part: 'B' } }))).toBe(false);
    expect(matchesOptionFilter(sword, filter({ color: { ...cream, part: 'A' } }))).toBe(true);
    // 염색 앰플은 파트가 없어 파트를 골라도 본다.
    const green = { hex: '#84c07a', part: 'A', minSimilarity: 95 };
    expect(matchesOptionFilter(ampoule, filter({ color: green }))).toBe(true);
    expect(matchesOptionFilter(ampoule, filter({ color: { ...green, hex: '#ff0000' } }))).toBe(
      false,
    );
  });

  it('옵션 문구는 어느 옵션에서든 찾는다', () => {
    expect(matchesOptionFilter(sword, filter({ text: '파이널 히트' }))).toBe(true);
    expect(matchesOptionFilter(sword, filter({ text: '윈드밀 강화' }))).toBe(false);
  });
});

describe('describeMatch', () => {
  it('조건을 건 항목만 짧게 적는다', () => {
    const notes = describeMatch(
      sword,
      filter({ reforges: [{ keyword: '', minLevel: 5 }], specialType: 'R' }),
    );
    expect(notes).toEqual(['세공: 스매시 대미지 5레벨, 윈드밀 대미지 3레벨', '특별 개조 R6']);
    expect(
      describeMatch(ampoule, filter({ color: { hex: '#84c07a', part: '', minSimilarity: 90 } })),
    ).toEqual(['R:132 G:192 B:122 (비슷함 100%)']);
  });
});
