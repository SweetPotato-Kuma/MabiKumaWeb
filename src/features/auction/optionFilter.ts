import { hexToRgb, similarity, type Rgb } from '@/features/bags/color';
import { normalizeForSearch } from './dictionary';
import type { ItemOption } from './types';

/**
 * 매물 세부 옵션으로 거르기.
 *
 * 넥슨 경매장 API 는 이름과 카테고리로만 찾고 옵션으로는 찾지 못한다. 그래서 받아 온 매물을
 * 화면에서 옵션으로 거른다. 거른 결과는 "불러온 것 가운데" 맞는 것이라, 화면은 불러온 건수와
 * 맞는 건수를 같이 적고, 모자라면 다음 묶음을 더 받는다.
 */

/** 세공 조건 하나. "스매시 대미지" 가 들어간 세공이 5레벨 이상. 둘 다 비우면 조건이 아니다. */
export interface ReforgeCondition {
  keyword: string;
  minLevel: number | null;
}

/** 색 조건. part 가 비면 아무 파트나. 염색 앰플처럼 파트가 없는 색은 파트와 상관없이 본다. */
export interface ColorCondition {
  hex: string;
  part: string;
  /** 0~100. 주머니 찾기와 같은 비슷함 점수. */
  minSimilarity: number;
}

export interface OptionFilter {
  reforges: ReforgeCondition[];
  /** 인챈트 이름 일부. 접두와 접미 가운데 아무거나. */
  enchant: string;
  /** 특별 개조. type 이 비면 R, S 아무거나. */
  specialType: '' | 'R' | 'S';
  minSpecialStep: number | null;
  minErgLevel: number | null;
  color: ColorCondition | null;
  /** 옵션 어디에든 들어 있는 문구. 위 칸에 없는 옵션(세트 효과, 장인 개조 등)을 찾을 때 쓴다. */
  text: string;
}

export const EMPTY_OPTION_FILTER: OptionFilter = {
  reforges: [{ keyword: '', minLevel: null }],
  enchant: '',
  specialType: '',
  minSpecialStep: null,
  minErgLevel: null,
  color: null,
  text: '',
};

/** 세공 조건은 세 줄까지. 장비의 세공 옵션이 최대 세 줄이다. */
export const MAX_REFORGE_CONDITIONS = 3;

const isReforgeActive = (condition: ReforgeCondition) =>
  normalizeForSearch(condition.keyword) !== '' || condition.minLevel !== null;

/** 걸러 볼 조건이 하나라도 있는지. */
export function activeConditionCount(filter: OptionFilter): number {
  return (
    filter.reforges.filter(isReforgeActive).length +
    (normalizeForSearch(filter.enchant) ? 1 : 0) +
    (filter.specialType || filter.minSpecialStep !== null ? 1 : 0) +
    (filter.minErgLevel !== null ? 1 : 0) +
    (filter.color ? 1 : 0) +
    (normalizeForSearch(filter.text) ? 1 : 0)
  );
}

export interface Reforge {
  name: string;
  level: number;
}

