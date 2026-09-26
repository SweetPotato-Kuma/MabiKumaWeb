import type { PriceState } from '@/features/crafting/market';
import type { CoinExchange } from './exchanges';

/**
 * 코인 1개당 가치.
 *
 * 교환품의 경매장 최저가를 필요한 코인 개수로 나눈다. 교환품 하나를 받는 일이라 "싼 매물부터
 * 몇 개를 채운 값" 이 아니라 매물 한 개의 최저가를 쓴다. 골드 아래 자리는 버린다.
 */

export type ExchangeValue =
  | { status: 'loading' }
  | { status: 'error' }
  /** 경매장에 매물이 없다. 거래할 수 없는 아이템도 여기에 든다. */
  | { status: 'none' }
  | { status: 'ok'; lowest: number; perCoin: number };

export interface ExchangeRow extends CoinExchange {
  value: ExchangeValue;
  /** 코인 1개당 가치가 가장 높은 줄. 값이 같으면 모두 참이다. */
  best: boolean;
}

export function valueOf(exchange: CoinExchange, price: PriceState | undefined): ExchangeValue {
  if (!price || price.status === 'loading') return { status: 'loading' };
  if (price.status === 'error') return { status: 'error' };
  const lowest = price.price.offers[0]?.price;
  if (lowest === undefined) return { status: 'none' };
  return { status: 'ok', lowest, perCoin: Math.floor(lowest / exchange.cost) };
}

/** 값을 아는 줄은 코인 1개당 가치가 높은 순, 모르는 줄은 그 뒤에 원래 순서대로 둔다. */
export function rankExchanges(
  exchanges: readonly CoinExchange[],
  prices: ReadonlyMap<string, PriceState>,
): ExchangeRow[] {
  const rows = exchanges.map((exchange) => ({
    ...exchange,
    value: valueOf(exchange, prices.get(exchange.name)),
  }));
  const perCoinOf = (row: (typeof rows)[number]) =>
    row.value.status === 'ok' ? row.value.perCoin : -1;
  const top = Math.max(-1, ...rows.map(perCoinOf));
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => perCoinOf(b.row) - perCoinOf(a.row) || a.index - b.index)
    .map(({ row }) => ({ ...row, best: top > 0 && perCoinOf(row) === top }));
}
