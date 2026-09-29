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
  /** held 는 필요한 개수를 가진 재료로 다 채워 살 것이 없다는 뜻이다. */
  | { status: 'ok'; cost: number; from: 'npc' | 'auction' | 'held' };

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
  | {
      status: 'ok';
      sale: number;
      materialCost: number;
      profit: number;
      /** 가진 재료로 구슬 재료를 다 채워 구슬이 필요 없으면 null. */
      perBead: number | null;
    };

/** 구슬 재료 한 칸. held 는 가진 재료로 채운 개수, beads 는 나머지를 교환하는 데 드는 구슬. */
export interface BeadRow {
  input: BeadInput;
  held: number;
  beads: number;
  /** 같은 재료의 거래 가능한 판을 경매장에서 필요한 개수만큼 샀을 때의 값. */
  market: InputCost;
}

/**
 * 원재료 시세. 구슬 재료를 모두 경매장에서 샀다고 칠 때의 값이다. 구슬로 받는 판은 거래할 수
 * 없지만 같은 이름의 거래 가능한 판이 경매장에 있다. 하나라도 모르면 합을 매기지 않는다.
 */
export type RawCost =
  | { status: 'loading' }
  | { status: 'unknown' }
  | { status: 'ok'; cost: number };

/** 사는 재료 한 칸. held 는 가진 재료로 채운 개수, cost 는 나머지를 사는 값. */
export interface BuyRow {
  input: BuyInput;
  held: number;
  cost: InputCost;
}

export interface ValuedCraft extends BeadCraft {
  beadRows: BeadRow[];
  inputs: BuyRow[];
  /** 가진 재료를 빼고 한 번 만드는 데 드는 구슬. */
  needBeads: number;
  /** 가진 재료를 하나라도 썼는지. */
  usesHeld: boolean;
  value: CraftValue;
  /** 한 번 만들 때 구슬 재료의 원재료 시세. */
  raw: RawCost;
  /**
   * 가공 이득. 판매가 - 원재료 시세 - 살 재료 값. 원재료를 시세대로 샀다고 칠 때 가공해서 남는
   * 값이라, 음수면 가공이 원재료 값을 깎는다. 값을 모르면 undefined.
   */
  gain?: number;
  /** 구슬 1개당 차익이 가장 큰 줄. 차익이 날 때만 참이다. */
  best: boolean;
}

/** 가진 재료 개수. 아이템 번호로 찾는다. 없으면 0 이다. */
export type HeldOf = (itemId: number) => number;

const NOTHING_HELD: HeldOf = () => 0;

/** 한 번 만들 때의 값. 가진 재료가 있으면 그만큼 구슬을 덜 쓰고 덜 산다. */
export function valueCraft(
  craft: BeadCraft,
  priceOf: (name: string) => PriceState | undefined,
  npcUnitOf: (name: string) => number | undefined,
  heldOf: HeldOf = NOTHING_HELD,
): Omit<ValuedCraft, 'best'> {
  const beadRows = craft.beadInputs.map((input): BeadRow => {
    const held = Math.min(input.count, Math.max(0, heldOf(input.itemId)));
    return {
      input,
      held,
      beads: (input.count - held) * (input.beads / input.count),
      // 원재료 시세는 가진 재료와 상관없이 필요한 개수 전부의 값이다. NPC 는 팔지 않는다.
      market: inputCostOf(input, priceOf(input.name), undefined),
    };
  });
  const inputs = craft.buyInputs.map((input): BuyRow => {
    const held = Math.min(input.count, Math.max(0, heldOf(input.itemId)));
    const need = input.count - held;
    const cost: InputCost =
      need === 0
        ? { status: 'ok', cost: 0, from: 'held' }
        : inputCostOf({ ...input, count: need }, priceOf(input.name), npcUnitOf(input.name));
    return { input, held, cost };
  });
  const needBeads = beadRows.reduce((sum, row) => sum + row.beads, 0);
  const usesHeld = [...beadRows, ...inputs].some((row) => row.held > 0);

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
        perBead: needBeads > 0 ? Math.floor(profit / needBeads) : null,
      };
    }
  }
  const markets = beadRows.map((row) => row.market);
  const raw: RawCost = markets.some((market) => market.status === 'loading')
    ? { status: 'loading' }
    : markets.every((market) => market.status === 'ok')
      ? {
          status: 'ok',
          cost: markets.reduce((sum, market) => sum + (market.status === 'ok' ? market.cost : 0), 0),
        }
      : { status: 'unknown' };
  const gain =
    value.status === 'ok' && raw.status === 'ok' ? value.profit - raw.cost : undefined;
  return { ...craft, beadRows, inputs, needBeads, usesHeld, value, raw, gain };
}

