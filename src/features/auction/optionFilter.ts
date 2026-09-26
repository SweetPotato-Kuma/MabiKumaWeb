import { hexToRgb, similarity, type Rgb } from '@/features/bags/color';
import { normalizeForSearch } from './dictionary';
import { isCurrentMaxOption } from './itemOptions';
import type { ItemOption } from './types';

/**
 * 경매장 상세 검색(세부 옵션 조건).
 *
 * 넥슨 경매장 API 는 이름과 카테고리로만 찾고 옵션으로는 찾지 못한다. 그래서 받아 온 매물을
 * 화면에서 옵션으로 거른다. 결과는 "불러온 것 가운데" 맞는 것이라, 화면은 불러온 건수와
 * 맞는 건수를 같이 적고, 모자라면 다음 묶음을 더 받는다.
 *
 * 조건은 사용자가 하나씩 더하는 블록이다. 더할 수 있는 옵션과 자동완성 거리(세공 이름, 인챈트
 * 이름, 세트 효과 이름, 레벨 값)는 지금 불러온 매물에서 뽑는다(buildOptionCatalog). 카테고리마다
 * 있는 옵션이 달라서 고정 목록을 두면 없는 옵션을 고르게 되고, 게임에 새 옵션이 생기면 낡는다.
 */

/** 조건 종류. 옵션 모양에 따라 입력칸이 다르다. */
export type Condition =
  /** 세공. name 이 비면 아무 세공. "스매시 대미지" 가 5레벨 이상. */
  | { id: number; kind: 'reforge'; name: string; minLevel: number | null }
  /** 인챈트. 접두와 접미를 따로 본다. 이름은 랭크를 뗀 것. 둘 다 주면 둘 다 맞아야 한다. */
  | { id: number; kind: 'enchant'; prefix: string; suffix: string }
  /** 특별 개조. type 이 비면 R, S 아무거나. */
  | { id: number; kind: 'special'; type: '' | 'R' | 'S'; minStep: number | null }
  /** 에르그. grade 가 비면 아무 등급. */
  | { id: number; kind: 'erg'; grade: string; minLevel: number | null }
  /** 색. part 가 비면 아무 파트. 파트가 없는 색(염색 앰플)은 파트를 골라도 본다. */
  | { id: number; kind: 'color'; hex: string; part: string; minSimilarity: number }
  /** 숫자 옵션(최대 공격, 크리티컬, 방어력 등)이 min 이상. */
  | { id: number; kind: 'number'; optionType: string; min: number | null }
  /** 그 밖의 옵션(세트 효과, 장인 개조 등)에 문구가 들어 있다. */
  | { id: number; kind: 'text'; optionType: string; text: string };

export type ConditionKind = Condition['kind'];

export interface OptionFilter {
  conditions: Condition[];
}

export const EMPTY_OPTION_FILTER: OptionFilter = { conditions: [] };

/** 인챈트 칸 이름. 넥슨이 option_sub_type 에 이 글자로 준다. */
export const ENCHANT_PREFIX = '접두';
export const ENCHANT_SUFFIX = '접미';

/** 옵션 이름으로 어떤 입력칸을 쓸지. 숫자인지 문구인지는 값을 보고 가른다(buildOptionCatalog). */
const KIND_BY_TYPE: Record<string, ConditionKind> = {
  '세공 옵션': 'reforge',
  인챈트: 'enchant',
  '특별 개조': 'special',
  에르그: 'erg',
  '아이템 색상': 'color',
  색상: 'color',
};

/** 두 색 옵션은 조건 하나로 다룬다. 장비 파트 색과 염색 앰플 색. */
export const COLOR_OPTION_LABEL = '색상';

