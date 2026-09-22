import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchAuctionHistory, fetchAuctionKeywordSearch, fetchAuctionList } from './api';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from './types';

const FIVE_MINUTES = 5 * 60 * 1000;

/** 검색 조건이 실제로 요청을 보낼 만한 상태인지 판단한다. */
export function isAuctionSearchReady(input: AuctionSearchInput): boolean {
  return input.keyword.trim().length > 0 || input.category.trim().length > 0;
}

/** 검색어를 단어로 쪼갠다. 쉼표든 공백이든 구분자로 본다. */
function splitTerms(keyword: string): string[] {
  return keyword
    .split(/[,\s]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

/** 단어가 이름에 모두 들어 있는지. 넥슨 키워드 검색과 같은 규칙으로 맞춘다. */
function matchesTerms(item: { item_name: string; item_display_name: string }, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = `${item.item_display_name} ${item.item_name}`.toLowerCase();
  return terms.every((term) => haystack.includes(term.toLowerCase()));
}

/**
 * 매물 검색. 검색어가 있으면 keyword-search, 없으면 카테고리 전체 목록을 본다.
 * 커서 기반이라 한 번에 최대 500건씩 이어 받는다.
 */
export function useAuctionItemsQuery(input: AuctionSearchInput, enabled: boolean) {
  const keyword = input.keyword.trim();
  const category = input.category.trim();

  return useInfiniteQuery({
    queryKey: ['auction', 'items', category, keyword],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      keyword
        ? fetchAuctionKeywordSearch({ keyword, cursor: pageParam }, signal)
        : fetchAuctionList({ category, cursor: pageParam }, signal),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    select: (data) => {
      const loaded = data.pages.flatMap((page) => page.auction_item ?? []) as AuctionItem[];
      // keyword-search 는 auction_item_category 를 받고도 무시한다. 그래서 여기서 거른다.
      const items =
        keyword && category ? loaded.filter((item) => item.auction_item_category === category) : loaded;
      return { items, loadedCount: loaded.length };
    },
    enabled,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}

/**
 * 최근 1시간 거래 내역. 카테고리는 API 가 받아 주지만 검색어는 받지 않으므로
 * 받아온 목록에서 단어로 거른다.
 */
export function useAuctionHistoryQuery(input: AuctionSearchInput, enabled: boolean) {
  const keyword = input.keyword.trim();
  const category = input.category.trim();
  const terms = splitTerms(keyword);

  return useInfiniteQuery({
    queryKey: ['auction', 'history', category, keyword],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      fetchAuctionHistory({ category: category || undefined, cursor: pageParam }, signal),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    select: (data) => {
      const loaded = data.pages.flatMap((page) => page.auction_history ?? []) as AuctionHistoryItem[];
      return { items: loaded.filter((item) => matchesTerms(item, terms)), loadedCount: loaded.length };
    },
    enabled,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}