/** 순위를 매기는 값. 구슬 없이 만들 수 있고 차익이 나면 맨 위, 값을 모르면 맨 아래다. */
function rankKey(craft: Omit<ValuedCraft, 'best'>): number {
  if (craft.value.status !== 'ok') return -Infinity;
  if (craft.value.perBead === null) return craft.value.profit > 0 ? Infinity : -Infinity;
  return craft.value.perBead;
}

/** 값을 아는 줄은 구슬 1개당 차익이 큰 순, 모르는 줄은 그 뒤에 원래 순서대로. */
export function rankCrafts(crafts: readonly Omit<ValuedCraft, 'best'>[]): ValuedCraft[] {
  const top = Math.max(-Infinity, ...crafts.map(rankKey));
  return crafts
    .map((craft, index) => ({ craft, index }))
    .sort((a, b) => {
      const diff = rankKey(b.craft) - rankKey(a.craft);
      return (Number.isNaN(diff) ? 0 : diff) || a.index - b.index;
    })
    .map(({ craft }) => ({ ...craft, best: top > 0 && rankKey(craft) === top }));
}

/**
 * 추천대로 만들 때 재료 하나를 얼마나 쓰는지. count 는 모든 횟수에 들어가는 개수, held 는 그중 가진
 * 재료로 채운 개수다. 구슬 재료는 나머지를 교환하는 구슬(beads), 사는 재료는 나머지를 사는 값(gold).
 */
export interface MaterialUsage {
  itemId: number;
  name: string;
  kind: 'bead' | 'buy';
  count: number;
  held: number;
  beads: number;
  gold: number;
  /** 사는 재료를 어디서 사는지. 마지막으로 고른 곳이다. 모두 가진 것으로 채웠으면 held. */
  from?: 'npc' | 'auction' | 'held';
}

export interface BeadPlanPick {
  craft: ValuedCraft;
  times: number;
  beads: number;
  profit: number;
  /** 그중 가진 재료를 써서 만든 횟수. */
  heldTimes: number;
  /** 재료마다 추천대로 만들 때 쓰는 양. 한 번 만들 때의 재료 순서와 같다. */
  usage: MaterialUsage[];
}

/** 한 번 만든 값(valued)을 times 번만큼 재료 사용 내역에 더한다. */
function addUsage(usage: MaterialUsage[], valued: Omit<ValuedCraft, 'best'>, times: number): MaterialUsage[] {
  const byId = new Map(usage.map((row) => [`${row.kind}-${row.itemId}`, { ...row }]));
  const add = (kind: 'bead' | 'buy', itemId: number, name: string, change: Partial<MaterialUsage>) => {
    const key = `${kind}-${itemId}`;
    const row = byId.get(key) ?? { itemId, name, kind, count: 0, held: 0, beads: 0, gold: 0 };
    row.count += (change.count ?? 0) * times;
    row.held += (change.held ?? 0) * times;
    row.beads += (change.beads ?? 0) * times;
    row.gold += (change.gold ?? 0) * times;
    if (change.from) row.from = change.from;
    byId.set(key, row);
  };
  for (const row of valued.beadRows)
    add('bead', row.input.itemId, row.input.name, {
      count: row.input.count,
      held: row.held,
      beads: row.beads,
    });
  for (const row of valued.inputs)
    add('buy', row.input.itemId, row.input.name, {
      count: row.input.count,
      held: row.held,
      gold: row.cost.status === 'ok' ? row.cost.cost : 0,
      from: row.cost.status === 'ok' ? row.cost.from : undefined,
    });
  return [...byId.values()];
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
    (craft) => craft.value.status === 'ok' && craft.value.profit > 0 && craft.needBeads > 0,
  );
  const profitOf = (craft: ValuedCraft) => (craft.value.status === 'ok' ? craft.value.profit : 0);

  const best = new Float64Array(beads + 1);
  const choice = new Int32Array(beads + 1).fill(-1);
  for (let used = 1; used <= beads; used += 1) {
    best[used] = best[used - 1];
    for (let index = 0; index < options.length; index += 1) {
      const weight = options[index].needBeads;
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
    used -= options[index].needBeads;
  }

  const picks = [...times.entries()]
    .map(([index, count]) => ({
      craft: options[index],
      times: count,
      beads: options[index].needBeads * count,
      profit: profitOf(options[index]) * count,
      heldTimes: 0,
      usage: addUsage([], options[index], count),
    }))
    .sort((a, b) => b.profit - a.profit);
  return {
    picks,
    beadsUsed: picks.reduce((sum, pick) => sum + pick.beads, 0),
    profit: picks.reduce((sum, pick) => sum + pick.profit, 0),
  };
}

