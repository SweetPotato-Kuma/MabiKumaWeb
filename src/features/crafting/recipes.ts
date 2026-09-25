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
}

export interface CraftSkill {
  id: number;
  name: string;
  count: number;
}

type RawSlot = [number[], number];

interface RawRecipe {
  item: number;
  skill: number;
  rank: number;
  yield: number;
  tool?: string;
  station?: string;
  materials: RawSlot[];
  finish?: RawSlot[];
}

export interface RawRecipeData {
  updated: string;
  skills: CraftSkill[];
  /** 아이템 번호 -> [이름, 거래 가능이면 1]. */
  items: Record<string, [string, number]>;
  recipes: RawRecipe[];
}

export interface RecipeBook {
  updated: string;
  skills: CraftSkill[];
  recipes: Recipe[];
  skillName: (id: number) => string;
  itemName: (id: number) => string;
  isTradable: (id: number) => boolean;
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

const toSlot = ([ids, count]: RawSlot): RecipeSlot => ({ ids, count });

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

  const skillNames = new Map(raw.skills.map((skill) => [skill.id, skill.name]));
  const none: Recipe[] = [];

  return {
    updated: raw.updated,
    skills: raw.skills,
    recipes,
    skillName: (id) => skillNames.get(id) ?? `스킬 ${id}`,
    itemName: (id) => raw.items[id]?.[0] ?? `#${id}`,
    isTradable: (id) => raw.items[id]?.[1] === 1,
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

/** 스킬, 도구, 랭크를 한 줄로. "방직(베틀) 5랭크" */
export function recipeTitle(book: RecipeBook, recipe: Recipe): string {
  const skill = book.skillName(recipe.skill);
  return `${recipe.tool ? `${skill}(${recipe.tool})` : skill} ${rankLabel(recipe.rank)}`;
}

/** 필요한 설비. 방직은 도구 이름(물레, 베틀)이 제목에 이미 있어 같으면 비운다. */
export function stationNote(recipe: Recipe): string {
  return recipe.station && recipe.station !== recipe.tool ? `설비: ${recipe.station}` : '';
}

/** 재료를 한 줄로. "철괴 3, 가죽 1". 제작법을 고르는 목록과 스킬별 목록에서 쓴다. */
export function materialSummary(book: RecipeBook, recipe: Recipe): string {
  return [...recipe.materials, ...recipe.finish]
    .map((slot) => `${book.itemName(slot.ids[0])} ${formatNumber(slot.count)}`)
    .join(', ');
}

/** 제작 비용 화면의 주소. */
export const CRAFTING_PATH = '/crafting';

/** 제작 비용 상세 주소. 아이템 정보 화면에서도 이 주소로 넘어온다. */
export function craftingPath(itemId: number, recipe?: number): string {
  return `${CRAFTING_PATH}?item=${itemId}${recipe === undefined ? '' : `&recipe=${recipe}`}`;
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
