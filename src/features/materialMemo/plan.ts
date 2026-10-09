import { MAX_DEPTH } from '@/features/crafting/plan';
import { DEFAULT_WORKS, hasWorks, type Recipe, type RecipeBook, type RecipeSlot } from '@/features/crafting/recipes';

/**
 * 재료 메모의 계산.
 *
 * 목표 아이템의 제작법에서 시작해 재료마다 "직접 구하기"(gather) 나 "제작"(제작법 순번) 가운데 하나를 고른다.
 * 가진 개수는 줄마다 적고, 그만큼은 구하지도 만들지도 않는다. 만들기로 한 재료를 이미 가졌다면
 * 모자란 개수만큼만 만들 재료를 센다. 시세는 다루지 않는다(features/crafting/plan.ts 가 값을 매긴다).
 */

/** 재료를 어떻게 마련할지. 'gather' 는 만들지 않고 구한다. 숫자는 제작법 순번(Recipe.index). */
export type Choice = 'gather' | number;

export interface MemoTargetInput {
  itemId: number;
  count: number;
  /** 목표 아이템의 제작법 순번. 없으면 첫 제작법. */
  recipe?: number;
  /** 공정 수. 공정을 여러 번 하는 제작법만. 없으면 기준 공정 수. */
  works?: number;
  /** 줄의 key -> 가진 개수. */
  owned: Readonly<Record<string, number>>;
  /** 줄의 key -> 고른 방법. 고르지 않은 줄은 기본값. */
  choices: Readonly<Record<string, Choice>>;
}

export interface MemoNode {
  /** 트리 안의 자리. 가진 개수와 고른 방법을 이 값으로 기억한다. */
  key: string;
  itemId: number;
  finish: boolean;
  depth: number;
  /** 이 줄에 필요한 개수. 윗줄을 이미 가진 만큼은 빠져 있다. */
  required: number;
  owned: number;
  /** 모자란 개수. */
  short: number;
  /** 공정마다 넣는 개수. 공정을 여러 번 하는 제작법의 작업 재료일 때만. */
  perWork?: number;
  /** 이 재료를 만드는 제작법(금속 변환 제외). 비어 있으면 구하는 수밖에 없다. */
  recipes: Recipe[];
  choice: Choice;
  /** 사용자가 고른 방법인지. 아니면 기본값이다. */
  chosen: boolean;
  /** 만든다면 몇 번 만들어야 하는지, 한 번에 몇 개 나오는지. */
  crafts: number;
  yieldCount: number;
  /** 만들기로 한 줄만 채운다. */
  children?: MemoNode[];
}

/** 구해야 하는 재료 한 종. 같은 재료가 트리 여러 곳에 나와도 한 줄이다. */
export interface ShortageRow {
  itemId: number;
  required: number;
  owned: number;
  short: number;
}

export interface MemoPlan {
  /** 목표 개수를 만들려면 몇 번 만들어야 하는지. */
  crafts: number;
  recipe: Recipe | undefined;
  nodes: MemoNode[];
  /** 만들지 않고 구하기로 한 재료. 모자란 것이 위로 온다. */
  materials: ShortageRow[];
}

export interface PlanOptions {
  /** 경매장이나 NPC 에서 살 수 있는지. 못 사는 재료는 제작법이 있으면 기본으로 만든다. 없으면 거래 가능 여부만 본다. */
  isBuyable?: (itemId: number) => boolean;
}

/** 칸에 넣을 아이템. 살 수 있는 것을 먼저, 없으면 첫째. */
function pickItem(slot: RecipeSlot, isBuyable: (itemId: number) => boolean): number {
  return slot.ids.find(isBuyable) ?? slot.ids[0];
}

/** 한 번 만들 때 작업 재료를 넣는 횟수. */
const worksOf = (recipe: Recipe, works?: number) =>
  hasWorks(recipe) ? Math.max(1, works ?? DEFAULT_WORKS) : 1;

const slotsOf = (recipe: Recipe, works: number) => [
  ...recipe.materials.map((slot, index) => ({ slot, finish: false, id: `m${index}`, times: works })),
  ...recipe.finish.map((slot, index) => ({ slot, finish: true, id: `f${index}`, times: 1 })),
];

