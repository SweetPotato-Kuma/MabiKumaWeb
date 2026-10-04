import { DUCAT_GEM, type DucatItem, type FarmOrder, type FarmRecipe, type Material, type RewardItem } from './data';

/**
 * 탈틴 농장 손익 계산. 시세는 quote 로 받는다(개당 가격, 모르면 null).
 *
 * - 납품: 필요 물품을 경매장에서 사서 주문을 채웠을 때, 받는 보상 가치에서 물품 값을 뺀다.
 * - 가공: 농작물을 그대로 파는 값과 마법의 솥으로 가공해 파는 값을 견준다.
 * - 두카트: 물품을 경매장에 파는 값과 NPC 에 넘겨 받은 두카트를 골드로 바꾼 값을 견준다.
 *
 * 경매장 판매 수수료는 양쪽에 똑같이 붙으므로 넣지 않는다.
 */

export type Quote = (name: string) => number | null;

/** 물품 합계. 하나라도 시세를 모르면 null 이다. */
export function materialsTotal(materials: readonly Material[], quote: Quote): number | null {
  let total = 0;
  for (const [name, qty] of materials) {
    const unit = quote(name);
    if (unit === null) return null;
    total += unit * qty;
  }
  return total;
}

/** 주문 한 건에 고른 보상 한 칸. 아직 고르지 않았으면 key 가 null 이다. */
export interface RewardPick {
  key: string | null;
  qty: number;
}

export interface OrderOutcome {
  cost: number | null;
  /** 보상을 하나도 고르지 않았으면 null. */
  reward: number | null;
  profit: number | null;
}

export function rewardTotal(
  picks: readonly RewardPick[],
  rewards: readonly RewardItem[],
  values: Readonly<Record<string, number>>,
): number | null {
  let total: number | null = null;
  for (const pick of picks) {
    const item = rewards.find((reward) => reward.key === pick.key);
    if (!item) continue;
    total = (total ?? 0) + (values[item.key] ?? item.value) * Math.max(0, pick.qty);
  }
  return total;
}

export function orderOutcome(
  order: FarmOrder,
  picks: readonly RewardPick[],
  rewards: readonly RewardItem[],
  values: Readonly<Record<string, number>>,
  quote: Quote,
): OrderOutcome {
  const cost = materialsTotal(order.materials, quote);
  const reward = rewardTotal(picks, rewards, values);
  return { cost, reward, profit: cost === null || reward === null ? null : reward - cost };
}

export interface RecipeOutcome {
  /** 농작물을 그대로 팔 때. */
  raw: number | null;
  /** 가공품을 팔 때. */
  crafted: number | null;
  /** 가공품 − 농작물. */
  gain: number | null;
}

export function recipeOutcome(recipe: FarmRecipe, quote: Quote): RecipeOutcome {
  const raw = materialsTotal(recipe.materials, quote);
  const crafted = quote(recipe.name);
  return { raw, crafted, gain: raw === null || crafted === null ? null : crafted - raw };
}

/** 두카트 1개의 골드 가치. 티어드롭 젬스톤 값을 그 두카트 값으로 나눈다. 시세를 모르면 null. */
export function goldPerDucat(gemPrice: number | null): number | null {
  return gemPrice === null ? null : gemPrice / DUCAT_GEM.ducats;
}

export interface DucatOutcome {
  market: number | null;
  /** 두카트를 골드로 바꾼 값. 골드는 소수점이 없어 반올림한다. */
  exchanged: number | null;
  /** 두카트 − 경매장. 0 이상이면 NPC 에 넘기는 편이 낫다. */
  gain: number | null;
}

export function ducatOutcome(item: DucatItem, rate: number | null, quote: Quote): DucatOutcome {
  const market = quote(item.name);
  const exchanged = rate === null ? null : Math.round(item.ducats * rate);
  return { market, exchanged, gain: market === null || exchanged === null ? null : exchanged - market };
}

/** 이득이 큰 순. 모르는 것은 맨 뒤에 원래 순서대로. */
export function byGainDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}
