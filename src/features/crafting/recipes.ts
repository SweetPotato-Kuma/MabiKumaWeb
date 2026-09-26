import { queryOptions, useQuery } from '@tanstack/react-query';
import { formatNumber } from '@/lib/format';

/**
 * 제작법 책.
 *
 * 넥슨 API 에는 제작법이 없어서 scripts/build-recipes.mjs 가 게임 클라이언트 데이터에서 뽑아
 * public/data/recipes.json 한 파일로 둔다. 정적 파일이라 한 번 받으면 다시 받지 않는다.
 * 시세는 여기 없다. 재료 값은 화면이 경매장 API 에 따로 묻는다(market.ts).
 */

/** 재료 칸 하나. ids 가운데 아무거나 count 개를 넣으면 된다. */
export interface RecipeSlot {
  ids: number[];
  count: number;
  /**
   * 요리 재료의 기준 값. 넣는 비율은 넣은 재료들의 기준 값 합에 대한 몫이다(cookingRatios).
   * 다른 스킬은 없다.
   */
  amount?: number;
}

export interface Recipe {
  /** 파일 안의 순번. 같은 아이템의 제작법이 여럿일 때 고른 것을 가리킨다. */
  index: number;
  item: number;
  skill: number;
  /** 스킬 랭크. rankLabel 로 읽는다. */
  rank: number;
  /** 한 번 만들면 나오는 개수. */
  yield: number;
  /** 같은 스킬 안에서 쓰는 도구가 다를 때(방직의 물레와 베틀). */
  tool?: string;
  /** 근처에 있어야 하는 설비. */
  station?: string;
  materials: RecipeSlot[];
  /** 천옷만들기와 블랙스미스의 마무리 재료. 다른 스킬은 비어 있다. */
  finish: RecipeSlot[];
  /**
   * 요리에서 하나 골라 더 넣을 수 있는 재료. 넣지 않아도 만들어지므로 비용에는 넣지 않는다.
   * 다른 스킬은 비어 있다.
   */
  extras: RecipeSlot[];
  /** 요리 한 번에 얻는 요리 경험치. 요리만 있다. */
  exp?: number;
}

export interface CraftSkill {
  id: number;
  name: string;
  count: number;
  /** 스킬 창의 탭. "생활", "연금술". */
  category?: string;
  /** 게임의 스킬 설명. 비어 있는 스킬도 있다. */
  desc?: string;
}

/** [아이템들, 개수, 요리 기준 값]. */
type RawSlot = [number[], number, number?];

interface RawRecipe {
  item: number;
  skill: number;
  rank: number;
  yield: number;
  tool?: string;
  station?: string;
  materials: RawSlot[];
  finish?: RawSlot[];
  extras?: RawSlot[];
  exp?: number;
}

export interface RawRecipeData {
  updated: string;
  skills: CraftSkill[];
  /** 아이템 번호 -> [이름, 거래 가능이면 1, 그림 파일 이름(있으면)]. */
  items: Record<string, [string, number] | [string, number, string]>;
  recipes: RawRecipe[];
}

export interface RecipeBook {
  updated: string;
  skills: CraftSkill[];
  recipes: Recipe[];
  skillName: (id: number) => string;
  /** 스킬 하나. 제작법에 나오지 않는 번호면 없다. */
  skillOf: (id: number) => CraftSkill | undefined;
  itemName: (id: number) => string;
  isTradable: (id: number) => boolean;
  /** 아이템 그림 파일 이름(그림 저장소 기준). 올리지 못한 아이템은 없다. */
  iconOf: (id: number) => string | undefined;
  /** 이 아이템을 만드는 제작법 전부. 없으면 빈 배열. */
  recipesOf: (itemId: number) => Recipe[];
  /** 트리에서 재료를 더 풀어 볼 제작법. 금속 변환은 뺀다(CONVERSION_SKILL 참고). */
  subRecipesOf: (itemId: number) => Recipe[];
  /** 이름이 같은 아이템 번호들. 아이템 정보 화면은 이름으로만 아이템을 안다. */
  idsByName: (name: string) => number[];
}

