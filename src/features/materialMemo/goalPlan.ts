import { coinPurchasesOf } from '@/features/dungeonCoins/exchanges';
import { makesFromBeads, mainCoinOf } from '@/features/dungeonCoins/subBeads';
import type { Recipe, RecipeBook } from '@/features/crafting/recipes';
import type { Goal } from './store';

/**
 * 목표 목록을 재료 트리 계산(features/crafting/plan.ts)에 넣는 모양으로 바꾼다.
 *
 * 목표 하나는 "그 아이템 N개" 를 재료로 하는 한 칸이다. 목표 전체는 그런 칸을 모은 가짜 제작법 하나라서
 * 아이템 정보의 제작 비용과 같은 표, 같은 규칙으로 계산된다. 목표 아이템이 제작법이 있으면 그 줄을
 * 펼쳐 재료를 보고, 없으면 사는 값만 나온다.
 */

/** 제작법 데이터에 없는 아이템에 붙이는 번호. 이번 화면 안에서만 쓰고 저장하지 않는다. */
const firstExtraId = -1;

/**
 * 목표 이름을 풀 수 있는 제작법 책. 제작법 데이터에 없는 이름(제작하지 않는 장비 등)은 음수 번호를 받고,
 * 거래되는 아이템으로 본다(시세가 없으면 "매물 없음" 으로 나온다). 같은 이름의 아이템은 한 아이템으로
 * 보아 제작법을 합친다. 아이템 정보 화면이 이름으로만 아이템을 알고, 게임에 이름이 같은 아이템이
 * 거래 가능한 것과 불가한 것으로 따로 있기 때문이다.
 */
export function memoBook(base: RecipeBook, names: readonly string[]): RecipeBook {
  const extraByName = new Map<string, number>();
  const nameById = new Map<number, string>();
  for (const name of names) {
    if (base.idsByName(name).length > 0 || extraByName.has(name)) continue;
    const id = firstExtraId - extraByName.size;
    extraByName.set(name, id);
    nameById.set(id, name);
  }

  const itemName = (id: number) => nameById.get(id) ?? base.itemName(id);
  const idsByName = (name: string) => {
    const ids = base.idsByName(name);
    if (ids.length > 0) return ids;
    const extra = extraByName.get(name);
    return extra === undefined ? [] : [extra];
  };
  /** 같은 이름의 아이템 번호들. 이 번호가 맨 앞이다. */
  const sameName = (id: number) => [id, ...idsByName(itemName(id)).filter((each) => each !== id)];
  const merged = (find: (id: number) => Recipe[]) => (id: number) => {
    if (id < 0) return [];
    const seen = new Set<number>();
    const found: Recipe[] = [];
    for (const each of sameName(id)) {
      for (const recipe of find(each)) {
        if (seen.has(recipe.index)) continue;
        seen.add(recipe.index);
        found.push(recipe);
      }
    }
    return found;
  };

  return {
    ...base,
    itemName,
    idsByName,
    isTradable: (id) => id < 0 || base.isTradable(id),
    iconOf: (id) => (id < 0 ? undefined : base.iconOf(id)),
    recipesOf: merged(base.recipesOf),
    subRecipesOf: merged(base.subRecipesOf),
  };
}

/** 목표 전체를 한 제작법으로. 칸 순서는 목표 순서이고, 칸의 자리 이름은 목표 번호다(PlanInput.slotKeys). */
export const goalsRecipe = (book: RecipeBook, goals: readonly Goal[]): Recipe => ({
  index: -1,
  // 아무 아이템도 아닌 번호. 목표 아이템이 자기 자신의 윗줄로 잡히지 않게 한다.
  item: 0,
  skill: 0,
  rank: 0,
  yield: 1,
  materials: goals.map((goal) => ({ ids: book.idsByName(goal.name), count: goal.quantity })),
  finish: [],
  extras: [],
});

/**
 * 목표들이 쓰는 던전 코인. 목표마다 재료 트리에서 그 코인으로 살 수 있는 재료가 가장 많은 코인 하나를 꼽는다
 * (아이템 정보의 제작 비용과 같은 규칙). 사는 코인이 없는 목표는 건너뛴다.
 */
export function goalCoins(book: RecipeBook, names: readonly string[]): string[] {
  const coins = new Set<string>();
  for (const name of names) {
    const coin = mainCoinOf(book, goalsRecipe(book, [{ id: '', name, quantity: 1 }]));
    if (coin) coins.add(coin);
  }
  return [...coins];
}

/** 이 재료를 코인으로 살 때나 구슬로 만들 때 내는 코인. 목표들이 쓰는 코인 가운데서만 찾는다. */
export function coinOfItem(
  book: RecipeBook,
  coins: readonly string[],
  itemId: number,
): string | undefined {
  if (coins.length === 0) return undefined;
  const purchase = coinPurchasesOf(book.itemName(itemId)).find((each) => coins.includes(each.coin));
  if (purchase) return purchase.coin;
  return coins.find((coin) => makesFromBeads(book, coin, itemId));
}

/** 재료 트리 계산에 넘기는 코인 설명. 쓰는 코인이 없으면 undefined. */
export function goalBeads(
  book: RecipeBook,
  coins: readonly string[],
  checked: ReadonlySet<string>,
) {
  if (coins.length === 0) return undefined;
  return {
    checked,
    coinCostOf: (id: number) =>
      coinPurchasesOf(book.itemName(id)).find((each) => coins.includes(each.coin))?.cost,
    craftable: (id: number) => coins.some((coin) => makesFromBeads(book, coin, id)),
  };
}
