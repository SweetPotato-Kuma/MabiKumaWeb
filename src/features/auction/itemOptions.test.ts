import { describe, expect, it } from 'vitest';
import {
  colorPartLabel,
  formatOptionValue,
  groupItemOptions,
  isCurrentMaxOption,
  parseRgb,
  splitEffects,
} from './itemOptions';
import type { ItemOption } from './types';

function option(type: string, value?: string, desc?: string): ItemOption {
  return { option_type: type, option_value: value, option_desc: desc };
}

describe('parseRgb', () => {
  it('넥슨이 주는 형태를 읽는다', () => {
    expect(parseRgb('255,255,255')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseRgb('43,62,58')).toEqual({ r: 43, g: 62, b: 58 });
  });

  it('공백이 섞여도 읽는다', () => {
    expect(parseRgb('214, 189, 181')).toEqual({ r: 214, g: 189, b: 181 });
  });

  it('형태가 다르면 색으로 그리지 않는다', () => {
    // 엉뚱한 색을 자신 있게 보여 주느니 원래 문자열을 두는 편이 낫다.
    expect(parseRgb('인챈트 실패')).toBeNull();
    expect(parseRgb('255,255')).toBeNull();
    expect(parseRgb('256,0,0')).toBeNull();
    expect(parseRgb('')).toBeNull();
    expect(parseRgb(undefined)).toBeNull();
  });
});

describe('splitEffects', () => {
  it('쉼표로 붙어 온 효과를 줄 단위로 나눈다', () => {
    expect(splitEffects('수리비 200% 증가,체력 10 증가,최소대미지 40 증가')).toEqual([
      '수리비 200% 증가',
      '체력 10 증가',
      '최소대미지 40 증가',
    ]);
  });

  it('괄호 안의 쉼표로는 나누지 않는다', () => {
    /**
     * "배쉬 랭크 1 이상일 때 최대대미지 60 증가" 처럼 조건이 붙은 문장이나
     * 괄호 안에 쉼표가 들어간 수치 설명이 반으로 잘리면 뜻이 사라진다.
     */
    expect(splitEffects('최대 공격력(10레벨:20 증가,15레벨:30 증가),크리티컬 15 증가')).toEqual([
      '최대 공격력(10레벨:20 증가,15레벨:30 증가)',
      '크리티컬 15 증가',
    ]);
  });

  it('설명이 없으면 빈 목록을 준다', () => {
    expect(splitEffects(undefined)).toEqual([]);
    expect(splitEffects('')).toEqual([]);
  });
});

describe('colorPartLabel', () => {
  it('파트 이름을 남긴다', () => {
    expect(colorPartLabel(option('아이템 색상 파트 A'))).toBe('파트 A');
    expect(colorPartLabel(option('아이템 색상 파트 E'))).toBe('파트 E');
  });
});

describe('formatOptionValue', () => {
  it('최소와 최대 대미지는 범위로 잇는다', () => {
    const value = { option_type: '공격', option_value: '292', option_value2: '353' };

    expect(formatOptionValue(value)).toBe('292 ~ 353');
  });

  it('현재와 최대인 값은 범위처럼 보이지 않게 잇는다', () => {
    /**
     * 내구력 26~26 은 26 에서 26 사이가 아니라 26 중 26 이다. 개조도 마찬가지로
     * 쓴 칸과 전체 칸이다. 물결로 이으면 값이 폭을 가진 것처럼 읽힌다.
     */
    expect(formatOptionValue({ option_type: '내구력', option_value: '26', option_value2: '26' })).toBe('26 / 26');
    expect(formatOptionValue({ option_type: '일반 개조', option_value: '5', option_value2: '5' })).toBe('5 / 5');
    expect(formatOptionValue({ option_type: '에르그 S', option_value: '50', option_value2: '50' })).toBe('50 / 50');
  });

  it('값이 하나면 그대로 둔다', () => {
    expect(formatOptionValue({ option_type: '크리티컬', option_value: '26%' })).toBe('26%');
    expect(formatOptionValue({ option_type: '보석 개조', option_value: '1' })).toBe('1');
  });

  it('값이 없으면 빈 칸을 티 낸다', () => {
    expect(formatOptionValue({ option_type: '공격' })).toBe('-');
  });
});

describe('isCurrentMaxOption', () => {
  it('범위인 것과 현재/최대인 것을 가른다', () => {
    expect(isCurrentMaxOption('공격')).toBe(false);
    expect(isCurrentMaxOption('부상률')).toBe(false);
    expect(isCurrentMaxOption('내구력')).toBe(true);
    expect(isCurrentMaxOption('특별 개조 R')).toBe(true);
  });
});

describe('groupItemOptions', () => {
  const OPTIONS = [
    option('아이템 보호', '인챈트 실패'),
    option('공격', '292 ~ 353'),
    option('크리티컬', '26%'),
    option('내구력', '26 ~ 26'),
    option('아이템 색상 파트 A', '255,255,255'),
    option('아이템 색상 파트 D', '43,62,58'),
    option('인챈트 접두', '파괴적인 (랭크 6)', '수리비 200% 증가,체력 10 증가'),
    option('일반 개조', '5 ~ 5'),
    option('세공 옵션 1', '최대 공격력(10레벨:20 증가)'),
    option('세트 효과 1', '파이널 히트 강화 ~ 5'),
  ];

  it('보호는 따로 빼낸다', () => {
    const { protections, groups } = groupItemOptions(OPTIONS);

    // 값이 "상태" 가 아니라 "막아 주는 상황" 이라 표의 한 칸에 두면 상태처럼 읽힌다.
    expect(protections.map((item) => item.option_value)).toEqual(['인챈트 실패']);
    expect(groups.find((group) => group.title === '기타')).toBeUndefined();
  });

  it('색상은 따로 빼낸다', () => {
    const { colors } = groupItemOptions(OPTIONS);

    expect(colors.map((item) => item.option_type)).toEqual(['아이템 색상 파트 A', '아이템 색상 파트 D']);
  });

  it('정해진 순서대로 묶는다', () => {
    const { groups } = groupItemOptions(OPTIONS);

    expect(groups.map((group) => group.title)).toEqual(['기본 능력', '인챈트', '개조', '세공', '세트 효과']);
  });

  it('어느 옵션도 잃지 않는다', () => {
    const { groups, colors, protections } = groupItemOptions(OPTIONS);
    const kept = groups.flatMap((group) => group.options).length + colors.length + protections.length;

    // 규칙에 없다고 버리면 사용자는 그 옵션에 영영 닿지 못한다.
    expect(kept).toBe(OPTIONS.length);
  });

  it('규칙에 없는 옵션은 기타로 모은다', () => {
    const { groups } = groupItemOptions([option('처음 보는 옵션', '1')]);

    expect(groups.map((group) => group.title)).toEqual(['기타']);
  });

  it('빈 묶음은 내보내지 않는다', () => {
    const { groups } = groupItemOptions([option('공격', '1 ~ 2')]);

    expect(groups.map((group) => group.title)).toEqual(['기본 능력']);
  });

  it('옵션이 없어도 터지지 않는다', () => {
    expect(groupItemOptions(undefined)).toEqual({ groups: [], colors: [], protections: [] });
  });
});
