import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchAuctionHistory, fetchAuctionKeywordSearch, fetchAuctionList } from './api';
import { normalizeForSearch } from './dictionary';
import { isInitialsOnly, searchKeyOf, splitTerms, toInitials } from './nameIndex';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from './types';

const FIVE_MINUTES = 5 * 60 * 1000;

/** 검색 조건이 실제로 요청을 보낼 만한 상태인지 판단한다. */
export function isAuctionSearchReady(input: AuctionSearchInput): boolean {
  return input.keyword.trim().length > 0 || input.category.trim().length > 0;
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
  // 초성은 필요할 때만 뽑는다. 대부분의 검색어는 초성이 아니다.
  let initials: string | undefined;
  return terms.every((term) => {
    if (!isInitialsOnly(term)) return haystack.includes(term);
    initials ??= toInitials(haystack);
    return initials.includes(term);
  });
}

/** 한 쪽(page)으로 받은 매물. 전체 검색은 여러 keyword-search 를 한꺼번에 받아 합친다. */
interface ItemsPage {
  items: AuctionItem[];
  /** 다음에 이어 받을 커서. 검색어마다 따로 간다. 비면 끝이다. */
  next: StreamCursor[];
}

/** keyword-search 하나의 이어 받을 자리. 카테고리 목록은 keyword 가 비어 있다. */
interface StreamCursor {
  keyword: string;
  cursor: string;
}

/**
 * 매물 검색.
 *
 * 카테고리를 골랐으면 그 카테고리 목록을 받아 이름으로 거른다. 고르지 않았으면
 * 전체를 뒤질 방법이 keyword-search 뿐이라 그것을 쓴다.
 *
 * keyword-search 는 단어 단위로만 맞으므로, 찾기를 누를 때 사전으로 정한 검색어
 * (input.keywords, planKeywordSearch 참고)를 나눠 부르고 합친다. 다음 묶음도 검색어마다
 * 커서를 따로 들고 한꺼번에 받는다. 한 매물이 두 검색어에 다 걸리면 searchKeyOf 로
 * 정한 한쪽에만 남긴다.
 *
 * 카테고리를 고른 채로 keyword-search 를 쓰면 안 된다. 그쪽은 auction_item_category
 * 를 받고도 무시해서 500건이 전 카테고리에서 섞여 오고, 고른 카테고리가 그 안에
 * 거의 남지 않는다.
 */
export function useAuctionItemsQuery(input: AuctionSearchInput, enabled: boolean) {
  const keyword = input.keyword.trim();
  const category = input.category.trim();
  const terms = splitTerms(keyword);
  const keywords = category ? [''] : input.keywords?.length ? input.keywords : [keyword];

  return useInfiniteQuery({
    queryKey: ['auction', 'items', category, keyword, keywords],
    initialPageParam: keywords.map((each): StreamCursor => ({ keyword: each, cursor: '' })),
    queryFn: async ({ pageParam, signal }): Promise<ItemsPage> => {
      const pages = await Promise.all(
        pageParam.map(async (stream) => ({
          stream,
          page: category
            ? await fetchAuctionList({ category, cursor: stream.cursor }, signal)
            : await fetchAuctionKeywordSearch({ keyword: stream.keyword, cursor: stream.cursor }, signal),
        })),
      );
      return {
        items: pages.flatMap(({ stream, page }) =>
          (page.auction_item ?? []).filter((item) => ownedBy(item, stream.keyword, keywords, terms)),
        ),
        next: pages.flatMap(({ stream, page }) =>
          page.next_cursor ? [{ keyword: stream.keyword, cursor: page.next_cursor }] : [],
        ),
      };
    },
    getNextPageParam: (lastPage) => (lastPage.next.length > 0 ? lastPage.next : undefined),
    select: (data) => {
      const loaded = data.pages.flatMap((page) => page.items);
      return { items: loaded.filter((item) => matchesKeyword(item, terms)), loadedCount: loaded.length };
    },
    enabled,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}

/**
 * 여러 검색어로 받은 매물을 합칠 때 이 검색어 몫인지. 검색어가 하나면 늘 그렇다.
 *
 * 이름이 가리키는 검색어가 이번에 보낸 것 가운데 있으면 그쪽 몫이다. 원래 이름을 먼저,
 * 그다음 보이는 이름을 본다. "인챈트 스크롤 - 슬기로운" 은 원래 이름이 "인챈트 스크롤" 이라
 * 보이는 이름에서만 "슬기로운" 이 나온다. 어느 쪽으로도 못 가리면 버리지 않고 남긴다.
 */
function ownedBy(item: AuctionItem, streamKeyword: string, keywords: string[], terms: string[]): boolean {
  if (keywords.length === 1) return true;
  for (const name of [item.item_name, item.item_display_name]) {
    const key = searchKeyOf(name, terms);
    if (key !== null && keywords.includes(key)) return key === streamKeyword;
  }
  return true;
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
