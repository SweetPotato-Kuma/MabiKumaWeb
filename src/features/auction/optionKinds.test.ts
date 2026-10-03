import { describe, expect, it } from 'vitest';
import { groupKeyOf } from './categoryTree';
import { buildOptionCatalog, EMPTY_OPTION_FILTER, newCondition, type Condition } from './optionFilter';
import { hasDetailOptions, optionChoices } from './optionKinds';

const labels = (category: string, conditions: Condition[] = []) =>
  optionChoices(category, [], conditions).map((choice) => choice.label);

describe('상세 검색에서 고를 수 있는 옵션', () => {
  it('장비 카테고리는 장비 옵션을 주요 옵션으로 먼저 두고, 숫자 옵션을 뒤에 가나다순으로 둔다', () => {
    const choices = optionChoices('검', [], []);
    const main = choices.filter((choice) => choice.main).map((choice) => choice.label);
    expect(main).toEqual(['세공', '인챈트', '특별 개조', '에르그', '색상', '세트 효과']);
    const others = choices.filter((choice) => !choice.main).map((choice) => choice.label);
    expect(others).toContain('최대 공격');
    expect(others).toContain('밸런스');
    expect(others).toEqual([...others].sort((a, b) => a.localeCompare(b, 'ko')));
  });

  it('유물은 무리아스 유물, 분양 메달은 펫 정보를 둔다. 장비 옵션은 없다', () => {
    expect(labels('유물')).toContain('무리아스 유물');
    expect(labels('유물')).not.toContain('세공');
    expect(labels('분양 메달')).toContain('펫 정보');
  });

  it('에코스톤, 토템, 인챈트 스크롤에도 그 아이템의 옵션을 둔다', () => {
    expect(labels('에코스톤')).toEqual(
      expect.arrayContaining(['에코스톤 고유 능력', '에코스톤 각성 능력', '에코스톤 등급']),
    );
    expect(labels('애뮬릿')).toEqual(expect.arrayContaining(['토템 효과', '토템 추가 옵션']));
    expect(labels('인챈트 스크롤')).toContain('인챈트');
  });

  it('전체에서는 모든 카테고리의 옵션을 두고, 묶음은 그 아래 카테고리의 옵션을 합친다', () => {
    const all = labels('');
    expect(all).toEqual(expect.arrayContaining(['세공', '무리아스 유물', '펫 정보', '토템 효과', '밸런스']));
    expect(labels(groupKeyOf('원거리 장비'))).toContain('세공');
  });

  it('불러온 매물에 있는 옵션은 카테고리 표에 없어도 두고, 건수를 붙인다', () => {
    const catalog = buildOptionCatalog([{ item_option: [{ option_type: '새 옵션', option_value: '12' }] }]);
    const choice = optionChoices('뷰티 쿠폰', catalog, []).find((each) => each.label === '새 옵션');
    expect(choice).toMatchObject({ kind: 'number', count: 1 });
  });

  it('칸이 이미 있는 옵션은 뺀다', () => {
    expect(labels('검', [newCondition({ kind: 'reforge', optionType: '세공 옵션' })])).not.toContain('세공');
  });
});

describe('열어 볼 옵션이 있는지', () => {
  it('붙는 옵션이 없는 카테고리는 없다. 불러온 매물에 걸 옵션이나 건 조건이 있으면 있다', () => {
    expect(hasDetailOptions('검', [], EMPTY_OPTION_FILTER)).toBe(true);
    expect(hasDetailOptions('뷰티 쿠폰', [], EMPTY_OPTION_FILTER)).toBe(true);
    expect(hasDetailOptions('말풍선 스티커', [], EMPTY_OPTION_FILTER)).toBe(false);
    expect(
      hasDetailOptions(
        '말풍선 스티커',
        buildOptionCatalog([{ item_option: [{ option_type: '내구력', option_value: '5' }] }]),
        EMPTY_OPTION_FILTER,
      ),
    ).toBe(true);
  });
});