export interface Pricing {
  priceOf: (name: string) => PriceState | undefined;
  npcUnitOf: (name: string) => number | undefined;
}

/**
 * 가진 재료까지 쓰는 조합.
 *
 * 가진 재료는 쓰면 줄어드므로, 먼저 가진 재료를 쓰는 제작을 한 번씩 고른다. 고를 때마다 남은 가진
 * 재료로 값을 다시 매기고, 쓰는 구슬 1개당 차익이 가장 큰 것(구슬이 필요 없으면 맨 먼저)을 고른다.
 * 가진 재료로 차익이 나는 제작이 더 없으면 남은 구슬로 planBeads 를 푼다. 가진 재료를 쓰는 순서는
 * 이렇게 하나씩 고른 것이라, 모든 경우를 다 따진 최선과 조금 다를 수 있다.
 */
export function planWithInventory(
  crafts: readonly BeadCraft[],
  budget: number,
  pricing: Pricing,
  inventory: ReadonlyMap<number, number>,
): BeadPlan {
  const remaining = new Map(inventory);
  const heldOf: HeldOf = (itemId) => remaining.get(itemId) ?? 0;
  let beadsLeft = Math.max(0, Math.min(MAX_BEADS, Math.floor(budget)));
  const picked = new Map<number, BeadPlanPick>();
  const ratio = (craft: Omit<ValuedCraft, 'best'>) => {
    if (craft.value.status !== 'ok') return -Infinity;
    return craft.needBeads === 0 ? Infinity : craft.value.profit / craft.needBeads;
  };

  // 한 번 고를 때마다 가진 재료가 하나 이상 줄어드므로 가진 재료 개수만큼만 돈다.
  const limit = [...inventory.values()].reduce((sum, count) => sum + count, 0);
  for (let round = 0; round < limit; round += 1) {
    const candidates = crafts
      .map((craft) => valueCraft(craft, pricing.priceOf, pricing.npcUnitOf, heldOf))
      .filter(
        (craft) =>
          craft.usesHeld &&
          craft.value.status === 'ok' &&
          craft.value.profit > 0 &&
          craft.needBeads <= beadsLeft,
      );
    if (candidates.length === 0) break;
    const chosen = candidates.reduce((a, b) => (ratio(b) > ratio(a) ? b : a));
    for (const row of [...chosen.beadRows, ...chosen.inputs]) {
      if (row.held > 0) remaining.set(row.input.itemId, heldOf(row.input.itemId) - row.held);
    }
    beadsLeft -= chosen.needBeads;
    const profit = chosen.value.status === 'ok' ? chosen.value.profit : 0;
    const pick = picked.get(chosen.itemId);
    if (pick) {
      pick.times += 1;
      pick.heldTimes += 1;
      pick.beads += chosen.needBeads;
      pick.profit += profit;
      pick.usage = addUsage(pick.usage, chosen, 1);
    } else {
      picked.set(chosen.itemId, {
        craft: { ...chosen, best: false },
        times: 1,
        heldTimes: 1,
        beads: chosen.needBeads,
        profit,
        usage: addUsage([], chosen, 1),
      });
    }
  }

  const rest = planBeads(
    rankCrafts(crafts.map((craft) => valueCraft(craft, pricing.priceOf, pricing.npcUnitOf))),
    beadsLeft,
  );
  for (const pick of rest.picks) {
    const existing = picked.get(pick.craft.itemId);
    if (existing) {
      existing.times += pick.times;
      existing.beads += pick.beads;
      existing.profit += pick.profit;
      existing.usage = addUsage(existing.usage, pick.craft, pick.times);
    } else picked.set(pick.craft.itemId, pick);
  }

  const picks = [...picked.values()].sort((a, b) => b.profit - a.profit);
  return {
    picks,
    beadsUsed: picks.reduce((sum, pick) => sum + pick.beads, 0),
    profit: picks.reduce((sum, pick) => sum + pick.profit, 0),
  };
}
