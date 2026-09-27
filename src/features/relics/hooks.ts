import { useEffect, useState } from 'react';
import { useAuctionScanQuery, useAuctionSnapshotQuery } from '@/features/auction/hooks';
import type { AuctionItem } from '@/features/auction/types';
import { isRelicOption, RELIC_CATEGORY } from './murias';

/** 모듈 수준에 둔다. 매 렌더 새 배열이면 조회 키와 메모가 매번 바뀐다. */
const CATEGORIES = [RELIC_CATEGORY];

/**
 * 지난번에 본 유물 매물. 다시 열 때 새 매물을 기다리는 동안 이것을 먼저 보여 준다.
 *
 * 새 매물은 워커의 목록을 받고 CDN 에서 파일을 받아야 나오는데, 파일 이름이 10분마다 바뀌어
 * 처음 받는 사람은 1~2초, 길면 6초를 빈 화면으로 기다렸다. 표에 필요한 것(이름, 개당 가격,
 * 무리아스 유물 옵션 문장)만 이 브라우저에 남긴다. 몇 분 전 것인지는 화면이 함께 적는다.
 * 저장소가 막힌 브라우저에서는 그냥 새 매물을 기다린다.
 */
const CACHE_KEY = 'mabikuma:relics:last';
/** 이보다 오래된 것은 보여 주지 않는다. 시세가 이만큼 지나면 참고보다 오해가 된다. */
export const RELIC_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** [이름, 개당 가격, 무리아스 유물 옵션 문장]. */
type CachedRow = [string, number, string | null];

interface CachedListings {
  at: number;
  rows: CachedRow[];
}

function toItem([name, price, relic]: CachedRow): AuctionItem {
  return {
    item_name: name,
    item_display_name: name,
    item_count: 1,
    auction_item_category: RELIC_CATEGORY,
    auction_price_per_unit: price,
    // 유물 시세 화면은 남은 시간을 쓰지 않는다. 남기지 않은 값이라 비워 둔다.
    date_auction_expire: '',
    item_option: relic === null ? [] : [{ option_type: '무리아스 유물', option_value: relic }],
  };
}

export function readRelicCache(now = Date.now()): { at: number; items: AuctionItem[] } | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null') as unknown;
    const cached = parsed as CachedListings | null;
    if (!cached || typeof cached.at !== 'number' || !Array.isArray(cached.rows)) return null;
    if (now - cached.at > RELIC_CACHE_MAX_AGE_MS) return null;
    return { at: cached.at, items: cached.rows.map(toItem) };
  } catch {
    return null;
  }
}

export function writeRelicCache(at: number, items: readonly AuctionItem[]) {
  try {
    const rows: CachedRow[] = items.map((item) => [
      item.item_name,
      item.auction_price_per_unit,
      (item.item_option ?? []).find(isRelicOption)?.option_value ?? null,
    ]);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at, rows } satisfies CachedListings));
  } catch {
    // 저장소가 막혔거나 가득 찼다. 다음에도 새 매물을 기다리면 된다.
  }
}

/**
 * 유물 카테고리의 판매 중 매물 전부.
 *
 * 워커가 10분마다 모아 둔 것(features/auction/snapshot.ts)을 먼저 쓰고, 없거나 너무 묵었으면
 * 넥슨 API 로 받는다. 한 카테고리가 3쪽 남짓이라 실시간이면 끝까지 받는다. 한 쪽이라도 빠지면
 * 가장 싼 값이 틀리므로 다 받기 전에는 새 표를 내놓지 않는다. 그동안 지난번에 본 것이 있으면
 * 그것을 보여 주고 refreshing 을 켠다.
 */
export function useRelicListings(enabled: boolean) {
  const snapshot = useAuctionSnapshotQuery(CATEGORIES, enabled);
  const live = snapshot.status === 'unavailable' || snapshot.status === 'off';
  const scan = useAuctionScanQuery(CATEGORIES, enabled && live);
  const [cached] = useState(() => (enabled ? readRelicCache() : null));

  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = scan;
  useEffect(() => {
    if (live && hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [live, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const done = scan.data !== undefined && !hasNextPage;
  const fresh = live
    ? { items: done ? scan.data?.items : undefined, at: done ? scan.dataUpdatedAt : null }
    : { items: snapshot.data?.items, at: snapshot.at };

  const freshItems = fresh.items;
  const freshAt = fresh.at;
  useEffect(() => {
    if (freshItems && freshAt !== null) writeRelicCache(freshAt, freshItems);
  }, [freshItems, freshAt]);

  const error = live ? scan.error : null;
  const showCached = !freshItems && cached !== null && !error;
  return {
    items: freshItems ?? (showCached ? cached.items : undefined),
    loadedCount: live ? (scan.data?.loadedCount ?? 0) : (snapshot.data?.loadedCount ?? 0),
    /** 보여 주는 매물을 모은 시각(ms). */
    at: freshItems ? freshAt : showCached ? cached.at : null,
    /** 지난번에 본 매물을 보여 주며 새 매물을 받는 중. */
    refreshing: showCached,
    error,
    retry: () => void scan.refetch(),
  };
}
