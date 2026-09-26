import { describe, expect, it } from 'vitest';
import {
  activeConditionCount,
  buildOptionCatalog,
  describeMatch,
  EMPTY_OPTION_FILTER,
  enchantName,
  matchesOptionFilter,
  newCondition,
  optionNumber,
  parseReforge,
  summarizeCondition,
  thresholdSuggestions,
  type Condition,
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
    option('크리티컬', '19%'),
    option('내구력', '14', undefined, '15'),
    option('아이템 색상', '198,193,188', '파트 A'),
    option('아이템 색상', '247,205,125', '파트 B'),
    option('인챈트', '울프헌터 (랭크 C)', '접두'),
    option('인챈트', '블러드 (랭크 A)', '접미'),
    option('세공 옵션', '스매시 대미지(5레벨:10 % 증가)', '1'),
    option('세공 옵션', '윈드밀 대미지(3레벨:6 % 증가)', '2'),
    option('특별 개조', '6', 'R'),
    option('에르그', '35', 'S', '50'),
    option('세트 효과', '파이널 히트 강화', '1', '10'),
  ],
};

const ampoule = { item_option: [option('색상', '132,192,122')] };

type Draft = Condition extends infer C ? (C extends Condition ? Omit<C, 'id'> : never) : never;

const only = (...conditions: Draft[]): OptionFilter => ({
  conditions: conditions.map((condition, index) => ({ ...condition, id: index + 1 }) as Condition),
});

describe('옵션 읽기', () => {
  it('세공 문장에서 이름과 레벨을, 인챈트에서 랭크를 뗀 이름을 뗀다', () => {
    expect(parseReforge('퓨리 오브 라이트 대미지(4레벨:12 % 증가)')).toEqual({
      name: '퓨리 오브 라이트 대미지',
      level: 4,
    });
    expect(parseReforge('레벨 표시가 없는 문장')).toBeNull();
    expect(enchantName('울프헌터 (랭크 C)')).toBe('울프헌터');
  });

  it('숫자 옵션은 범위면 큰 쪽, 현재와 최대면 현재 값을 본다', () => {
    expect(optionNumber(option('공격', '40', undefined, '100'))).toBe(100);
    expect(optionNumber(option('내구력', '14', undefined, '15'))).toBe(14);
    expect(optionNumber(option('크리티컬', '19%'))).toBe(19);
  });
});

describe('matchesOptionFilter', () => {
  it('조건이 없거나 비어 있으면 모두 통과한다', () => {
    expect(matchesOptionFilter(sword, EMPTY_OPTION_FILTER)).toBe(true);
    const blank = only({ kind: 'reforge', name: '', minLevel: null });
    expect(activeConditionCount(blank)).toBe(0);
    expect(matchesOptionFilter({}, blank)).toBe(true);
  });

  it('세공은 이름과 최소 레벨로 거르고, 한 옵션이 두 조건을 채우지 않는다', () => {
    const reforge = (name: string, minLevel: number | null) =>
      matchesOptionFilter(sword, only({ kind: 'reforge', name, minLevel }));
    expect(reforge('스매시', 5)).toBe(true);
    expect(reforge('스매시', 6)).toBe(false);
    // 띄어쓰기는 달라도 된다.
    expect(reforge('윈드밀대미지', null)).toBe(true);
    const twoFives = only(
      { kind: 'reforge', name: '', minLevel: 5 },
      { kind: 'reforge', name: '', minLevel: 5 },
    );
    expect(matchesOptionFilter(sword, twoFives)).toBe(false);
    const fiveAndThree = only(
      { kind: 'reforge', name: '', minLevel: 3 },
      { kind: 'reforge', name: '스매시', minLevel: 5 },
    );
    expect(matchesOptionFilter(sword, fiveAndThree)).toBe(true);
  });

  it('인챈트, 특별 개조, 에르그, 숫자, 문구로 거른다', () => {
    const match = (condition: Draft) => matchesOptionFilter(sword, only(condition));
    // 접두와 접미를 따로 본다. 접두 칸에 접미 인챈트 이름을 넣으면 걸리지 않는다.
    expect(match({ kind: 'enchant', prefix: '울프 헌터', suffix: '' })).toBe(true);
    expect(match({ kind: 'enchant', prefix: '', suffix: '블러드' })).toBe(true);
    expect(match({ kind: 'enchant', prefix: '블러드', suffix: '' })).toBe(false);
    expect(match({ kind: 'enchant', prefix: '울프헌터', suffix: '블러드' })).toBe(true);
    expect(match({ kind: 'enchant', prefix: '울프헌터', suffix: '기운찬' })).toBe(false);
    expect(match({ kind: 'special', type: 'R', minStep: 6 })).toBe(true);
    expect(match({ kind: 'special', type: 'S', minStep: null })).toBe(false);
    expect(match({ kind: 'erg', grade: 'S', minLevel: 35 })).toBe(true);
    expect(match({ kind: 'erg', grade: 'A', minLevel: null })).toBe(false);
    expect(match({ kind: 'number', optionType: '공격', min: 100 })).toBe(true);
    expect(match({ kind: 'number', optionType: '크리티컬', min: 20 })).toBe(false);
    expect(match({ kind: 'text', optionType: '세트 효과', text: '파이널 히트' })).toBe(true);
    expect(match({ kind: 'text', optionType: '세트 효과', text: '윈드밀' })).toBe(false);
  });

  it('색은 비슷함 점수로, 파트를 고르면 그 파트만 본다', () => {
    const cream = { kind: 'color' as const, hex: '#c6c1bc', part: '', minSimilarity: 95 };
    expect(matchesOptionFilter(sword, only(cream))).toBe(true);
    expect(matchesOptionFilter(sword, only({ ...cream, part: 'B' }))).toBe(false);
    expect(matchesOptionFilter(sword, only({ ...cream, part: 'A' }))).toBe(true);
    // 염색 앰플은 파트가 없어 파트를 골라도 본다.
    const green = { kind: 'color' as const, hex: '#84c07a', part: 'A', minSimilarity: 95 };
    expect(matchesOptionFilter(ampoule, only(green))).toBe(true);
    expect(matchesOptionFilter(ampoule, only({ ...green, hex: '#ff0000' }))).toBe(false);
  });
});

