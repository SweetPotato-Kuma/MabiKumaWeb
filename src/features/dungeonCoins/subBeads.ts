import { isBuying, isComplete, MAX_DEPTH, type PlanNode } from '@/features/crafting/plan';
import { DEFAULT_WORKS, hasWorks, type RecipeBook } from '@/features/crafting/recipes';
import { coinPurchasesOf } from './exchanges';

export interface CoinCount {
  coin: string;
  count: number;
}

/**
 * 이 재료를 직접 만든다면 하위 재료까지 내려가며 코인 상점 재료를 코인으로 샀을 때의 코인 개수.
 * 코인 상점에서 파는 재료를 만나면 거기서 멈춘다. 거래 불가 판과 거래 가능 판은 같은 재료로 본다.
 */
export function beadsToMake(book: RecipeBook, itemId: number, required: number): CoinCount[] {
  const totals = new Map<string, number>();

  const visit = (id: number, need: number, ancestors: ReadonlySet<number>, depth: number) => {
    const recipe = depth < MAX_DEPTH ? book.subRecipesOf(id)[0] : undefined;
    if (!recipe || ancestors.has(id)) return;
    const crafts = Math.ceil(need / recipe.yield);
    const next = new Set(ancestors).add(id);
    const works = hasWorks(recipe) ? DEFAULT_WORKS : 1;
    const slots = [
      ...recipe.materials.map((slot) => ({ slot, times: works })),
      ...recipe.finish.map((slot) => ({ slot, times: 1 })),
    ];
    for (const { slot, times } of slots) {
      const amount = slot.count * crafts * times;
      const purchases = slot.ids.flatMap((each) => coinPurchasesOf(book.itemName(each)));
      if (purchases.length > 0) {
        for (const { coin, cost } of new Map(purchases.map((each) => [each.coin, each])).values())
          totals.set(coin, (totals.get(coin) ?? 0) + cost * amount);
        continue;
      }
      const inner = slot.ids.find((each) => book.subRecipesOf(each).length > 0);
      if (inner !== undefined) visit(inner, amount, next, depth + 1);
    }
  };

  visit(itemId, required, new Set(), 0);
  return [...totals].map(([coin, count]) => ({ coin, count }));
}

const beadItems = new WeakMap<RecipeBook, Map<number, boolean>>();

/** 코인 상점에 없으면서 만들 때 코인이 드는 재료인지. 구슬로 만들지 고를 수 있는 재료다. */
export function makesFromBeads(book: RecipeBook, itemId: number): boolean {
  let cache = beadItems.get(book);
  if (!cache) beadItems.set(book, (cache = new Map()));
  let known = cache.get(itemId);
  if (known === undefined) {
    known =
      coinPurchasesOf(book.itemName(itemId)).length === 0 &&
      beadsToMake(book, itemId, 1).length > 0;
    cache.set(itemId, known);
  }
  return known;
}

export interface BeadAdvice {
  /** 만드는 데 드는 코인. */
  beads: CoinCount[];
  /** 경매장에서 사는 것보다 코인 재료를 뺀 골드로 만드는 쪽이 아끼는 골드. 값을 다 모르면 없다. */
  saved?: number;
}

interface Gold {
  gold: number;
  known: boolean;
}

/**
 * 만들 때 코인 상점 재료를 뺀 골드가 경매장에서 사는 값보다 얼마나 싼지.
 * 사는 값이나 만드는 데 드는 값을 아직 모르면 saved 는 비워 둔다.
 */
export function adviseBeads(book: RecipeBook, node: PlanNode): BeadAdvice {
  const beads = beadsToMake(book, node.itemId, node.required);
  const sum = (nodes: PlanNode[]): Gold =>
    nodes.reduce<Gold>(
      (total, each) => {
        const part = goldOf(each);
        return { gold: total.gold + part.gold, known: total.known && part.known };
      },
      { gold: 0, known: true },
    );
  const goldOf = (target: PlanNode): Gold => {
    if (!isBuying(target.method) && target.children) return sum(target.children);
    if (coinPurchasesOf(book.itemName(target.itemId)).length > 0) return { gold: 0, known: true };
    return { gold: target.cost.gold, known: isComplete(target.cost) };
  };

  if (!node.children || !isComplete(node.buyCost)) return { beads };
  const made = sum(node.children);
  return made.known ? { beads, saved: node.buyCost.gold - made.gold } : { beads };
}
