import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QuoteBasis } from '@/features/calculators/quotes';
import { useDungeonPrices } from '@/features/dungeonCoins/prices';
import { useMarketRecentQuery } from '@/features/market/api';
import { FARM_PRICE_NAMES } from './data';
import type { Quote } from './value';

export interface FarmQuotes {
  quote: Quote;
  /** 아직 받는 중인 이름 수. */
  pending: number;
  /** 받지 못한 이름. 최저가 기준에서만 센다. */
  failed: readonly string[];
  /** 시세를 모은 때(ms). 모르면 null. */
  asOf: number | null;
  retry: () => void;
}

/**
 * 탈틴 농장 시세. 최저가는 워커가 10분마다 모아 두는 시세 파일에서 먼저 읽고(던전 코인 화면과 같은 파일),
 * 1일 중위는 최근 24시간 거래 통계에서 읽는다.
 */
export function useFarmQuotes(basis: QuoteBasis): FarmQuotes {
  const queryClient = useQueryClient();
  const { prices, collectedAt } = useDungeonPrices(FARM_PRICE_NAMES);
  const recent = useMarketRecentQuery(FARM_PRICE_NAMES, basis === 'mid');

  const failed = useMemo(
    () => FARM_PRICE_NAMES.filter((name) => prices.get(name)?.status === 'error'),
    [prices],
  );

  const retry = useCallback(() => {
    for (const name of failed) void queryClient.refetchQueries({ queryKey: ['crafting', 'price', name] });
  }, [failed, queryClient]);

  return useMemo((): FarmQuotes => {
    if (basis === 'mid') {
      return {
        quote: (name) => recent.items[name]?.mid ?? null,
        pending: recent.isLoading ? FARM_PRICE_NAMES.length : 0,
        failed: [],
        asOf: recent.updated ? Date.parse(recent.updated) : null,
        retry,
      };
    }
    return {
      quote: (name) => {
        const state = prices.get(name);
        return state?.status === 'ok' ? (state.price.offers[0]?.price ?? null) : null;
      },
      pending: FARM_PRICE_NAMES.filter((name) => prices.get(name)?.status === 'loading').length,
      failed,
      asOf: collectedAt ?? null,
      retry,
    };
  }, [basis, recent, prices, failed, collectedAt, retry]);
}
