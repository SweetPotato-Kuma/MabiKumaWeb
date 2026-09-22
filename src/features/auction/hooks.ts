import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchAuctionHistory, fetchAuctionKeywordSearch, fetchAuctionList } from './api';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from './types';

const FIVE_MINUTES = 5 * 60 * 1000;

/** 검색 조건이 실제로 요청을 보낼 만한 상태인지 판단한다. */
export function isAuctionSearchReady(input: AuctionSearchInput): boolean {
  if (input.mode === 'keyword') return input.keyword.trim().length > 0;
  return input.category.trim().length > 0 || input.itemName.trim().length > 0;
}

/** 경매장 매물 검색. cursor 기반 무한 스크롤. */
export function useAuctionItemsQuery(input: AuctionSearchInput, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['auction', 'items', input],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      input.mode === 'keyword'
        ? fetchAuctionKeywordSearch({ keyword: input.keyword.trim(), cursor: pageParam }, signal)
        : fetchAuctionList(
            {
              category: input.category || undefined,
              itemName: input.itemName.trim() || undefined,
              cursor: pageParam,
            },
            signal,
          ),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.auction_item ?? []) as AuctionItem[],
      pageCount: data.pages.length,
    }),
    enabled,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}

/** 경매장 거래 내역(최근 1시간) 조회. */
export function useAuctionHistoryQuery(input: AuctionSearchInput, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['auction', 'history', input.category, input.itemName],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      fetchAuctionHistory(
        {
          category: input.category || undefined,
          itemName: input.itemName.trim() || undefined,
          cursor: pageParam,
        },
        signal,
      ),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.auction_history ?? []) as AuctionHistoryItem[],
      pageCount: data.pages.length,
    }),
    enabled,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}
