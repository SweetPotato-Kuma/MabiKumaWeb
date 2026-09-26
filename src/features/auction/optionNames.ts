import { useQuery } from '@tanstack/react-query';
import { EQUIPMENT_CATEGORIES } from '@/features/equipment/api';
import { findGroupOf } from './categoryTree';
import { isConditionActive, type OptionFilter } from './optionFilter';

/**
 * 상세 검색 자동완성의 기본 이름. 게임 데이터의 세공 능력 이름과 인챈트 이름이다.
 *
 * 자동완성은 불러온 매물의 이름을 먼저 쓰지만, 매물을 불러오기 전에는 비어 있다. 그때도 칸을
 * 누르면 이름이 나오도록 scripts/build-option-names.mjs 가 뽑아 둔 정적 파일을 함께 쓴다.
 */
export interface OptionNames {
  updated: string;
  reforges: string[];
  /** 세공 이름 -> [기본, 한손 무기, 장신구 상한 기준값, 한계 돌파면 1]. */
  reforgeCaps?: Record<string, [number, number, number, number]>;
  /** 상한 기준값 -> [1랭크 최대 레벨, 한계 돌파 최소, 한계 돌파 최대]. */
  reforgeLevels?: Record<string, [number, number, number]>;
  /** 세공 이름 -> 그 세공이 붙을 수 있는 경매장 카테고리. */
  reforgeCategories?: Record<string, string[]>;
  enchants: { prefix: string[]; suffix: string[] };
}

export function useOptionNamesQuery() {
  return useQuery({
    queryKey: ['auction', 'optionNames'],
    queryFn: async ({ signal }): Promise<OptionNames | null> => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/option-names.json`, { signal });
      // 파일이 없는 빌드에서는 불러온 매물의 이름만으로 자동완성한다.
      if (!response.ok) return null;
      return (await response.json()) as OptionNames;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

/** 세공 하나가 가질 수 있는 레벨. 한계 돌파가 안 되면 limitBreakMax 는 0. */
export interface ReforgeCap {
  max: number;
  limitBreakMax: number;
}

/**
 * 세공 이름의 최대 레벨과 한계 돌파 최대 레벨. 장비 시뮬레이터와 같은 규칙이다
 * (features/equipment/reforge.ts): 능력마다 상한 기준값이 있고, 그 기준값 줄의 1랭크 최대가
 * 최대 레벨, 한계 돌파 최대가 그 위 레벨이다.
 *
 * 한손 무기와 장신구는 기준값이 따로다. "한손 장비" 카테고리면 한손 값, 액세서리 묶음이면 장신구
 * 값을 쓴다. 검, 도끼처럼 한손과 양손이 섞인 카테고리는 가릴 수 없어 기본값(가장 큰 쪽)을 쓴다.
 */
export function reforgeCap(
  names: OptionNames | null | undefined,
  name: string,
  category: string,
): ReforgeCap | null {
  const caps = names?.reforgeCaps?.[name.trim()];
  if (!caps) return null;
  const [base, oneHand, accessory, limitBreak] = caps;
  const key =
    findGroupOf(category) === '액세서리' ? accessory : category === '한손 장비' ? oneHand : base;
  const row = names?.reforgeLevels?.[String(key)];
  if (!row || row[0] <= 0) return null;
  return { max: row[0], limitBreakMax: limitBreak ? row[2] : 0 };
}

/** 레벨 자동완성 한 줄. 최대 레벨과 한계 돌파 레벨에는 표시를 붙인다. */
export interface LevelSuggestion {
  value: number;
  count?: number;
  note?: '최대' | '한계 돌파';
}

/**
 * 세공 레벨 자동완성. 그 세공이 가질 수 있는 가장 높은 레벨(한계 돌파 포함)부터 1까지.
 * 불러온 매물의 레벨(values)이 있으면 "그 레벨 이상인 매물 수" 를 붙인다.
 */
export function reforgeLevelSuggestions(
  cap: ReforgeCap,
  values: readonly number[] | undefined,
): LevelSuggestion[] {
  const top = cap.limitBreakMax || cap.max;
  const result: LevelSuggestion[] = [];
  for (let level = top; level >= 1; level -= 1) {
    result.push({
      value: level,
      count:
        values && values.length > 0 ? values.filter((each) => each >= level).length : undefined,
      note: level > cap.max ? '한계 돌파' : level === cap.max ? '최대' : undefined,
    });
  }
  return result;
}

/**
 * 카테고리와 검색어 없이 상세 검색 조건만으로 찾을 때 훑을 경매장 카테고리.
 *
 * 넥슨 경매장 API 는 카테고리나 이름 없이는 매물을 주지 않는다. 그래서 조건에 맞을 수 있는
 * 카테고리를 차례로 불러와 거른다. 세공 이름을 정확히 넣었으면 그 세공이 붙는 카테고리만,
 * 세공이 여럿이면 모두 붙을 수 있는 카테고리만 훑는다. 그 밖에는 장비 카테고리 전체다.
 * 빈 배열이면 조건을 모두 채울 수 있는 카테고리가 없다는 뜻이다.
 */
export function scanCategoriesFor(
  filter: OptionFilter,
  names: OptionNames | null | undefined,
): string[] {
  let categories: string[] = [...EQUIPMENT_CATEGORIES];
  for (const condition of filter.conditions) {
    if (condition.kind !== 'reforge' || !isConditionActive(condition)) continue;
    const allowed = names?.reforgeCategories?.[condition.name.trim()];
    if (!allowed) continue;
    categories = categories.filter((category) => allowed.includes(category));
  }
  return categories;
}
