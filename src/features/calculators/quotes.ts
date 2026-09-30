import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchMarketPrice } from '@/features/crafting/market';
import { useMarketRecentQuery } from '@/features/market/api';

/**
 * 계산기가 쓰는 아이템 시세. 이름 목록을 받아 경매장 최저가와 최근 1일 중위가를 돌려준다.
 *
 * 최저가는 지금 올라온 매물 가운데 가장 싼 개당 가격이고, 중위는 최근 24시간 거래의 중위값이다(거래가 없으면 없다).
 * 두 기준 가운데 어느 것을 쓸지는 계산기를 쓰는 사람이 고른다. 받은 값은 재료 시세와 같은 캐시를 쓰므로
 * 다른 화면에서 이미 받은 이름은 다시 묻지 않는다.
 */
export type QuoteBasis = 'lowest' | 'mid';

export interface ItemQuotes {
  /** 고른 기준의 개당 가격. 시세가 없거나 아직 받는 중이면 null. */
  quote: (name: string) => number | null;
  /** 아직 받는 중인 이름이 있다. */
  loading: boolean;
  /** 고른 기준의 시세를 받은(모은) 때(ms). 받은 것이 없으면 null. */
  asOf: number | null;
}

const FIVE_MINUTES = 5 * 60 * 1000;

export function useItemQuotes(names: readonly string[], basis: QuoteBasis): ItemQuotes {
  const unique = useMemo(() => [...new Set(names.filter(Boolean))], [names]);

  const lowest = useQueries({
    queries: unique.map((name) => ({
      // 재료 시세(useMarketPrices)와 같은 키다. 받은 값을 같이 쓴다.
      queryKey: ['crafting', 'price', name],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchMarketPrice(name, signal),
      staleTime: FIVE_MINUTES,
      retry: false,
      enabled: basis === 'lowest',
    })),
    combine: (results) => ({
      prices: new Map(
        results.map((result, index) => [unique[index], result.data?.offers[0]?.price ?? null] as const),
      ),
      loading: results.some((result) => result.isLoading),
      at: results.reduce<number | null>(
        (oldest, result) =>
          result.dataUpdatedAt > 0 && (oldest === null || result.dataUpdatedAt < oldest) ? result.dataUpdatedAt : oldest,
        null,
      ),
    }),
  });

  const recent = useMarketRecentQuery(unique, basis === 'mid');

  return useMemo(() => {
    if (basis === 'lowest') {
      return {
        quote: (name: string) => lowest.prices.get(name) ?? null,
        loading: lowest.loading,
        asOf: lowest.at,
      };
    }
    return {
      quote: (name: string) => recent.items[name]?.mid ?? null,
      loading: recent.isLoading,
      asOf: recent.updated ? Date.parse(recent.updated) : null,
    };
  }, [basis, lowest, recent]);
}
