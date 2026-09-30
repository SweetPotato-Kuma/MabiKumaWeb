import { describe, expect, it } from 'vitest';
import {
  activeConditionCount,
  isConditionActive,
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
import { describeColorRange, type ColorChannel } from '@/features/colorChannels';
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

const range = (min: number | null, max: number | null): ColorChannel => ({
  similar: false,
  min,
  max,
  base: null,
  percent: 10,
});
const near = (base: number, percent: number): ColorChannel => ({
  similar: true,
  min: null,
  max: null,
  base,
  percent,
});
const none = () => range(null, null);

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

  it('색은 R, G, B 채널마다 범위로 걸고, 건 채널이 모두 맞아야 한다', () => {
    const color = (r: ColorChannel, g: ColorChannel, b: ColorChannel, part = '') =>
      ({ kind: 'color' as const, part, r, g, b });
    // 검의 파트 A 는 198,193,188 이다.
    expect(matchesOptionFilter(sword, only(color(range(190, 200), none(), none())))).toBe(true);
    expect(matchesOptionFilter(sword, only(color(range(190, 197), none(), none())))).toBe(false);
    expect(matchesOptionFilter(sword, only(color(range(190, 200), range(190, 195), range(180, 190))))).toBe(true);
    // 한 채널이라도 벗어나면 맞지 않는다.
    expect(matchesOptionFilter(sword, only(color(range(190, 200), range(0, 100), none())))).toBe(false);
    // 한쪽 끝만 건 범위는 그쪽이 끝없다.
    expect(matchesOptionFilter(sword, only(color(range(198, null), none(), none())))).toBe(true);
    expect(matchesOptionFilter(sword, only(color(range(null, 197), none(), none())))).toBe(false);
  });

  it('유사도를 켠 채널은 기준값에서 채널 폭(255)의 N% 안이면 맞다', () => {
    const color = (r: ColorChannel, part = '') =>
      ({ kind: 'color' as const, part, r, g: none(), b: none() });
    // 10% 는 ±25.5. 198 은 175 에서 23 떨어져 있어 맞고, 170 에서는 28 이라 벗어난다.
    expect(matchesOptionFilter(sword, only(color(near(175, 10))))).toBe(true);
    expect(matchesOptionFilter(sword, only(color(near(170, 10))))).toBe(false);
    // 파트 B 의 R 은 247 이다. 222 ± 10% 는 196.5~247.5 라 들어가고, 9% 는 199.05~244.95 라 벗어난다.
    expect(matchesOptionFilter(sword, only(color(near(222, 10), 'B')))).toBe(true);
    expect(matchesOptionFilter(sword, only(color(near(222, 9), 'B')))).toBe(false);
  });

  it('파트를 고르면 그 파트만 보고, 염색 앰플은 파트를 골라도 본다', () => {
    const color = (part: string, r: ColorChannel) => ({ kind: 'color' as const, part, r, g: none(), b: none() });
    // 198 은 파트 A 의 값이고, 파트 B 는 247 이다.
    expect(matchesOptionFilter(sword, only(color('A', range(190, 200))))).toBe(true);
    expect(matchesOptionFilter(sword, only(color('B', range(190, 200))))).toBe(false);
    expect(matchesOptionFilter(sword, only(color('', range(190, 200))))).toBe(true);
    expect(matchesOptionFilter(ampoule, only(color('A', range(130, 135))))).toBe(true);
    expect(matchesOptionFilter(ampoule, only(color('A', range(0, 10))))).toBe(false);
  });

  it('채널을 하나도 걸지 않은 색 조건은 조건이 아니다', () => {
    const empty = newCondition({ kind: 'color', optionType: '색상' });

    expect(isConditionActive(empty)).toBe(false);
    expect(activeConditionCount({ conditions: [empty] })).toBe(0);
    expect(summarizeCondition(empty)).toBe('');
  });

  it('색 조건은 건 채널만 한 줄로 적는다', () => {
    const summary = (r: ColorChannel, g: ColorChannel, part = '') =>
      summarizeCondition({ id: 1, kind: 'color', part, r, g, b: none() });

    expect(summary(range(100, 200), none())).toBe('색상 R 100~200');
    expect(summary(range(null, 50), near(120, 10), 'A')).toBe('색상 파트 A R 50 이하 G 120 ±10%');
    expect(summary(range(30, null), none())).toBe('색상 R 30 이상');
  });

  it('유사도로 받아들이는 범위를 숫자로 보여 준다', () => {
    expect(describeColorRange(near(120, 10))).toBe('94.5~145.5');
    // 0 과 255 를 넘는 쪽은 잘라 낸다.
    expect(describeColorRange(near(10, 10))).toBe('0~35.5');
    expect(describeColorRange(range(null, null))).toBe('');
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

describe('무리아스 유물 조건', () => {
  const relic = (value: string) => ({
    item_option: [
      option('무리아스 유물', value),
      option('전용 해제 거래 보증서 사용 불가', 'true'),
    ],
  });
  const seven = relic('오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)');
  const ten = relic('오버 드라이브 폭발 공격 대미지 700% 증가 (최대 700%)');
  const other = relic('플레임 버스트 대미지 450% 증가 (최대 450%)');

  it('수치를 몰라도 이름 일부와 레벨 구간으로 거른다', () => {
    const atLeastEight = only({ kind: 'relic', name: '오버드라이브', minLevel: 8, maxLevel: null });
    expect([seven, ten, other].map((item) => matchesOptionFilter(item, atLeastEight))).toEqual([
      false,
      true,
      false,
    ]);
    const exactlySeven = only({ kind: 'relic', name: '', minLevel: 7, maxLevel: 7 });
    expect([seven, ten, other].map((item) => matchesOptionFilter(item, exactlySeven))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('칩과 걸린 옵션을 레벨로 적는다', () => {
    const [condition] = only(
      { kind: 'relic', name: '오버 드라이브', minLevel: 5, maxLevel: 8 },
    ).conditions;
    expect(summarizeCondition(condition)).toBe('무리아스 유물 오버 드라이브 5~8레벨');
    expect(describeMatch(seven, { conditions: [condition] })).toEqual([
      '오버 드라이브 폭발 공격 대미지 7레벨 (490%)',
    ]);
  });

  it('불러온 매물에서 옵션 이름과 레벨, 최대치를 모은다', () => {
    const entry = buildOptionCatalog([seven, ten, other]).find((each) => each.kind === 'relic');
    expect(entry?.values.map((each) => each.value)).toEqual([
      '오버 드라이브 폭발 공격 대미지',
      '플레임 버스트 대미지',
    ]);
    expect(entry?.numbers['오버 드라이브 폭발 공격 대미지']).toEqual([7, 10]);
    expect(entry?.scales['플레임 버스트 대미지']).toEqual({ max: 450, unit: '%' });
  });
});