/** 조건이 실제로 무엇을 거르는지. 빈 칸만 있는 블록은 아직 조건이 아니다. */
export function isConditionActive(condition: Condition): boolean {
  switch (condition.kind) {
    case 'reforge':
      return normalizeForSearch(condition.name) !== '' || condition.minLevel !== null;
    case 'enchant':
      return (
        normalizeForSearch(condition.prefix) !== '' || normalizeForSearch(condition.suffix) !== ''
      );
    case 'special':
      return condition.type !== '' || condition.minStep !== null;
    case 'erg':
      return condition.grade !== '' || condition.minLevel !== null;
    case 'color':
      return hexToRgb(condition.hex) !== null;
    case 'number':
      return condition.min !== null;
    case 'text':
      return normalizeForSearch(condition.text) !== '';
  }
}

export function activeConditionCount(filter: OptionFilter): number {
  return filter.conditions.filter(isConditionActive).length;
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

/** "울프헌터 (랭크 C)" → "울프헌터" */
export function enchantName(value: string | undefined): string {
  return (value ?? '').replace(/\s*\(랭크[^)]*\)\s*$/, '').trim();
}

const toNumber = (value: string | undefined): number | null => {
  const number = Number.parseFloat((value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
};

/**
 * 숫자 옵션에서 비교할 값. 공격 40~100 처럼 범위면 큰 쪽(최대 공격), 내구력 14/14 처럼
 * 현재와 최대면 현재 값, 값이 하나면 그 값. 크리티컬 "19%" 는 19 로 본다.
 */
export function optionNumber(option: ItemOption): number | null {
  const first = toNumber(option.option_value);
  const second = toNumber(option.option_value2);
  if (second !== null && !isCurrentMaxOption(option.option_type)) return second;
  return first;
}

/** "132,192,122" → { r, g, b } */
function parseRgb(value: string | undefined): Rgb | null {
  const parts = (value ?? '').split(',').map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  return { r: parts[0], g: parts[1], b: parts[2] };
}

const isColorOption = (option: ItemOption) =>
  option.option_type === '아이템 색상' || option.option_type === '색상';

const reforgesOf = (options: ItemOption[]) =>
  options
    .filter((option) => option.option_type.startsWith('세공'))
    .map((option) => parseReforge(option.option_value))
    .filter((reforge): reforge is Reforge => reforge !== null);

const enchantIn = (options: ItemOption[], slot: string, name: string) => {
  const needle = normalizeForSearch(name);
  return options.some(
    (option) =>
      option.option_type === '인챈트' &&
      option.option_sub_type === slot &&
      normalizeForSearch(enchantName(option.option_value)).includes(needle),
  );
};

type ReforgeCondition = Extract<Condition, { kind: 'reforge' }>;

/**
 * 세공 조건을 모두 채우는지. 한 세공 옵션이 두 조건을 한꺼번에 채울 수는 없다.
 * 조건과 옵션이 세 개 이하라 모든 짝을 다 대 본다.
 */
function matchesReforges(options: ItemOption[], conditions: ReforgeCondition[]): boolean {
  if (conditions.length === 0) return true;
  const reforges = reforgesOf(options);
  const fits = (reforge: Reforge, condition: ReforgeCondition) =>
    normalizeForSearch(reforge.name).includes(normalizeForSearch(condition.name)) &&
    (condition.minLevel === null || reforge.level >= condition.minLevel);
  const assign = (index: number, used: Set<number>): boolean => {
    if (index === conditions.length) return true;
    return reforges.some(
      (reforge, at) =>
        !used.has(at) &&
        fits(reforge, conditions[index]) &&
        assign(index + 1, new Set(used).add(at)),
    );
  };
  return assign(0, new Set());
}

/** 세공이 아닌 조건 하나를 채우는지. */
function matchesCondition(options: ItemOption[], condition: Condition): boolean {
  switch (condition.kind) {
    case 'reforge':
      return true;
    case 'enchant':
      return (
        (!normalizeForSearch(condition.prefix) ||
          enchantIn(options, ENCHANT_PREFIX, condition.prefix)) &&
        (!normalizeForSearch(condition.suffix) ||
          enchantIn(options, ENCHANT_SUFFIX, condition.suffix))
      );
    case 'special':
      return options.some((option) => {
        if (option.option_type !== '특별 개조') return false;
        if (condition.type && option.option_sub_type !== condition.type) return false;
        const step = toNumber(option.option_value);
        return condition.minStep === null || (step !== null && step >= condition.minStep);
      });
    case 'erg':
      return options.some((option) => {
        if (option.option_type !== '에르그') return false;
        if (condition.grade && option.option_sub_type !== condition.grade) return false;
        const level = toNumber(option.option_value);
        return condition.minLevel === null || (level !== null && level >= condition.minLevel);
      });
    case 'color': {
      const target = hexToRgb(condition.hex);
      if (!target) return true;
      return options.some((option) => {
        if (!isColorOption(option)) return false;
        // "파트 A" 처럼 온다. 파트가 없는 색(염색 앰플)은 파트를 골라도 본다.
        if (
          option.option_type === '아이템 색상' &&
          condition.part &&
          option.option_sub_type !== `파트 ${condition.part}`
        )
          return false;
        const rgb = parseRgb(option.option_value);
        return rgb !== null && similarity(rgb, target) >= condition.minSimilarity;
      });
    }
    case 'number':
      return options.some((option) => {
        if (option.option_type !== condition.optionType) return false;
        const value = optionNumber(option);
        return condition.min === null || (value !== null && value >= condition.min);
      });
    case 'text': {
      const text = normalizeForSearch(condition.text);
      return options.some(
        (option) =>
          (!condition.optionType || option.option_type === condition.optionType) &&
          normalizeForSearch(
            [option.option_sub_type, option.option_value, option.option_value2, option.option_desc]
              .filter(Boolean)
              .join(' '),
          ).includes(text),
      );
    }
  }
}

/** 매물이 조건을 모두 채우는지. 조건이 없으면 늘 참이다. */
export function matchesOptionFilter(
  item: { item_option?: ItemOption[] },
  filter: OptionFilter,
): boolean {
  const options = item.item_option ?? [];
  const active = filter.conditions.filter(isConditionActive);
  const reforges = active.filter(
    (condition): condition is ReforgeCondition => condition.kind === 'reforge',
  );
  if (!matchesReforges(options, reforges)) return false;
  return active.every((condition) => matchesCondition(options, condition));
}

/** 숫자 조건의 이름. 공격은 범위의 큰 쪽을 보므로 "최대 공격" 이라 부른다. */
export function numberLabel(optionType: string): string {
  if (optionType === '공격') return '최대 공격';
  if (optionType === '부상률') return '최대 부상률';
  return optionType;
}

/** 조건 블록의 이름. */
export function conditionLabel(condition: Condition): string {
  switch (condition.kind) {
    case 'reforge':
      return '세공';
    case 'enchant':
      return '인챈트';
    case 'special':
      return '특별 개조';
    case 'erg':
      return '에르그';
    case 'color':
      return '색상';
    case 'number':
      return numberLabel(condition.optionType);
    case 'text':
      return condition.optionType;
  }
}

/**
 * 조건을 한 줄로. 검색 칸 아래 칩에 쓴다. "세공 스매시 대미지 7레벨 이상".
 * 빈 조건은 빈 문자열이다.
 */
export function summarizeCondition(condition: Condition): string {
  if (!isConditionActive(condition)) return '';
  const label = conditionLabel(condition);
  switch (condition.kind) {
    case 'reforge':
      return [
        label,
        condition.name.trim() || '아무 세공',
        condition.minLevel !== null ? `${condition.minLevel}레벨 이상` : '',
      ]
        .filter(Boolean)
        .join(' ');
    case 'enchant':
      return [
        label,
        condition.prefix.trim() ? `접두 ${condition.prefix.trim()}` : '',
        condition.suffix.trim() ? `접미 ${condition.suffix.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    case 'special':
      return [
        label,
        condition.type,
        condition.minStep !== null ? `${condition.minStep}단계 이상` : '',
      ]
        .filter(Boolean)
        .join(' ');
    case 'erg':
      return [
        label,
        condition.grade ? `${condition.grade}등급` : '',
        condition.minLevel !== null ? `${condition.minLevel}레벨 이상` : '',
      ]
        .filter(Boolean)
        .join(' ');
    case 'color': {
      const rgb = hexToRgb(condition.hex);
      const part = condition.part ? `파트 ${condition.part} ` : '';
      return rgb
        ? `${label} ${part}R:${rgb.r} G:${rgb.g} B:${rgb.b} (${condition.minSimilarity}% 이상)`
        : label;
    }
    case 'number':
      return `${label} ${condition.min} 이상`;
    case 'text':
      return `${label} "${condition.text.trim()}"`;
  }
}

/**
 * 조건에 걸린 옵션을 짧은 글로. 표에는 옵션 칸이 없어서, 조건을 걸었을 때 이름 아래에 적어
 * 왜 걸렸는지 누르지 않고도 보이게 한다. 같은 종류의 조건이 여럿이어도 한 번만 적는다.
 */
export function describeMatch(
  item: { item_option?: ItemOption[] },
  filter: OptionFilter,
): string[] {
  const options = item.item_option ?? [];
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const condition of filter.conditions.filter(isConditionActive)) {
    const key =
      condition.kind === 'number' || condition.kind === 'text'
        ? `${condition.kind}:${condition.optionType}`
        : condition.kind;
    if (seen.has(key)) continue;
    seen.add(key);

    if (condition.kind === 'reforge') {
      const reforges = reforgesOf(options).map((reforge) => `${reforge.name} ${reforge.level}레벨`);
      if (reforges.length > 0) notes.push(`세공: ${reforges.join(', ')}`);
    } else if (condition.kind === 'enchant') {
      const enchants = options
        .filter((option) => option.option_type === '인챈트')
        .map((option) => `${option.option_sub_type ?? ''} ${option.option_value ?? ''}`.trim());
      if (enchants.length > 0) notes.push(`인챈트: ${enchants.join(', ')}`);
    } else if (condition.kind === 'special') {
      const special = options.find((option) => option.option_type === '특별 개조');
      if (special)
        notes.push(`특별 개조 ${special.option_sub_type ?? ''}${special.option_value ?? ''}`);
    } else if (condition.kind === 'erg') {
      const erg = options.find((option) => option.option_type === '에르그');
      if (erg) notes.push(`에르그 ${erg.option_sub_type ?? ''} ${erg.option_value ?? ''}레벨`);
    } else if (condition.kind === 'color') {
      const target = hexToRgb(condition.hex);
      const best = options
        .filter(isColorOption)
        .map((option) => ({ option, rgb: parseRgb(option.option_value) }))
        .filter((entry): entry is { option: ItemOption; rgb: Rgb } => entry.rgb !== null)
        .map((entry) => ({ ...entry, score: target ? similarity(entry.rgb, target) : 0 }))
        .sort((a, b) => b.score - a.score)[0];
      if (best) {
        const part = best.option.option_sub_type ? `${best.option.option_sub_type} ` : '';
        notes.push(
          `${part}R:${best.rgb.r} G:${best.rgb.g} B:${best.rgb.b} (비슷함 ${best.score}%)`,
        );
      }
    } else if (condition.kind === 'number') {
      const option = options.find((each) => each.option_type === condition.optionType);
      const value = option ? optionNumber(option) : null;
      if (value !== null) notes.push(`${numberLabel(condition.optionType)} ${value}`);
    } else {
      const text = normalizeForSearch(condition.text);
      const hit = options.find(
        (option) =>
          option.option_type === condition.optionType &&
          normalizeForSearch(`${option.option_value ?? ''} ${option.option_desc ?? ''}`).includes(
            text,
          ),
      );
      if (hit) notes.push(`${hit.option_type}: ${hit.option_value ?? ''}`);
    }
  }
  return notes;
}

/** 자동완성에 쓸 이름 하나와 그 이름이 있는 매물 수. */
export interface NameCount {
  value: string;
  count: number;
}

/** 조건을 더할 때 고를 수 있는 옵션 하나. 자동완성 거리도 여기 있다. */
export interface CatalogEntry {
  /** 화면에 보이는 이름. 두 색 옵션은 "색상" 하나로 모은다. */
  label: string;
  kind: ConditionKind;
  /** number, text 조건이 볼 옵션 이름. */
  optionType: string;
  /** 이 옵션이 있는 매물 수. */
  count: number;
  /** 이름 자동완성(세공 이름, 세트 효과 이름 등). 많이 나온 순. */
  values: NameCount[];
  /** 옵션 아래 구분 값별 이름(인챈트의 접두, 접미). */
  valuesBySub: Record<string, NameCount[]>;
  /** 에르그 등급, 특별 개조 종류처럼 옵션 아래 구분 값. */
  subTypes: string[];
  /**
   * 숫자 자동완성용. 매물마다 이 옵션에서 가장 큰 숫자(세공 레벨, 에르그 레벨, 특별 개조 단계,
   * 숫자 옵션 값). 키 '' 는 전체, 세공은 이름별로도 둔다. "7 이상이면 몇 건" 을 셀 때 쓴다.
   */
  numbers: Record<string, number[]>;
}

/** 이 조건 종류가 숫자 자동완성에 쓸 값. */
function numberOf(kind: ConditionKind | null, option: ItemOption): number | null {
  switch (kind) {
    case 'reforge':
      return parseReforge(option.option_value)?.level ?? null;
    case 'special':
    case 'erg':
      return toNumber(option.option_value);
    case null:
      return optionNumber(option);
    default:
      return null;
  }
}

/**
 * 불러온 매물에 있는 옵션으로 "조건 추가" 목록과 자동완성 거리를 만든다. 많이 나온 옵션이 위에
 * 온다. 값이 모두 숫자인 옵션은 숫자 조건, 아니면 문구 조건이다.
 */
export function buildOptionCatalog(
  items: readonly { item_option?: ItemOption[] }[],
): CatalogEntry[] {
  interface Tally {
    kind: ConditionKind | null;
    optionType: string;
    items: number;
    numeric: boolean;
    values: Map<string, number>;
    valuesBySub: Map<string, Map<string, number>>;
    subTypes: Set<string>;
    numbers: Map<string, number[]>;
  }
  const tallies = new Map<string, Tally>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const item of items) {
    // 한 매물 안에서 옵션마다(세공은 이름마다) 가장 큰 숫자 하나만 센다.
    const maxHere = new Map<string, Map<string, number>>();
    const seenHere = new Set<string>();
    const namesHere = new Set<string>();

    for (const option of item.item_option ?? []) {
      const fixed = KIND_BY_TYPE[option.option_type] ?? null;
      const label = fixed === 'color' ? COLOR_OPTION_LABEL : option.option_type;
      let tally = tallies.get(label);
      if (!tally) {
        tally = {
          kind: fixed,
          optionType: option.option_type,
          items: 0,
          numeric: true,
          values: new Map(),
          valuesBySub: new Map(),
          subTypes: new Set(),
          numbers: new Map(),
        };
        tallies.set(label, tally);
      }
      if (!seenHere.has(label)) {
        tally.items += 1;
        seenHere.add(label);
      }
      if (option.option_sub_type && fixed !== 'color' && fixed !== 'reforge')
        tally.subTypes.add(option.option_sub_type);
      // 세트 효과처럼 이름 옆에 숫자(레벨)가 붙은 것은 숫자 옵션이 아니다. 첫 값으로 가른다.
      if (fixed === null && toNumber(option.option_value) === null) tally.numeric = false;

      const name =
        fixed === 'reforge'
          ? parseReforge(option.option_value)?.name
          : fixed === 'enchant'
            ? enchantName(option.option_value)
            : fixed === null
              ? option.option_value
              : undefined;
      // 같은 매물에 같은 이름이 두 번 나와도 한 건으로 센다.
      const nameKey = `${label}\u0000${option.option_sub_type ?? ''}\u0000${name ?? ''}`;
      if (name && !namesHere.has(nameKey)) {
        namesHere.add(nameKey);
        bump(tally.values, name);
        if (fixed === 'enchant' && option.option_sub_type) {
          const bySub = tally.valuesBySub.get(option.option_sub_type) ?? new Map();
          tally.valuesBySub.set(option.option_sub_type, bump(bySub, name));
        }
      }

      const number = numberOf(fixed, option);
      if (number !== null) {
        const perLabel = maxHere.get(label) ?? new Map<string, number>();
        maxHere.set(label, perLabel);
        const keys = fixed === 'reforge' && name ? ['', name] : [''];
        for (const key of keys) perLabel.set(key, Math.max(perLabel.get(key) ?? -Infinity, number));
      }
    }

    for (const [label, perLabel] of maxHere) {
      const tally = tallies.get(label);
      if (!tally) continue;
      for (const [key, number] of perLabel) {
        const list = tally.numbers.get(key) ?? [];
        list.push(number);
        tally.numbers.set(key, list);
      }
    }
  }

  const sortNames = (map: Map<string, number>): NameCount[] =>
    [...map.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ko'));

  return [...tallies.entries()]
    .map(([label, tally]): CatalogEntry => {
      const kind: ConditionKind = tally.kind ?? (tally.numeric ? 'number' : 'text');
      return {
        label: kind === 'number' ? numberLabel(label) : label,
        kind,
        optionType: tally.optionType,
        count: tally.items,
        values: kind === 'number' ? [] : sortNames(tally.values),
        valuesBySub: Object.fromEntries(
          [...tally.valuesBySub.entries()].map(([sub, map]) => [sub, sortNames(map)]),
        ),
        subTypes: [...tally.subTypes].sort(),
        numbers: Object.fromEntries(tally.numbers),
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}

/**
 * 숫자 자동완성. 매물마다의 값에서 "N 이상이면 몇 건" 을 큰 값부터 만든다. 입력한 글자로
 * 시작하는 값만 남긴다. 같은 건수가 이어지면 가장 큰 N 만 남겨 목록이 길어지지 않게 한다.
 */
export function thresholdSuggestions(
  values: readonly number[] | undefined,
  typed = '',
  limit = 12,
): { value: number; count: number }[] {
  if (!values || values.length === 0) return [];
  const distinct = [...new Set(values)].sort((a, b) => b - a);
  const result: { value: number; count: number }[] = [];
  for (const value of distinct) {
    if (typed && !String(value).startsWith(typed.trim())) continue;
    const count = values.filter((each) => each >= value).length;
    if (result.length > 0 && result[result.length - 1].count === count) continue;
    result.push({ value, count });
    if (result.length >= limit) break;
  }
  return result;
}

let nextId = 1;

/** 목록에서 고른 옵션으로 빈 조건 블록을 만든다. */
export function newCondition(entry: Pick<CatalogEntry, 'kind' | 'optionType'>): Condition {
  const id = nextId++;
  switch (entry.kind) {
    case 'reforge':
      return { id, kind: 'reforge', name: '', minLevel: null };
    case 'enchant':
      return { id, kind: 'enchant', prefix: '', suffix: '' };
    case 'special':
      return { id, kind: 'special', type: '', minStep: null };
    case 'erg':
      return { id, kind: 'erg', grade: '', minLevel: null };
    case 'color':
      return { id, kind: 'color', hex: '#ffffff', part: '', minSimilarity: 95 };
    case 'number':
      return { id, kind: 'number', optionType: entry.optionType, min: null };
    case 'text':
      return { id, kind: 'text', optionType: entry.optionType, text: '' };
  }
}

/**
 * 매물을 불러오기 전에도 바로 더할 수 있는 자주 쓰는 조건. 불러온 매물에 없는 옵션이어도 둔다.
 * 조건을 먼저 정하고 찾기를 누르는 사람도 있다.
 */
export const QUICK_CONDITIONS: { label: string; kind: ConditionKind; optionType: string }[] = [
  { label: '세공', kind: 'reforge', optionType: '세공 옵션' },
  { label: '인챈트', kind: 'enchant', optionType: '인챈트' },
  { label: '특별 개조', kind: 'special', optionType: '특별 개조' },
  { label: '에르그', kind: 'erg', optionType: '에르그' },
  { label: '색상', kind: 'color', optionType: '색상' },
];
