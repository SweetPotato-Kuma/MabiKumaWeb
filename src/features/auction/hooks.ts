import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useQueries,
  useQuery,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { fetchAuctionHistory, fetchAuctionKeywordSearch, fetchAuctionList } from './api';
import { normalizeForSearch } from './dictionary';
import { isInitialsOnly, searchKeyOf, splitTerms, toInitials } from './nameIndex';
import { canUseSnapshot, fetchSnapshotFile, fetchSnapshotManifest, snapshotFilesFor } from './snapshot';
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

/** 카테고리를 훑을 때 한 번에 부르는 카테고리 수. 넥슨 API 호출량 제한을 넘지 않게 나눈다. */
const SCAN_BATCH = 4;

interface ScanStream {
  category: string;
  cursor: string;
}

interface ScanPageParam {
  active: ScanStream[];
  pending: string[];
}

interface ScanPage {
  items: AuctionItem[];
  /** 이 묶음에서 끝까지 다 받은 카테고리 수. */
  finished: number;
  next: ScanPageParam | undefined;
}

/**
 * 카테고리를 차례로 불러오는 매물 검색. 카테고리와 검색어 없이 상세 검색 조건만으로 찾을 때 쓴다.
 *
 * 넥슨 경매장 API 는 카테고리나 이름 없이는 매물을 주지 않아서, 조건에 맞을 수 있는 카테고리를
 * (scanCategoriesFor) 몇 곳씩 불러온다. 한 묶음이 쪽 하나다. 카테고리에 500건이 넘게 있으면 다음
 * 묶음에서 이어 받고, 빈자리는 아직 부르지 않은 카테고리로 채운다. 끝쪽에 닿을 때만 다음 묶음을
 * 받으므로(useAutoLoadMore) 맞는 매물이 쪽을 채우면 더 부르지 않는다.
 */
