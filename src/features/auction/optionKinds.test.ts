import { describe, expect, it } from 'vitest';
import { groupKeyOf } from './categoryTree';
import { buildOptionCatalog, EMPTY_OPTION_FILTER, newCondition, type Condition } from './optionFilter';
import { DETAIL_OPTION_LABELS, hasDetailOptions, optionChoices } from './optionKinds';

const labels = (category: string, conditions: Condition[] = []) =>
  optionChoices(category, [], conditions).map((choice) => choice.label);

describe('상세 검색에서 고를 수 있는 옵션', () => {
  it('장비 카테고리는 장비 옵션을 가나다순으로 둔다', () => {
    expect(labels('검')).toEqual(['밸런스', '색상', '세공', '세트 효과', '에르그', '인챈트', '특별 개조']);
  });

  it('유물은 무리아스 유물, 분양 메달은 펫 정보만 둔다', () => {
    expect(labels('유물')).toEqual(['무리아스 유물']);
    expect(labels('분양 메달')).toEqual(['펫 정보']);
  });

  it('에코스톤, 토템, 인챈트 스크롤에도 그 아이템의 옵션을 둔다', () => {
    expect(labels('에코스톤')).toEqual(['에코스톤 각성 능력', '에코스톤 고유 능력', '에코스톤 등급']);
    expect(labels('애뮬릿')).toEqual(['토템 추가 옵션', '토템 효과']);
    expect(labels('인챈트 스크롤')).toEqual(['인챈트']);
  });

  it('전체에서는 고를 수 있는 옵션을 모두 두고, 묶음은 그 아래 카테고리의 옵션을 합친다', () => {
    expect(labels('')).toEqual([...DETAIL_OPTION_LABELS].sort((a, b) => a.localeCompare(b, 'ko')));
    expect(labels(groupKeyOf('원거리 장비'))).toContain('세공');
  });

  it('불러온 매물에 있어도 정한 옵션이 아니면 두지 않는다', () => {
    const catalog = buildOptionCatalog([
      { item_option: [{ option_type: '내구력', option_value: '12' }, { option_type: '밸런스', option_value: '60%' }] },
    ]);
    const choices = optionChoices('뷰티 쿠폰', catalog, []).map((choice) => choice.label);
    expect(choices).toEqual(['밸런스']);
  });

  it('칸이 이미 있는 옵션은 뺀다', () => {
    expect(labels('검', [newCondition({ kind: 'reforge', optionType: '세공 옵션' })])).not.toContain('세공');
  });
});

describe('열어 볼 옵션이 있는지', () => {
  it('고를 옵션이 붙지 않는 카테고리는 없다. 불러온 매물에 걸 옵션이나 건 조건이 있으면 있다', () => {
    expect(hasDetailOptions('검', [], EMPTY_OPTION_FILTER)).toBe(true);
    expect(hasDetailOptions('뷰티 쿠폰', [], EMPTY_OPTION_FILTER)).toBe(false);
    expect(
      hasDetailOptions(
        '뷰티 쿠폰',
        buildOptionCatalog([{ item_option: [{ option_type: '아이템 색상', option_value: '1,2,3' }] }]),
        EMPTY_OPTION_FILTER,
      ),
    ).toBe(true);
    expect(
      hasDetailOptions('뷰티 쿠폰', [], { conditions: [{ id: 1, kind: 'erg', grade: '', minLevel: 3 }] }),
    ).toBe(true);
  });
});
