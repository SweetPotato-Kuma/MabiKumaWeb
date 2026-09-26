import { quoteBuy, type PriceState } from '@/features/crafting/market';
import {
  CONVERSION_SKILL,
  DEFAULT_WORKS,
  hasWorks,
  type Recipe,
  type RecipeBook,
} from '@/features/crafting/recipes';
import type { CoinExchange } from './exchanges';

/**
 * 구슬로 가공해 팔기.
 *
 * NPC 가 구슬을 받고 내주는 재료는 거래 불가라 그대로는 팔 수 없다. 그 재료를 쓰는 중간 재료
 * (다른 제작법의 재료로 쓰이는 제작품)로 만들면 거래할 수 있게 된다. 그래서 제작법마다
 * "경매장 최저가 - 구슬 말고 사야 하는 재료 값" 을 차익으로 보고, 쓴 구슬 수로 나눠 비교한다.
 *
 * 최종 장비는 넣지 않는다. 같은 이름이어도 능력치에 따라 값이 크게 달라 최저가 하나로 가치를
 * 매기기 어렵다.
 */

/** 구슬로 받는 재료 한 칸. */
export interface BeadInput {
  itemId: number;
  name: string;
  count: number;
  /** 이 칸을 채우는 데 드는 구슬. */
  beads: number;
}

/** 사야 하는 재료 한 칸. 거래 불가 판이 함께 적힌 칸은 거래되는 판으로 산다. */
export interface BuyInput {
  itemId: number;
  name: string;
  count: number;
}

export interface BeadCraft {
  recipe: Recipe;
  itemId: number;
  name: string;
  /** 한 번 만들 때 나오는 개수. */
  yieldCount: number;
  /** 한 번 만들 때 드는 구슬. */
  beads: number;
  beadInputs: BeadInput[];
  buyInputs: BuyInput[];
}

/** 구슬 재료를 쓰는 중간 재료 제작법. 한 번 만들 때 구슬을 적게 쓰는 순. */
export function beadCraftsOf(book: RecipeBook, exchanges: readonly CoinExchange[]): BeadCraft[] {
  const beadCost = new Map(exchanges.map((exchange) => [exchange.id, exchange]));
  const usedAsMaterial = new Set<number>();
  for (const recipe of book.recipes)
    for (const slot of [...recipe.materials, ...recipe.finish, ...recipe.extras])
      for (const id of slot.ids) usedAsMaterial.add(id);

  const crafts: BeadCraft[] = [];
  for (const recipe of book.recipes) {
    if (recipe.skill === CONVERSION_SKILL) continue;
    if (!usedAsMaterial.has(recipe.item) || !book.isTradable(recipe.item)) continue;
    const works = hasWorks(recipe) ? DEFAULT_WORKS : 1;
    const slots = [
      ...recipe.materials.map((slot) => ({ slot, count: slot.count * works })),
      ...recipe.finish.map((slot) => ({ slot, count: slot.count })),
    ];
    const beadInputs: BeadInput[] = [];
    const buyInputs: BuyInput[] = [];
    for (const { slot, count } of slots) {
      const exchange = slot.ids.map((id) => beadCost.get(id)).find((found) => found);
      if (exchange) {
        beadInputs.push({
          itemId: exchange.id,
          name: exchange.name,
          count,
          beads: count * exchange.cost,
        });
      } else {
        const itemId = slot.ids.find((id) => book.isTradable(id)) ?? slot.ids[0];
        buyInputs.push({ itemId, name: book.itemName(itemId), count });
      }
    }
    if (beadInputs.length === 0) continue;
    crafts.push({
      recipe,
      itemId: recipe.item,
      name: book.itemName(recipe.item),
      yieldCount: recipe.yield,
      beads: beadInputs.reduce((sum, input) => sum + input.beads, 0),
      beadInputs,
      buyInputs,
    });
  }
  return crafts.sort((a, b) => a.beads - b.beads || a.name.localeCompare(b.name, 'ko'));
}

/** 사야 하는 재료 한 칸의 값. */
export type InputCost =
  | { status: 'loading' }
  | { status: 'error' }
  /** 경매장에 매물이 없고 NPC 도 팔지 않는다. */
  | { status: 'none' }
  /** 매물이 모자라 필요한 개수를 다 채우지 못한다. */
  | { status: 'short'; filled: number }
  | { status: 'ok'; cost: number; from: 'npc' | 'auction' };

export function inputCostOf(
  input: BuyInput,
  price: PriceState | undefined,
  npcUnit: number | undefined,
): InputCost {
  const npc = npcUnit === undefined ? undefined : npcUnit * input.count;
  // NPC 가 파는 재료는 개수 제한 없이 그 값에 산다. 경매장이 더 싸면 경매장에서 산다.
  if (price?.status === 'ok') {
    const quote = quoteBuy(price.price, input.count);
    const complete = quote.filled >= input.count;
    if (complete && (npc === undefined || quote.cost < npc))
      return { status: 'ok', cost: quote.cost, from: 'auction' };
    if (npc !== undefined) return { status: 'ok', cost: npc, from: 'npc' };
    return quote.filled === 0 ? { status: 'none' } : { status: 'short', filled: quote.filled };
  }
  if (npc !== undefined) return { status: 'ok', cost: npc, from: 'npc' };
  if (!price || price.status === 'loading') return { status: 'loading' };
  return { status: 'error' };
}