describe('describeMatch', () => {
  it('조건을 건 옵션만 짧게 적는다', () => {
    const notes = describeMatch(
      sword,
      only(
        { kind: 'reforge', name: '', minLevel: 5 },
        { kind: 'special', type: 'R', minStep: null },
        { kind: 'number', optionType: '공격', min: 90 },
      ),
    );
    expect(notes).toEqual([
      '세공: 스매시 대미지 5레벨, 윈드밀 대미지 3레벨',
      '특별 개조 R6',
      '최대 공격 100',
    ]);
  });
});

describe('buildOptionCatalog', () => {
  it('불러온 매물에 있는 옵션만, 많이 나온 순으로 고를 거리를 만든다', () => {
    const catalog = buildOptionCatalog([sword, sword, ampoule]);
    const byLabel = Object.fromEntries(catalog.map((entry) => [entry.label, entry]));
    // 장비 파트 색과 염색 앰플 색은 "색상" 하나로 모인다.
    expect(byLabel['색상']).toMatchObject({ kind: 'color', count: 3 });
    expect(byLabel['세공 옵션'].values).toEqual([
      { value: '스매시 대미지', count: 2 },
      { value: '윈드밀 대미지', count: 2 },
    ]);
    expect(byLabel['인챈트'].valuesBySub).toEqual({
      접두: [{ value: '울프헌터', count: 2 }],
      접미: [{ value: '블러드', count: 2 }],
    });
    // 숫자 자동완성용: 매물마다 가장 큰 값. 세공은 이름별로도 둔다.
    expect(byLabel['세공 옵션'].numbers).toEqual({
      '': [5, 5],
      '스매시 대미지': [5, 5],
      '윈드밀 대미지': [3, 3],
    });
    expect(byLabel['에르그'].numbers['']).toEqual([35, 35]);
    expect(byLabel['최대 공격']).toMatchObject({ kind: 'number', optionType: '공격' });
    expect(byLabel['세트 효과']).toMatchObject({ kind: 'text' });
    expect(byLabel['에르그'].subTypes).toEqual(['S']);
    expect(catalog[0].label).toBe('색상');
  });

  it('고른 옵션으로 빈 조건을 만든다', () => {
    expect(newCondition({ kind: 'number', optionType: '공격' })).toMatchObject({
      kind: 'number',
      optionType: '공격',
      min: null,
    });
  });
});

describe('thresholdSuggestions', () => {
  it('큰 값부터 "N 이상이면 몇 건" 을 만들고, 건수가 같으면 큰 N 만 남긴다', () => {
    expect(thresholdSuggestions([7, 5, 5, 3, 1])).toEqual([
      { value: 7, count: 1 },
      { value: 5, count: 3 },
      { value: 3, count: 4 },
      { value: 1, count: 5 },
    ]);
    expect(thresholdSuggestions([20, 12, 10, 3], '1')).toEqual([
      { value: 12, count: 2 },
      { value: 10, count: 3 },
    ]);
    expect(thresholdSuggestions(undefined)).toEqual([]);
  });
});

describe('summarizeCondition', () => {
  it('칩에 보일 한 줄을 만든다', () => {
    const [reforge, enchant, erg] = only(
      { kind: 'reforge', name: '스매시 대미지', minLevel: 7 },
      { kind: 'enchant', prefix: '울프헌터', suffix: '' },
      { kind: 'erg', grade: 'S', minLevel: 30 },
    ).conditions;
    expect(summarizeCondition(reforge)).toBe('세공 스매시 대미지 7레벨 이상');
    expect(summarizeCondition(enchant)).toBe('인챈트 접두 울프헌터');
    expect(summarizeCondition(erg)).toBe('에르그 S등급 30레벨 이상');
  });
});