/** "퓨리 오브 라이트 대미지(4레벨:12 % 증가)" → { name: "퓨리 오브 라이트 대미지", level: 4 } */
export function parseReforge(value: string | undefined): Reforge | null {
  const match = /^(.*?)\((\d+)레벨/.exec(value?.trim() ?? '');
  if (!match) return null;
  return { name: match[1].trim(), level: Number(match[2]) };
}

const toNumber = (value: string | undefined): number | null => {
  const number = Number.parseFloat(value ?? '');
  return Number.isFinite(number) ? number : null;
};

/** "132,192,122" → { r, g, b } */
function parseRgb(value: string | undefined): Rgb | null {
  const parts = (value ?? '').split(',').map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  return { r: parts[0], g: parts[1], b: parts[2] };
}

/**
 * 세공 조건을 모두 채우는지. 한 세공 옵션이 두 조건을 한꺼번에 채울 수는 없다.
 * 조건과 옵션이 세 개 이하라 모든 짝을 다 대 본다.
 */
function matchesReforges(options: ItemOption[], conditions: ReforgeCondition[]): boolean {
  const active = conditions.filter(isReforgeActive);
  if (active.length === 0) return true;
  const reforges = options
    .filter((option) => option.option_type.startsWith('세공'))
    .map((option) => parseReforge(option.option_value))
    .filter((reforge): reforge is Reforge => reforge !== null);

  const fits = (reforge: Reforge, condition: ReforgeCondition) =>
    normalizeForSearch(reforge.name).includes(normalizeForSearch(condition.keyword)) &&
    (condition.minLevel === null || reforge.level >= condition.minLevel);

  const assign = (index: number, used: Set<number>): boolean => {
    if (index === active.length) return true;
    return reforges.some(
      (reforge, at) =>
        !used.has(at) && fits(reforge, active[index]) && assign(index + 1, new Set(used).add(at)),
    );
  };
  return assign(0, new Set());
}

function matchesColor(options: ItemOption[], condition: ColorCondition): boolean {
  const target = hexToRgb(condition.hex);
  if (!target) return true;
  return options.some((option) => {
    const isPartColor = option.option_type === '아이템 색상';
    const isPlainColor = option.option_type === '색상';
    if (!isPartColor && !isPlainColor) return false;
    // "파트 A" 처럼 온다. 파트가 없는 색(염색 앰플)은 파트를 골라도 본다.
    if (isPartColor && condition.part && option.option_sub_type !== `파트 ${condition.part}`)
      return false;
    const rgb = parseRgb(option.option_value);
    return rgb !== null && similarity(rgb, target) >= condition.minSimilarity;
  });
}

/** 매물이 옵션 조건을 모두 채우는지. 조건이 없으면 늘 참이다. */
export function matchesOptionFilter(
  item: { item_option?: ItemOption[] },
  filter: OptionFilter,
): boolean {
  const options = item.item_option ?? [];

  if (!matchesReforges(options, filter.reforges)) return false;

  const enchant = normalizeForSearch(filter.enchant);
  if (
    enchant &&
    !options.some(
      (option) =>
        option.option_type === '인챈트' &&
        normalizeForSearch(option.option_value ?? '').includes(enchant),
    )
  )
    return false;

  if (filter.specialType || filter.minSpecialStep !== null) {
    const ok = options.some((option) => {
      if (option.option_type !== '특별 개조') return false;
      if (filter.specialType && option.option_sub_type !== filter.specialType) return false;
      const step = toNumber(option.option_value);
      return filter.minSpecialStep === null || (step !== null && step >= filter.minSpecialStep);
    });
    if (!ok) return false;
  }

  if (filter.minErgLevel !== null) {
    const min = filter.minErgLevel;
    const ok = options.some((option) => {
      const level = option.option_type === '에르그' ? toNumber(option.option_value) : null;
      return level !== null && level >= min;
    });
    if (!ok) return false;
  }

  if (filter.color && !matchesColor(options, filter.color)) return false;

  const text = normalizeForSearch(filter.text);
  if (
    text &&
    !options.some((option) =>
      normalizeForSearch(
        [
          option.option_type,
          option.option_sub_type,
          option.option_value,
          option.option_value2,
          option.option_desc,
        ]
          .filter(Boolean)
          .join(' '),
      ).includes(text),
    )
  )
    return false;

  return true;
}

/**
 * 조건에 걸린 옵션을 짧은 글로. 표에는 옵션 칸이 없어서, 조건을 걸었을 때 이름 아래에 적어
 * 왜 걸렸는지 누르지 않고도 보이게 한다. 조건이 없는 항목은 적지 않는다.
 */
export function describeMatch(
  item: { item_option?: ItemOption[] },
  filter: OptionFilter,
): string[] {
  const options = item.item_option ?? [];
  const notes: string[] = [];

  if (filter.reforges.some(isReforgeActive)) {
    const reforges = options
      .filter((option) => option.option_type.startsWith('세공'))
      .map((option) => parseReforge(option.option_value))
      .filter((reforge): reforge is Reforge => reforge !== null)
      .map((reforge) => `${reforge.name} ${reforge.level}레벨`);
    if (reforges.length > 0) notes.push(`세공: ${reforges.join(', ')}`);
  }
  if (normalizeForSearch(filter.enchant)) {
    const enchants = options
      .filter((option) => option.option_type === '인챈트')
      .map((option) => option.option_value ?? '');
    if (enchants.length > 0) notes.push(`인챈트: ${enchants.join(', ')}`);
  }
  if (filter.specialType || filter.minSpecialStep !== null) {
    const special = options.find((option) => option.option_type === '특별 개조');
    if (special)
      notes.push(`특별 개조 ${special.option_sub_type ?? ''}${special.option_value ?? ''}`);
  }
  if (filter.minErgLevel !== null) {
    const erg = options.find((option) => option.option_type === '에르그');
    if (erg) notes.push(`에르그 ${erg.option_sub_type ?? ''} ${erg.option_value ?? ''}레벨`);
  }
  if (filter.color) {
    const target = hexToRgb(filter.color.hex);
    const best = options
      .filter((option) => option.option_type === '아이템 색상' || option.option_type === '색상')
      .map((option) => ({ option, rgb: parseRgb(option.option_value) }))
      .filter((entry): entry is { option: ItemOption; rgb: Rgb } => entry.rgb !== null)
      .map((entry) => ({ ...entry, score: target ? similarity(entry.rgb, target) : 0 }))
      .sort((a, b) => b.score - a.score)[0];
    if (best) {
      const part = best.option.option_sub_type ? `${best.option.option_sub_type} ` : '';
      notes.push(`${part}R:${best.rgb.r} G:${best.rgb.g} B:${best.rgb.b} (비슷함 ${best.score}%)`);
    }
  }
  return notes;
}