export type CraftValue =
  | { status: 'loading' }
  /** 판매가나 재료 값 가운데 모르는 것이 있다. reason 이 무엇이 모자란지 말한다. */
  | { status: 'unknown'; reason: 'error' | 'no-sale' | 'no-material' }
  | { status: 'ok'; sale: number; materialCost: number; profit: number; perBead: number };

export interface ValuedCraft extends BeadCraft {
  inputs: { input: BuyInput; cost: InputCost }[];
  value: CraftValue;
  /** 구슬 1개당 차익이 가장 큰 줄. 차익이 날 때만 참이다. */
  best: boolean;
}

export function valueCraft(
  craft: BeadCraft,
  priceOf: (name: string) => PriceState | undefined,
  npcUnitOf: (name: string) => number | undefined,
): Omit<ValuedCraft, 'best'> {
  const inputs = craft.buyInputs.map((input) => ({
    input,
    cost: inputCostOf(input, priceOf(input.name), npcUnitOf(input.name)),
  }));
  const sale = priceOf(craft.name);
  const statuses = [...inputs.map(({ cost }) => cost.status), sale?.status ?? 'loading'];

  let value: CraftValue;
  if (statuses.includes('loading')) value = { status: 'loading' };
  else if (statuses.includes('error')) value = { status: 'unknown', reason: 'error' };
  else if (inputs.some(({ cost }) => cost.status !== 'ok'))
    value = { status: 'unknown', reason: 'no-material' };
  else {
    const lowest = sale?.status === 'ok' ? sale.price.offers[0]?.price : undefined;
    if (lowest === undefined) value = { status: 'unknown', reason: 'no-sale' };
    else {
      const materialCost = inputs.reduce(
        (sum, { cost }) => sum + (cost.status === 'ok' ? cost.cost : 0),
        0,
      );
      const saleTotal = lowest * craft.yieldCount;
      const profit = saleTotal - materialCost;
      value = {
        status: 'ok',
        sale: saleTotal,
        materialCost,
        profit,
        perBead: Math.floor(profit / craft.beads),
      };
    }
  }
  return { ...craft, inputs, value };
}

/** 값을 아는 줄은 구슬 1개당 차익이 큰 순, 모르는 줄은 그 뒤에 원래 순서대로. */
export function rankCrafts(crafts: readonly Omit<ValuedCraft, 'best'>[]): ValuedCraft[] {
  const perBeadOf = (craft: Omit<ValuedCraft, 'best'>) =>
    craft.value.status === 'ok' ? craft.value.perBead : -Infinity;
  const top = Math.max(-Infinity, ...crafts.map(perBeadOf));
  return crafts
    .map((craft, index) => ({ craft, index }))
    .sort((a, b) => {
      const diff = perBeadOf(b.craft) - perBeadOf(a.craft);
      return (Number.isNaN(diff) ? 0 : diff) || a.index - b.index;
    })
    .map(({ craft }) => ({ ...craft, best: top > 0 && perBeadOf(craft) === top }));
}

export interface BeadPlanPick {
  craft: ValuedCraft;
  times: number;
  beads: number;
  profit: number;
}

export interface BeadPlan {
  picks: BeadPlanPick[];
  beadsUsed: number;
  profit: number;
}

/** 한 번에 계산하는 구슬 수의 상한. 표를 그만큼 만들어 푼다. */
export const MAX_BEADS = 10_000;

/**
 * 가진 구슬로 차익이 가장 크게 나는 조합. 같은 제작법을 몇 번이든 할 수 있다고 보고
 * 구슬 수를 무게로 한 배낭 문제로 푼다. 차익이 나지 않는 제작법은 고르지 않는다.
 *
 * 한 번 만들 때의 값을 그대로 곱한다. 여러 번 만들면 재료 매물이 모자라거나 판매가가
 * 내려갈 수 있는데, 그 차이는 여기서 셈하지 않는다.
 */
export function planBeads(crafts: readonly ValuedCraft[], budget: number): BeadPlan {
  const beads = Math.max(0, Math.min(MAX_BEADS, Math.floor(budget)));
  const options = crafts.filter(
    (craft) => craft.value.status === 'ok' && craft.value.profit > 0 && craft.beads > 0,
  );
  const profitOf = (craft: ValuedCraft) => (craft.value.status === 'ok' ? craft.value.profit : 0);

  const best = new Float64Array(beads + 1);
  const choice = new Int32Array(beads + 1).fill(-1);
  for (let used = 1; used <= beads; used += 1) {
    best[used] = best[used - 1];
    for (let index = 0; index < options.length; index += 1) {
      const weight = options[index].beads;
      if (weight > used) continue;
      const candidate = best[used - weight] + profitOf(options[index]);
      if (candidate > best[used]) {
        best[used] = candidate;
        choice[used] = index;
      }
    }
  }

  const times = new Map<number, number>();
  let used = beads;
  while (used > 0) {
    const index = choice[used];
    if (index < 0) {
      used -= 1;
      continue;
    }
    times.set(index, (times.get(index) ?? 0) + 1);
    used -= options[index].beads;
  }

  const picks = [...times.entries()]
    .map(([index, count]) => ({
      craft: options[index],
      times: count,
      beads: options[index].beads * count,
      profit: profitOf(options[index]) * count,
    }))
    .sort((a, b) => b.profit - a.profit);
  return {
    picks,
    beadsUsed: picks.reduce((sum, pick) => sum + pick.beads, 0),
    profit: picks.reduce((sum, pick) => sum + pick.profit, 0),
  };
}
