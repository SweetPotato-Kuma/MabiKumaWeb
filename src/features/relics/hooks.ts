import { useEffect } from 'react';
import { useAuctionScanQuery, useAuctionSnapshotQuery } from '@/features/auction/hooks';
import { RELIC_CATEGORY } from './murias';

/** 모듈 수준에 둔다. 매 렌더 새 배열이면 조회 키와 메모가 매번 바뀐다. */
const CATEGORIES = [RELIC_CATEGORY];

/**
 * 유물 카테고리의 판매 중 매물 전부.
 *
 * 워커가 10분마다 모아 둔 것(features/auction/snapshot.ts)을 먼저 쓰고, 없거나 너무 묵었으면
 * 넥슨 API 로 받는다. 한 카테고리가 3쪽 남짓이라 실시간이면 끝까지 받는다. 한 쪽이라도 빠지면
 * 가장 싼 값이 틀리므로 다 받기 전에는 표를 내놓지 않는다.
 */
export function useRelicListings(enabled: boolean) {
  const snapshot = useAuctionSnapshotQuery(CATEGORIES, enabled);
  const live = snapshot.status === 'unavailable' || snapshot.status === 'off';
  const scan = useAuctionScanQuery(CATEGORIES, enabled && live);

  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = scan;
  useEffect(() => {
    if (live && hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [live, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  if (!live) {
    return {
      items: snapshot.data?.items,
      loadedCount: snapshot.data?.loadedCount ?? 0,
      /** 매물을 모은 시각(ms). */
      at: snapshot.at,
      error: null as Error | null,
      retry: () => undefined,
    };
  }
  const done = scan.data !== undefined && !hasNextPage;
  return {
    items: done ? scan.data?.items : undefined,
    loadedCount: scan.data?.loadedCount ?? 0,
    at: done ? scan.dataUpdatedAt : null,
    error: scan.error,
    retry: () => void scan.refetch(),
  };
}
