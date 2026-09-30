import { describe, expect, it } from 'vitest';
import { parseFilter, serializeFilter } from './filterUrl';
import { relicCondition, type Condition, type OptionFilter } from './optionFilter';

const filterOf = (...conditions: object[]): OptionFilter => ({
  conditions: conditions.map((condition, index) => ({ ...condition, id: index + 1 }) as Condition),
});

const withoutId = (filter: OptionFilter) => filter.conditions.map(({ id: _id, ...rest }) => rest);

describe('상세 검색 조건과 주소', () => {
  it('조건이 없으면 빈 글자다', () => {
    expect(serializeFilter({ conditions: [] })).toBe('');
    expect(parseFilter('')).toEqual({ conditions: [] });
    expect(parseFilter(null)).toEqual({ conditions: [] });
  });

  it('조건을 글자로 만들었다 되돌리면 같은 조건이다', () => {
    const filter = filterOf(
      { kind: 'reforge', name: '스매시 대미지', minLevel: 5 },
      { kind: 'enchant', prefix: '울프헌터', suffix: '' },
      { kind: 'special', type: 'R', minStep: 3 },
      { kind: 'erg', grade: 'S', minLevel: null },
      { kind: 'color', hex: '#aabbcc', part: 'A', minSimilarity: 90 },
      { kind: 'relic', name: '블래스트', minLevel: 1, maxLevel: 10 },
      { kind: 'number', optionType: '크리티컬', min: 30 },
      { kind: 'text', optionType: '세트 효과', text: '수호' },
    );

    expect(withoutId(parseFilter(serializeFilter(filter)))).toEqual(withoutId(filter));
  });

  it('값이 없는 칸은 글자에 싣지 않는다', () => {
    const text = serializeFilter(filterOf({ kind: 'reforge', name: '스매시 대미지', minLevel: null }));

    expect(text).toBe('[{"kind":"reforge","name":"스매시 대미지"}]');
  });

  it('아직 아무것도 거르지 않는 빈 블록은 싣지 않는다', () => {
    const filter = filterOf(
      { kind: 'reforge', name: '', minLevel: null },
      { kind: 'special', type: 'S', minStep: null },
    );

    expect(serializeFilter(filter)).toBe('[{"kind":"special","type":"S"}]');
  });

  it('같은 조건이면 블록 번호가 달라도 같은 글자다', () => {
    const a = serializeFilter(filterOf({ kind: 'erg', grade: 'A', minLevel: 2 }));

    expect(serializeFilter(parseFilter(a))).toBe(a);
  });

  it('유물 조건 하나도 되살아난다', () => {
    const back = parseFilter(serializeFilter({ conditions: [relicCondition('블래스트', 3, null)] }));

    expect(back.conditions).toMatchObject([
      { kind: 'relic', name: '블래스트', minLevel: 3, maxLevel: null },
    ]);
  });

  it('깨진 글자는 빈 조건으로 본다', () => {
    expect(parseFilter('not json')).toEqual({ conditions: [] });
    expect(parseFilter('{"kind":"reforge"}')).toEqual({ conditions: [] });
    expect(parseFilter('123')).toEqual({ conditions: [] });
  });

  it('모양이 맞지 않는 조건만 버리고 나머지는 살린다', () => {
    const back = parseFilter(
      JSON.stringify([
        { kind: 'nothing', name: 'x' },
        'text',
        { kind: 'color', hex: 'red' },
        { kind: 'number', optionType: '', min: 3 },
        { kind: 'reforge', name: '스매시 대미지', minLevel: '5' },
      ]),
    );

    // 레벨이 문자열이면 그 칸만 비운다. 이름이 있으니 조건은 남는다.
    expect(back.conditions).toMatchObject([
      { kind: 'reforge', name: '스매시 대미지', minLevel: null },
    ]);
  });

  it('빈 조건과 범위를 벗어난 값은 거른다', () => {
    const back = parseFilter(
      JSON.stringify([
        { kind: 'reforge', name: '', minLevel: null },
        { kind: 'special', type: 'X', minStep: 2 },
        { kind: 'color', hex: '#ABCDEF', minSimilarity: 500 },
      ]),
    );

    expect(back.conditions).toMatchObject([
      { kind: 'special', type: '', minStep: 2 },
      { kind: 'color', hex: '#abcdef', minSimilarity: 95 },
    ]);
  });

  it('조건이 너무 많으면 앞에서부터 자른다', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      kind: 'reforge',
      name: `옵션${index}`,
    }));

    expect(parseFilter(JSON.stringify(many)).conditions).toHaveLength(12);
  });
});