/**
 * 금속 변환. 광석 조각을 광석으로, 광석을 다른 광석으로 바꾸는 식이라 재료와 결과가 서로
 * 물고 돈다. 트리에서 재료를 풀어 갈 때 이것까지 따라가면 "철광석을 만들려면 광석 조각"이 모든
 * 금속 재료 밑에 붙는다. 스킬 목록에서는 그대로 보여 주고, 하위 재료를 풀 때만 뺀다.
 */
export const CONVERSION_SKILL = 35012;

const toSlot = ([ids, count, amount]: RawSlot): RecipeSlot =>
  amount === undefined ? { ids, count } : { ids, count, amount };

export function buildRecipeBook(raw: RawRecipeData): RecipeBook {
  const recipes = raw.recipes.map((recipe, index): Recipe => ({
    index,
    item: recipe.item,
    skill: recipe.skill,
    rank: recipe.rank,
    yield: recipe.yield > 1 ? recipe.yield : 1,
    tool: recipe.tool,
    station: recipe.station,
    materials: recipe.materials.map(toSlot),
    finish: (recipe.finish ?? []).map(toSlot),
    extras: (recipe.extras ?? []).map(toSlot),
    exp: recipe.exp,
  }));

  const byItem = new Map<number, Recipe[]>();
  for (const recipe of recipes) {
    const list = byItem.get(recipe.item);
    if (list) list.push(recipe);
    else byItem.set(recipe.item, [recipe]);
  }

  const byName = new Map<string, number[]>();
  for (const [id, [name]] of Object.entries(raw.items)) {
    const list = byName.get(name);
    if (list) list.push(Number(id));
    else byName.set(name, [Number(id)]);
  }

  const skillById = new Map(raw.skills.map((skill) => [skill.id, skill]));
  const none: Recipe[] = [];

  return {
    updated: raw.updated,
    skills: raw.skills,
    recipes,
    skillName: (id) => skillById.get(id)?.name ?? `스킬 ${id}`,
    skillOf: (id) => skillById.get(id),
    itemName: (id) => raw.items[id]?.[0] ?? `#${id}`,
    isTradable: (id) => raw.items[id]?.[1] === 1,
    iconOf: (id) => raw.items[id]?.[2] || undefined,
    recipesOf: (itemId) => byItem.get(itemId) ?? none,
    subRecipesOf: (itemId) =>
      (byItem.get(itemId) ?? none).filter((recipe) => recipe.skill !== CONVERSION_SKILL),
    idsByName: (name) => byName.get(name) ?? [],
  };
}

/** 게임의 스킬 랭크 표기. 0 은 연습, 1~6 은 F~A, 7~15 는 9랭크~1랭크, 16 부터는 단. */
export function rankLabel(rank: number): string {
  if (rank <= 0) return '연습';
  if (rank <= 6) return 'FEDCBA'[rank - 1];
  if (rank <= 15) return `${16 - rank}랭크`;
  return `${rank - 15}단`;
}

/** 랭크를 문장 안에 쓰는 꼴로. 글자 랭크는 "A랭크", 숫자 랭크와 단은 그대로, 연습은 "연습 랭크". */
export function rankText(rank: number): string {
  const label = rankLabel(rank);
  if (rank <= 0) return `${label} 랭크`;
  return rank <= 6 ? `${label}랭크` : label;
}

/** 요리 스킬. 도구 자리에 조리 방법이 들어 있다. */
export const COOKING_SKILL = 10020;

/** 스킬 그림. scripts/build-recipes.mjs 가 받아 둔 42px 그림이다. */
export function skillIconUrl(skillId: number): string {
  return `${import.meta.env.BASE_URL}data/skills/${skillId}.png`;
}

/** 스킬, 도구, 랭크를 한 줄로. "방직(베틀) 5랭크" */
export function recipeTitle(book: RecipeBook, recipe: Recipe): string {
  const skill = book.skillName(recipe.skill);
  return `${recipe.tool ? `${skill}(${recipe.tool})` : skill} ${rankLabel(recipe.rank)}`;
}