export function useAuctionScanQuery(categories: readonly string[] | undefined, enabled: boolean) {
  const list = categories ?? [];
  return useInfiniteQuery({
    queryKey: ['auction', 'scan', list],
    initialPageParam: {
      active: list.slice(0, SCAN_BATCH).map((category): ScanStream => ({ category, cursor: '' })),
      pending: list.slice(SCAN_BATCH),
    } as ScanPageParam,
    queryFn: async ({ pageParam, signal }): Promise<ScanPage> => {
      const pages = await Promise.all(
        pageParam.active.map(async (stream) => ({
          stream,
          page: await fetchAuctionList({ category: stream.category, cursor: stream.cursor }, signal),
        })),
      );
      const continuing = pages.flatMap(({ stream, page }) =>
        page.next_cursor ? [{ category: stream.category, cursor: page.next_cursor }] : [],
      );
      const room = Math.max(0, SCAN_BATCH - continuing.length);
      const active = [
        ...continuing,
        ...pageParam.pending.slice(0, room).map((category) => ({ category, cursor: '' })),
      ];
      return {
        items: pages.flatMap(({ page }) => page.auction_item ?? []),
        finished: pages.length - continuing.length,
        next: active.length > 0 ? { active, pending: pageParam.pending.slice(room) } : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.next,
    select: (data) => {
      const items = data.pages.flatMap((page) => page.items);
      return {
        items,
        loadedCount: items.length,
        scanned: data.pages.reduce((sum, page) => sum + page.finished, 0),
        total: list.length,
      };
    },
    enabled: enabled && list.length > 0,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}

/**
 * 모아 둔 장비 매물로 찾는 중인지.
 * - off: 쓰지 않는다
 * - checking: 목록을 받는 중
 * - ready: 모아 둔 것으로 찾는다
 * - unavailable: 목록이나 파일이 없거나 너무 묵었다. 화면은 실시간으로 받는다(useAuctionScanQuery)
 */
export type SnapshotStatus = 'off' | 'checking' | 'ready' | 'unavailable';

const NO_MORE = () => Promise.resolve();

const snapshotManifestQuery = {
  queryKey: ['auction', 'snapshot', 'manifest'],
  queryFn: ({ signal }: { signal?: AbortSignal }) => fetchSnapshotManifest(signal),
  staleTime: 60 * 1000,
  retry: false,
} as const;

function snapshotFileQuery(url: string) {
  return {
    queryKey: ['auction', 'snapshot', 'file', url],
    queryFn: ({ signal }: { signal?: AbortSignal }) => fetchSnapshotFile(url, signal),
    // 파일 이름에 모은 시각이 들어 있어 내용이 바뀌지 않는다.
    staleTime: Infinity,
    retry: 1,
  } as const;
}

/**
 * 파일을 다 받았을 때만 하나로 합친다. 받는 대로 보태면 파일이 올 때마다 수만 건을 처음부터 다시
 * 걸러서, 32곳을 찾을 때 거르는 일이 32번 되풀이된다. 모듈 수준 함수라 react-query 가 결과가
 * 바뀔 때만 다시 부른다.
 */
function mergeSnapshotFiles(results: UseQueryResult<AuctionItem[]>[]) {
  const done = results.every((result) => result.data !== undefined);
  return {
    items: done ? results.flatMap((result) => result.data ?? []) : null,
    failed: results.some((result) => result.isError),
  };
}

/**
 * 상세 검색 조건을 넣는 동안 찾을 카테고리 파일을 미리 받아 둔다. 찾기를 누르면 받아 둔 것으로
 * 바로 거른다. 목록도 같이 받는다. 실패는 조용히 넘긴다. 찾기를 누르면 그때 다시 받는다.
 */
export async function prefetchAuctionSnapshot(queryClient: QueryClient, categories: readonly string[]) {
  if (!canUseSnapshot()) return;
  try {
    const manifest = await queryClient.fetchQuery(snapshotManifestQuery);
    const files = snapshotFilesFor(manifest, categories) ?? [];
    await Promise.all(files.map((file) => queryClient.prefetchQuery(snapshotFileQuery(file.url))));
  } catch {
    // 찾기를 누를 때 다시 받는다.
  }
}

/**
 * 워커가 모아 둔 장비 매물(features/auction/snapshot.ts)로 찾는다. 카테고리와 검색어 없이 상세
 * 검색 조건만 넣었거나, 장비 카테고리에 상세 검색 조건을 넣고 찾을 때 쓴다.
 *
 * 카테고리 파일을 한꺼번에 받아 다 오면 한 번에 내놓는다. 더 불러올 것은 없다. 돌려주는 값은
 * useAuctionItemsQuery 와 같은 모양이라 화면은 어느 쪽에서 왔는지 몰라도 된다.
 */
export function useAuctionSnapshotQuery(categories: readonly string[] | undefined, enabled: boolean) {
  const wanted = enabled && canUseSnapshot() && (categories?.length ?? 0) > 0;
  const manifest = useQuery({ ...snapshotManifestQuery, enabled: wanted });
  const files = useMemo(
    () => (manifest.data ? snapshotFilesFor(manifest.data, categories ?? []) : null),
    [manifest.data, categories],
  );
  const merged = useQueries({
    queries: (wanted ? (files ?? []) : []).map((file) => snapshotFileQuery(file.url)),
    combine: mergeSnapshotFiles,
  });

  const status: SnapshotStatus = !wanted
    ? 'off'
    : manifest.isPending
      ? 'checking'
      : manifest.isError || !files || merged.failed
        ? 'unavailable'
        : 'ready';
  /** 가장 묵은 카테고리를 모은 시각. 화면은 이것으로 "N분 전" 을 알린다. */
  const at = files && files.length > 0 ? Math.min(...files.map((file) => file.at)) : null;
  const data = useMemo(
    () =>
      status === 'ready' && merged.items
        ? { items: merged.items, loadedCount: merged.items.length }
        : undefined,
    [status, merged],
  );

  return {
    status,
    at,
    data,
    isPending: status === 'checking' || (status === 'ready' && !data),
    error: null,
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: NO_MORE,
  };
}