const wholeCount = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function buildMemoPlan(
  book: RecipeBook,
  target: MemoTargetInput,
  options: PlanOptions = {},
): MemoPlan {
  const isBuyable = options.isBuyable ?? book.isTradable;
  const roots = book.recipesOf(target.itemId);
  const recipe = roots.find((each) => each.index === target.recipe) ?? roots[0];
  if (!recipe) return { crafts: 0, recipe: undefined, nodes: [], materials: [] };

  const buildNode = (
    slot: RecipeSlot,
    finish: boolean,
    key: string,
    crafts: number,
    times: number,
    depth: number,
    ancestors: ReadonlySet<number>,
  ): MemoNode => {
    const itemId = pickItem(slot, isBuyable);
    const recipes = depth < MAX_DEPTH && !ancestors.has(itemId) ? book.subRecipesOf(itemId) : [];
    const gross = slot.count * crafts * times;
    const owned = wholeCount(target.owned[key]);
    const short = Math.max(0, gross - owned);

    const picked = target.choices[key];
    const pickedRecipe =
      typeof picked === 'number' ? recipes.find((each) => each.index === picked) : undefined;
    const chosen = pickedRecipe !== undefined || (picked === 'gather' && recipes.length > 0);
    // 못 사는 재료는 만드는 쪽이 기본이다. 살 수 있으면 구하는 쪽이 기본이다.
    const made =
      pickedRecipe ??
      (picked === 'gather' || recipes.length === 0 || isBuyable(itemId) ? undefined : recipes[0]);

    const node: MemoNode = {
      key,
      itemId,
      finish,
      depth,
      required: gross,
      owned,
      short,
      ...(times > 1 ? { perWork: slot.count * crafts } : {}),
      recipes,
      choice: made ? made.index : 'gather',
      chosen,
      crafts: 0,
      yieldCount: 1,
    };

    if (made) {
      node.yieldCount = made.yield;
      node.crafts = Math.ceil(short / made.yield);
      const nextAncestors = new Set(ancestors).add(itemId);
      node.children = slotsOf(made, worksOf(made)).map((each) =>
        buildNode(
          each.slot,
          each.finish,
          `${key}.${made.index}/${each.id}`,
          node.crafts,
          each.times,
          depth + 1,
          nextAncestors,
        ),
      );
    }
    return node;
  };

  const crafts = Math.ceil(Math.max(1, target.count) / recipe.yield);
  const rootAncestors = new Set([recipe.item]);
  const nodes = slotsOf(recipe, worksOf(recipe, target.works)).map((each) =>
    buildNode(each.slot, each.finish, each.id, crafts, each.times, 0, rootAncestors),
  );

  const byItem = new Map<number, ShortageRow>();
  const collect = (node: MemoNode) => {
    if (node.children) {
      node.children.forEach(collect);
      return;
    }
    // 윗줄을 이미 가져서 만들 필요가 없어진 가지는 구할 것이 없다.
    if (node.required === 0) return;
    const row = byItem.get(node.itemId);
    if (row) {
      row.required += node.required;
      row.owned += node.owned;
      row.short += node.short;
    } else {
      byItem.set(node.itemId, {
        itemId: node.itemId,
        required: node.required,
        owned: node.owned,
        short: node.short,
      });
    }
  };
  nodes.forEach(collect);

  return { crafts, recipe, nodes, materials: sortShortages([...byItem.values()]) };
}

/** 모자란 재료가 위로. 같으면 들어온 차례 그대로. */
function sortShortages(rows: ShortageRow[]): ShortageRow[] {
  return rows
    .map((row, order) => ({ row, order }))
    .sort((a, b) => Number(b.row.short > 0) - Number(a.row.short > 0) || a.order - b.order)
    .map(({ row }) => row);
}

/** 목표 여럿의 구할 재료를 아이템별로 합친다. 가진 개수는 목표마다 따로 적은 것을 더한다. */
export function mergeShortages(plans: readonly MemoPlan[]): ShortageRow[] {
  const byItem = new Map<number, ShortageRow>();
  for (const plan of plans) {
    for (const row of plan.materials) {
      const merged = byItem.get(row.itemId);
      if (merged) {
        merged.required += row.required;
        merged.owned += row.owned;
        merged.short += row.short;
      } else {
        byItem.set(row.itemId, { ...row });
      }
    }
  }
  return sortShortages([...byItem.values()]);
}

/** 아직 모자란 재료의 종류 수. */
export const shortKinds = (rows: readonly ShortageRow[]) =>
  rows.reduce((sum, row) => sum + (row.short > 0 ? 1 : 0), 0);