/** 필요한 설비. 방직은 도구 이름(물레, 베틀)이 제목에 이미 있어 같으면 비운다. */
export function stationNote(recipe: Recipe): string {
  return recipe.station && recipe.station !== recipe.tool ? `설비: ${recipe.station}` : '';
}

/**
 * 재료를 한 줄로. "철괴 3, 가죽 1". 제작법을 고르는 목록과 스킬별 목록에서 쓴다.
 * 요리는 한 개씩 쓰고 비율이 중요해서 비율로 적는다. "달걀 75%, 올리브유 25% (+ 소금/설탕/후추 중 하나)"
 */
export function materialSummary(book: RecipeBook, recipe: Recipe): string {
  if (isCooking(recipe)) {
    const main = cookingRatios(recipe)
      .map((step) => `${book.itemName(step.slot.ids[0])} ${formatPercent(step.percent)}`)
      .join(', ');
    if (recipe.extras.length === 0) return main;
    return `${main} (+ ${recipe.extras.map((slot) => book.itemName(slot.ids[0])).join('/')} 중 하나)`;
  }
  return [...recipe.materials, ...recipe.finish]
    .map((slot) => `${book.itemName(slot.ids[0])} ${formatNumber(slot.count)}`)
    .join(', ');
}

/** 비율을 맞춰 넣는 제작법인지(요리). */
export function isCooking(recipe: Recipe): boolean {
  return recipe.materials.some((slot) => slot.amount !== undefined);
}

/** 요리 재료 하나를 넣는 차례. */
export interface CookingStep {
  slot: RecipeSlot;
  /** 추가 재료인지. */
  extra: boolean;
  /** 이 재료의 비율(%). 소수 첫째 자리까지. */
  percent: number;
  /** 이 재료까지 넣었을 때 게이지가 닿아야 하는 곳(%). 마지막 재료는 100. */
  cumulative: number;
}

/**
 * 요리 재료를 넣는 차례와 비율. 기본 재료 뒤에 고른 추가 재료(extras 의 순번)를 붙이고, 기준 값의
 * 합에 대한 몫으로 나눈다. 0.1% 단위로 자르고 모자란 만큼은 잘린 나머지가 큰 칸부터 채워 합을 100 으로
 * 맞춘다(같으면 앞 칸 먼저). 게임 화면도 넣은 재료의 합으로 나눈다.
 */
export function cookingRatios(recipe: Recipe, extraIndex?: number): CookingStep[] {
  const extra = extraIndex === undefined ? undefined : recipe.extras[extraIndex];
  const slots = [
    ...recipe.materials.map((slot) => ({ slot, extra: false })),
    ...(extra ? [{ slot: extra, extra: true }] : []),
  ];
  const amounts = slots.map(({ slot }) => Math.max(0, slot.amount ?? 0));
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const tenths = amounts.map((amount) => (total === 0 ? 0 : (amount / total) * 1000));
  const floors = tenths.map(Math.floor);
  if (total > 0) {
    let left = 1000 - floors.reduce((sum, value) => sum + value, 0);
    const order = tenths
      .map((value, index) => ({ index, remainder: value - floors[index] }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (const { index } of order) {
      if (left-- <= 0) break;
      floors[index] += 1;
    }
  }
  let reached = 0;
  return slots.map(({ slot, extra: isExtra }, index) => {
    reached += floors[index];
    return { slot, extra: isExtra, percent: floors[index] / 10, cumulative: reached / 10 };
  });
}

/** "85%", "78.9%". 소수점 아래가 0 이면 뗀다. */
export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export const recipeBookQueryOptions = queryOptions({
  queryKey: ['crafting', 'recipes'],
  queryFn: async ({ signal }): Promise<RecipeBook | null> => {
    const response = await fetch(`${import.meta.env.BASE_URL}data/recipes.json`, { signal });
    // 수집을 한 번도 돌리지 않은 빌드에서는 없는 게 정상이다. 화면을 깨지 않고 빈 상태로 둔다.
    if (!response.ok) return null;
    return buildRecipeBook((await response.json()) as RawRecipeData);
  },
  staleTime: Infinity,
  gcTime: Infinity,
  retry: false,
});

export function useRecipeBookQuery() {
  return useQuery(recipeBookQueryOptions);
}
