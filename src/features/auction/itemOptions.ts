import type { ItemOption } from './types';

/**
 * 매물 상세에 쓰는 옵션 해석.
 *
 * 넥슨 API 는 옵션을 종류 구분 없이 한 배열로 준다. 그대로 늘어놓으면 장비 하나에
 * 스물몇 줄이 되고, 색상 다섯 줄과 인챈트 설명이 섞여 무엇이 중요한지 보이지 않는다.
 * 여기서 묶고, 색상 값을 색으로 바꾸고, 붙어 있는 효과 문장을 나눈다.
 */

/** 화면에 묶어 보여 줄 단위. 순서가 곧 화면에 나오는 순서다. */
export interface OptionGroup {
  title: string;
  options: ItemOption[];
  /** 값이 짧아 두 칸으로 놓아도 되는 묶음인지. 줄 수를 절반으로 줄인다. */
  dense: boolean;
}

/**
 * 묶음 정의. 앞의 것부터 먼저 가져간다.
 *
 * `prefixes` 는 option_type 의 시작 문자열이다. 넥슨이 "세공 옵션 1" 처럼 번호를
 * 붙여 주므로 정확히 일치가 아니라 시작으로 본다.
 */
const GROUP_RULES: { title: string; prefixes: string[]; dense: boolean }[] = [
  {
    title: '기본 능력',
    prefixes: [
      '공격',
      '부상률',
      '크리티컬',
      '밸런스',
      '숙련',
      '내구력',
      '방어력',
      '보호',
      '마법 방어력',
      '마법 보호',
    ],
    dense: true,
  },
  { title: '인챈트', prefixes: ['인챈트'], dense: false },
  { title: '개조', prefixes: ['일반 개조', '보석 개조', '특별 개조', '에르그'], dense: true },
  { title: '세공', prefixes: ['세공'], dense: false },
  { title: '세트 효과', prefixes: ['세트 효과'], dense: false },
];

const COLOR_PREFIX = '아이템 색상';
const PROTECTION_PREFIX = '아이템 보호';

/**
 * 두 값이 "범위" 가 아니라 "현재와 최대" 인 옵션.
 *
 * 공격 292~353 은 최소와 최대 대미지라 물결이 맞다. 그런데 내구력 26~26 이나
 * 일반 개조 5~5 는 범위가 아니라 26 중 26, 5 중 5 다. 같은 물결로 그리면 값이
 * 폭을 가진 것처럼 읽힌다. 넥슨 스펙에 명시된 구분이 아니라 게임 안의 뜻을 따른
 * 해석이므로, 틀렸다면 이 목록만 고치면 된다.
 */
const CURRENT_MAX_PREFIXES = ['내구력', '일반 개조', '보석 개조', '특별 개조', '에르그'];

export function isCurrentMaxOption(optionType: string): boolean {
  return CURRENT_MAX_PREFIXES.some((prefix) => optionType.startsWith(prefix));
}

/** 아이템을 지켜 주는 항목인지. 값이 "상태" 가 아니라 "막아 주는 상황" 이라 따로 그린다. */
export function isProtectionOption(option: ItemOption): boolean {
  return option.option_type.startsWith(PROTECTION_PREFIX);
}

/** 값 두 개를 무슨 기호로 이을지까지 정해서 돌려준다. */
export function formatOptionValue(option: ItemOption): string {
  const first = option.option_value?.trim();
  const second = option.option_value2?.trim();

  if (!first && !second) return '-';
  if (!second) return first ?? '-';
  if (!first) return second;

  return isCurrentMaxOption(option.option_type) ? `${first} / ${second}` : `${first} ~ ${second}`;
}

/** rgb 세 값. 넥슨이 "255,255,255" 형태로 준다. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * 색상 값을 숫자 셋으로 읽는다.
 *
 * 형태가 다르거나 0-255 를 벗어나면 색으로 그리지 않는다. 엉뚱한 색을 자신 있게
 * 보여 주느니 원래 문자열을 그대로 두는 편이 낫다.
 */
export function parseRgb(value: string | undefined): Rgb | null {
  if (!value) return null;

  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 3) return null;

  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (numbers.some((n) => Number.isNaN(n) || n > 255)) return null;

  const [r, g, b] = numbers as [number, number, number];
  return { r, g, b };
}

export function rgbToCss({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** 색상 칸인지. 색상은 다섯 줄을 차지하므로 한 줄로 모아 따로 그린다. */
export function isColorOption(option: ItemOption): boolean {
  return option.option_type.startsWith(COLOR_PREFIX);
}

/**
 * 색상 칸의 파트 이름. 한 줄에 다섯 개를 놓을 때 쓴다.
 *
 * 파트는 option_type 이 아니라 option_sub_type 에 들어 있다.
 * option_type 은 다섯 칸 모두 "아이템 색상" 으로 같고, 무엇을 칠하는지는 "파트 A" 처럼
 * option_sub_type 이 말해 준다. 화면에 보이던 "아이템 색상 파트 A" 는 둘을 이어 붙인
 * 결과였지 한 필드의 값이 아니었다.
 */
export function colorPartLabel(option: ItemOption): string {
  const subType = option.option_sub_type?.trim();
  if (subType) return subType;

  // 파트가 비어 오면 종류 이름이라도 남긴다. 빈 라벨보다는 낫다.
  return option.option_type.slice(COLOR_PREFIX.length).trim() || option.option_type;
}

/**
 * 효과 설명을 문장 단위로 나눈다.
 *
 * "수리비 200% 증가,체력 10 증가,최소대미지 40 증가" 처럼 쉼표로 붙어 온다. 한 줄로
 * 두면 읽을 수가 없다. 다만 "최대 공격력(10레벨:20 증가)" 같이 괄호 안에 쉼표가 들어가는
 * 경우가 있어 괄호 안은 건드리지 않는다.
 */
export function splitEffects(description: string | undefined): string[] {
  if (!description) return [];

  const effects: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of description) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) effects.push(trimmed);
      current = '';
      continue;
    }
    current += char;
  }

  const last = current.trim();
  if (last) effects.push(last);

  return effects;
}

/**
 * 옵션을 묶음으로 나눈다.
 *
 * 어느 묶음에도 안 걸리는 것은 '기타' 로 모은다. 규칙에 없다고 버리면 사용자는 그
 * 옵션에 영영 닿지 못한다. 빈 묶음은 화면에 내보내지 않는다.
 */
export function groupItemOptions(options: readonly ItemOption[] | undefined): {
  groups: OptionGroup[];
  colors: ItemOption[];
  protections: ItemOption[];
} {
  const colors: ItemOption[] = [];
  const protections: ItemOption[] = [];
  const buckets = new Map<string, ItemOption[]>();
  const others: ItemOption[] = [];

  for (const option of options ?? []) {
    if (isColorOption(option)) {
      colors.push(option);
      continue;
    }

    if (isProtectionOption(option)) {
      protections.push(option);
      continue;
    }

    const rule = GROUP_RULES.find((candidate) =>
      candidate.prefixes.some((prefix) => option.option_type.startsWith(prefix)),
    );

    if (!rule) {
      others.push(option);
      continue;
    }

    const bucket = buckets.get(rule.title);
    if (bucket) bucket.push(option);
    else buckets.set(rule.title, [option]);
  }

  const groups: OptionGroup[] = GROUP_RULES.filter((rule) => buckets.has(rule.title)).map((rule) => ({
    title: rule.title,
    options: buckets.get(rule.title) ?? [],
    dense: rule.dense,
  }));

  if (others.length > 0) {
    groups.push({ title: '기타', options: others, dense: false });
  }

  return { groups, colors, protections };
}
