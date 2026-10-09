import { quoteBuy, type PriceState } from '@/features/crafting/market';
import type { ShortageRow } from './plan';

/**
 * 모자란 재료의 값.
 *
 * 경매장에서 거래되는 재료는 싼 매물부터 필요한 개수만큼 채운 합이고, NPC 가 파는 재료는 NPC 값이다
 * (둘 다 되면 NPC, features/crafting 의 기본과 같다). 거래도 NPC 판매도 없는 재료는 값을 모른다.
 */
export type CostStatus = 'ok' | 'loading' | 'error' | 'untradable' | 'empty';

export interface ItemCost {
  status: CostStatus;
  /** 채운 개수의 값. 값을 모르면 0. */
  gold: number;
  source?: 'auction' | 'npc';
  /** 매물이 모자라 필요한 개수를 다 채우지 못했는지. gold 에는 채운 만큼만 들어 있다. */
  shortfall: boolean;
}

export interface PriceSource {
  tradable: boolean;
  /** NPC 가 판다면 개당 값. */
  npcUnit?: number;
  /** 경매장 시세. 아직 묻지 않았으면 undefined. */
  price?: PriceState;
}

const unknown = (status: CostStatus): ItemCost => ({ status, gold: 0, shortfall: false });

export function costOf(required: number, source: PriceSource): ItemCost {
  if (required <= 0) return { status: 'ok', gold: 0, shortfall: false };
  if (source.npcUnit !== undefined)
    return { status: 'ok', gold: source.npcUnit * required, source: 'npc', shortfall: false };
  if (!source.tradable) return unknown('untradable');
  const { price } = source;
  if (!price || price.status === 'loading') return unknown('loading');
  if (price.status === 'error') return unknown('error');
  const quote = quoteBuy(price.price, required);
  if (quote.filled === 0) return unknown('empty');
  return {
    status: 'ok',
    gold: quote.cost,
    source: 'auction',
    shortfall: quote.filled < required,
  };
}

export interface CostTotal {
  gold: number;
  /** 시세를 받는 중인 재료 수. */
  pending: number;
  /** 값을 모르는 재료 수(조회 실패, 거래 불가, 매물 없음). */
  unknown: number;
  /** 매물이 모자란 재료 수. */
  shortfall: number;
}

export function sumCosts(costs: readonly ItemCost[]): CostTotal {
  const total: CostTotal = { gold: 0, pending: 0, unknown: 0, shortfall: 0 };
  for (const cost of costs) {
    total.gold += cost.gold;
    if (cost.status === 'loading') total.pending += 1;
    else if (cost.status !== 'ok') total.unknown += 1;
    if (cost.shortfall) total.shortfall += 1;
  }
  return total;
}

/** 합계가 실제와 같은지. 모르는 재료가 섞인 합은 실제보다 싸 보인다. */
export const isCostComplete = (total: CostTotal) =>
  total.pending === 0 && total.unknown === 0 && total.shortfall === 0;

/** 경매장에 시세를 물어야 하는 재료 이름. 모자란 것 중 거래되고 NPC 가 팔지 않는 것만. */
export function priceNamesOf(
  rows: readonly ShortageRow[],
  nameOf: (itemId: number) => string,
  isTradable: (itemId: number) => boolean,
  npcUnitOf: (itemId: number) => number | undefined,
): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.short > 0 && isTradable(row.itemId) && npcUnitOf(row.itemId) === undefined)
      names.add(nameOf(row.itemId));
  }
  return [...names];
}
