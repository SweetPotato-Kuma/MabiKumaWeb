import type { PriceState } from '@/features/crafting/market';
import type { RecentSummary } from '@/features/market/api';
import type { CoinExchange } from './exchanges';

/**
 * 코인 1개당 가치.
 *
 * 교환품의 경매장 최저가를 필요한 코인 개수로 나눈다. 교환품 하나를 받는 일이라 "싼 매물부터
 * 몇 개를 채운 값" 이 아니라 매물 한 개의 최저가를 쓴다. 골드 아래 자리는 버린다.
 *
 * 최저가는 매물 한 개의 값이라 거래가 거의 없는 교환품도 높게 나올 수 있다. 그래서 최근 24시간에 실제로
 * 거래된 중위가와 거래량도 함께 본다. 거래가 기준 값은 그 중위가를 코인 개수로 나눈다.
 */

/** 무엇을 기준으로 줄을 세우고 "가장 이득" 을 고를지. */
export type Basis = 'lowest' | 'trade';

/** 24시간 거래량이 이보다 적으면 "거래 적음" 이다. 사고팔 상대가 얼마나 있는지를 가늠하는 기준이다. */
export const LOW_VOLUME = 20;

export type TradeValue =
  | { status: 'loading' }
  /** 거래 기록을 받지 못했거나 조회할 수 없다. 거래가 없었다는 뜻이 아니다. */
  | { status: 'unknown' }
  /** 최근 24시간에 거래가 없었다. */
  | { status: 'none' }
  | { status: 'ok'; mid: number; qty: number; perCoin: number };

export interface TradeStats {
  /** 이름마다 최근 24시간 통계. 거래가 없던 이름은 빠진다. */
  items: Readonly<Record<string, RecentSummary>>;
  /** 아직 받는 중이다. */
  loading: boolean;
  /** 받지 못했다. 거래가 없었던 것과 갈라야 해서 따로 둔다. */
  failed?: boolean;
}

export type ExchangeValue =
  | { status: 'loading' }
  | { status: 'error' }
  /** 경매장에 매물이 없다. 거래할 수 없는 아이템도 여기에 든다. */
  | { status: 'none' }
  | { status: 'ok'; lowest: number; perCoin: number };

export interface ExchangeRow extends CoinExchange {
  value: ExchangeValue;
  /** 최근 24시간 거래가 기준 값과 거래량. */
  trade: TradeValue;
  /** 거래량이 기준(LOW_VOLUME)보다 적다. 거래가 없었던 것도 여기에 든다. */
  lowVolume: boolean;
  /** 고른 기준으로 코인 1개당 가치가 가장 높은 줄. 값이 같으면 모두 참이다. */
  best: boolean;
}

export function tradeOf(exchange: CoinExchange, stats: TradeStats | undefined): TradeValue {
  // 조회할 수 없는 상태(stats 없음)와 받지 못한 상태는 모르는 것이지 거래가 없었던 것이 아니다.
  if (!stats || stats.failed) return { status: 'unknown' };
  const summary = stats.items[exchange.name];
  if (!summary) return stats.loading ? { status: 'loading' } : { status: 'none' };
  return {
    status: 'ok',
    mid: summary.mid,
    qty: summary.qty,
    perCoin: Math.floor(summary.mid / exchange.cost),
  };
}

export function valueOf(exchange: CoinExchange, price: PriceState | undefined): ExchangeValue {
  if (!price || price.status === 'loading') return { status: 'loading' };
  if (price.status === 'error') return { status: 'error' };
  const lowest = price.price.offers[0]?.price;
  if (lowest === undefined) return { status: 'none' };
  return { status: 'ok', lowest, perCoin: Math.floor(lowest / exchange.cost) };
}

export interface RankOptions {
  /** 줄 세우기와 "가장 이득" 의 기준. 기본은 최저가다. */
  basis?: Basis;
  /** 거래 적음인 줄은 "가장 이득" 에서 뺀다. 줄 순서는 그대로다. */
  skipLowVolume?: boolean;
}

/**
 * 값을 아는 줄은 고른 기준의 코인 1개당 가치가 높은 순, 모르는 줄은 그 뒤에 원래 순서대로 둔다.
 * 거래 통계를 넘기지 않으면 거래가 기준은 모두 모르는 것으로 본다.
 */
export function rankExchanges(
  exchanges: readonly CoinExchange[],
  prices: ReadonlyMap<string, PriceState>,
  stats?: TradeStats,
  options: RankOptions = {},
): ExchangeRow[] {
  const { basis = 'lowest', skipLowVolume = false } = options;
  const rows = exchanges.map((exchange) => {
    const trade = tradeOf(exchange, stats);
    return {
      ...exchange,
      value: valueOf(exchange, prices.get(exchange.name)),
      trade,
      lowVolume: trade.status === 'none' || (trade.status === 'ok' && trade.qty < LOW_VOLUME),
    };
  });
  const perCoinOf = (row: (typeof rows)[number]) => {
    if (basis === 'trade') return row.trade.status === 'ok' ? row.trade.perCoin : -1;
    return row.value.status === 'ok' ? row.value.perCoin : -1;
  };
  const eligible = (row: (typeof rows)[number]) => !(skipLowVolume && row.lowVolume);
  const top = Math.max(-1, ...rows.filter(eligible).map(perCoinOf));
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => perCoinOf(b.row) - perCoinOf(a.row) || a.index - b.index)
    .map(({ row }) => ({ ...row, best: top > 0 && eligible(row) && perCoinOf(row) === top }));
}
