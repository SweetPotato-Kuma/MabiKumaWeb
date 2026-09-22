import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchAuctionHistory, fetchAuctionKeywordSearch, fetchAuctionList } from './api';
import { normalizeForSearch } from './dictionary';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from './types';

const FIVE_MINUTES = 5 * 60 * 1000;

/** 검색 조건이 실제로 요청을 보낼 만한 상태인지 판단한다. */
export function isAuctionSearchReady(input: AuctionSearchInput): boolean {
  return input.keyword.trim().length > 0 || input.category.trim().length > 0;
}

/** 검색어를 단어로 쪼갠다. 쉼표든 공백이든 구분자로 보고, 띄어쓰기는 지운 채로 비교한다. */
function splitTerms(keyword: string): string[] {
  return keyword
    .split(/[,\s]+/)
    .map((term) => normalizeForSearch(term))
    .filter(Boolean);
}

/**
 * 단어가 이름에 모두 들어 있는지.
 *
 * 띄어쓰기를 지우고 부분 문자열로 본다. 게임 아이템 이름의 띄어쓰기를 외우고 있는
 * 사람은 없다. "숏소드" 로 쳐도 "숏 소드" 가 걸려야 한다.
 */
function matchesKeyword(item: { item_name: string; item_display_name: string }, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = normalizeForSearch(`${item.item_display_name} ${item.item_name}`);
  return terms.every((term) => haystack.includes(term));
}

/**
 * 매물 검색.
 *
 * 카테고리를 골랐으면 그 카테고리 목록을 받아 이름으로 거른다. 고르지 않았으면
 * 전체를 뒤질 방법이 keyword-search 뿐이라 그것을 쓴다.
 *
 * 카테고리를 고른 채로 keyword-search 를 쓰면 안 된다. 그쪽은 auction_item_category
 * 를 받고도 무시해서 500건이 전 카테고리에서 섞여 오고, 고른 카테고리가 그 안에
 * 거의 남지 않는다. 게다가 단어 단위로만 맞아서 이름을 통째로 쳐야 걸린다.
 */
export function useAuctionItemsQuery(input: AuctionSearchInput, enabled: boolean) {
  const keyword = input.keyword.trim();
  const category = input.category.trim();
  const terms = splitTerms(keyword);

  return useInfiniteQuery({
    queryKey: ['auction', 'items', category, keyword],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      category
        ? fetchAuctionList({ category, cursor: pageParam }, signal)
        : fetchAuctionKeywordSearch({ keyword, cursor: pageParam }, signal),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    select: (data) => {
      const loaded = data.pages.flatMap((page) => page.auction_item ?? []) as AuctionItem[];
      return { items: loaded.filter((item) => matchesKeyword(item, terms)), loadedCount: loaded.length };
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
      return { items: loaded.filter((item) => matchesKeyword(item, terms)), loadedCount: loaded.length };
    },
    enabled,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}
