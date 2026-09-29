import type { PriceState } from './market';
import { isComplete, type CraftPlan } from './plan';

/**
 * 만들어 팔 때의 손익. 완성품의 경매장 최저가에서 개당 재료비를 뺀다.
 *
 * 재료비는 화면의 "재료 예상 총액" 과 같은 계획에서 나온다. NPC 에서 사거나 하위 재료를 직접 만들기로
 * 고른 것이 그대로 반영된다. 코인으로 산 재료는 골드가 들지 않지만 그 재료를 경매장에서 샀다면 드는
 * 값을 더한다. 빼면 코인을 공짜로 친 이익이 나온다.
 */
export interface CraftProfit {
  /** 개당 재료비. 받는 중인 시세가 있으면 없다. */
  unitCost?: number;
  /** 완성품의 경매장 최저가. 매물이 없거나 받는 중이면 없다. */
  lowest?: number;
  /** lowest - unitCost. 둘 중 하나라도 없으면 없다. */
  profit?: number;
  /** 매물이 모자라거나 값을 모르는 재료가 있어 재료비가 실제보다 작게 잡혔는지. */
  partial: boolean;
}

export function craftProfit(
  plan: Pick<CraftPlan, 'total' | 'beads' | 'beadsWorth'>,
  quantity: number,
  product: PriceState | undefined,
): CraftProfit {
  const usesCoins = plan.beads > 0;
  const settled = plan.total.pending === 0 && (!usesCoins || plan.beadsWorth.pending === 0);
  const partial = !isComplete(plan.total) || (usesCoins && !isComplete(plan.beadsWorth));
  const unitCost =
    settled && quantity > 0
      ? Math.round((plan.total.gold + (usesCoins ? plan.beadsWorth.gold : 0)) / quantity)
      : undefined;
  const lowest = product?.status === 'ok' ? product.price.offers[0]?.price : undefined;
  return {
    unitCost,
    lowest,
    profit: unitCost !== undefined && lowest !== undefined ? lowest - unitCost : undefined,
    partial,
  };
}
