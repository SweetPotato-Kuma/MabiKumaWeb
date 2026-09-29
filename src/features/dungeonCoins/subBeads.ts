import { MAX_DEPTH } from '@/features/crafting/plan';
import { DEFAULT_WORKS, hasWorks, type Recipe, type RecipeBook } from '@/features/crafting/recipes';
import { coinPurchasesOf, DUNGEON_COINS, type CoinPurchase } from './exchanges';

/**
 * 제작법의 재료 칸마다 코인 상점 재료면 그 구매처를 알리고, 아니면 하위 제작법으로 내려간다.
 * 거래 불가 판과 거래 가능 판은 같은 재료로 본다. amount 는 그 칸에 드는 개수.
 */
function walk(
  book: RecipeBook,
  recipe: Recipe,
  need: number,
  ancestors: ReadonlySet<number>,
  depth: number,
  onCoinItem: (purchases: CoinPurchase[], amount: number) => void,
): void {
  const crafts = Math.ceil(need / recipe.yield);
  const next = new Set(ancestors).add(recipe.item);
  const works = hasWorks(recipe) ? DEFAULT_WORKS : 1;
  const slots = [
    ...recipe.materials.map((slot) => ({ slot, times: works })),
    ...recipe.finish.map((slot) => ({ slot, times: 1 })),
  ];
  for (const { slot, times } of slots) {
    const amount = slot.count * crafts * times;
    const purchases = [
      ...new Map(
        slot.ids
          .flatMap((each) => coinPurchasesOf(book.itemName(each)))
          .map((each) => [each.coin, each]),
      ).values(),
    ];
    if (purchases.length > 0) {
      onCoinItem(purchases, amount);
      continue;
    }
    if (depth + 1 >= MAX_DEPTH) continue;
    for (const each of slot.ids) {
      const inner = book.subRecipesOf(each)[0];
      if (inner && !next.has(each)) {
        walk(book, inner, amount, next, depth + 1, onCoinItem);
        break;
      }
    }
  }
}

/**
 * 이 제작법으로 만드는 물건이 어느 던전 코인을 쓰는 물건인지. 재료 트리에서 그 코인으로 살 수 있는
 * 재료가 가장 많은 코인이다. 같으면 코인이 덜 드는 쪽, 그래도 같으면 코인 표의 앞쪽.
 * 코인으로 사는 재료가 없으면 undefined.
 */
export function mainCoinOf(book: RecipeBook, recipe: Recipe): string | undefined {
  const stats = new Map<string, { items: number; cost: number }>();
  walk(book, recipe, 1, new Set(), 0, (purchases, amount) => {
    for (const { coin, cost } of purchases) {
      const entry = stats.get(coin) ?? { items: 0, cost: 0 };
      entry.items += 1;
      entry.cost += cost * amount;
      stats.set(coin, entry);
    }
  });
  const order = DUNGEON_COINS.map((entry) => entry.coin.name);
  return [...stats]
    .sort(
      ([a, x], [b, y]) =>
        y.items - x.items || x.cost - y.cost || order.indexOf(a) - order.indexOf(b),
    )
    .map(([coin]) => coin)[0];
}

/** 이 재료를 직접 만든다면 필요한 그 코인의 개수. 코인 상점에서 파는 재료를 만나면 거기서 멈춘다. */
export function beadsToMake(
  book: RecipeBook,
  coin: string,
  itemId: number,
  required: number,
): number {
  const recipe = book.subRecipesOf(itemId)[0];
  if (!recipe) return 0;
  let total = 0;
  walk(book, recipe, required, new Set([itemId]), 0, (purchases, amount) => {
    const purchase = purchases.find((each) => each.coin === coin);
    if (purchase) total += purchase.cost * amount;
  });
  return total;
}

const beadItems = new WeakMap<RecipeBook, Map<string, boolean>>();

/** 코인 상점에 없으면서 만들 때 그 코인이 드는 재료인지. 구슬로 만들지 고를 수 있는 재료다. */
export function makesFromBeads(book: RecipeBook, coin: string, itemId: number): boolean {
  let cache = beadItems.get(book);
  if (!cache) beadItems.set(book, (cache = new Map()));
  const key = `${coin}:${itemId}`;
  let known = cache.get(key);
  if (known === undefined) {
    known =
      coinPurchasesOf(book.itemName(itemId)).length === 0 && beadsToMake(book, coin, itemId, 1) > 0;
    cache.set(key, known);
  }
  return known;
}
