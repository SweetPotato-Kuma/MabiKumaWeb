import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Flex,
  Grid,
  Input,
  Skeleton,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import { ApiKeyNotice } from '@/components/ApiKeyNotice';
import { DetailSearchBar } from '@/components/AuctionOptionFilter';
import { AuctionPriceCell } from '@/components/AuctionPriceCell';
import { AuctionItemDetailModal, type AuctionItemDetail } from '@/components/AuctionItemDetailModal';
import { BrowseLayout } from '@/components/BrowseLayout';
import { CategoryPicker } from '@/components/CategoryPicker';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { NameSuggestionLabel } from '@/components/NameSuggestionLabel';
import { QueryState } from '@/components/QueryState';
import { RecentTradeStats } from '@/components/market/RecentTradeStats';
import { itemInfoPath } from '@/features/auction/dictionary';
import {
  isAuctionSearchReady,
  useAuctionHistoryQuery,
  useAuctionItemsQuery,
  useAuctionScanQuery,
  useAuctionSnapshotQuery,
  useRecentTradesPreview,
  prefetchAuctionSnapshot,
} from '@/features/auction/hooks';
import { canUseSnapshot, isSnapshotCategory, snapshotAgeLabel } from '@/features/auction/snapshot';
import {
  itemNameIndexQueryOptions,
  resolveSearch,
  searchNames,
  useItemNameIndexQuery,
} from '@/features/auction/nameIndex';
import {
  activeConditionCount,
  buildOptionCatalog,
  describeMatch,
  EMPTY_OPTION_FILTER,
  matchesOptionFilter,
  type OptionFilter,
} from '@/features/auction/optionFilter';
import { serializeFilter } from '@/features/auction/filterUrl';
import { matchTier, PARTIAL_TIER, type MatchTier } from '@/features/auction/matchTier';
import {
  readSearchState,
  readViewState,
  searchParamsFor,
  tabParamsFor,
  writeViewState,
  type AuctionSort,
  type AuctionTab,
} from '@/features/auction/searchParams';
import { scanCategoriesFor, useOptionNamesQuery } from '@/features/auction/optionNames';
import { useMarketRecentQuery } from '@/features/market/api';
import { canonicalItemName, useItemCard, usePrefetchItemCards } from '@/features/itemcard/cards';
import { useIconMaps } from '@/features/itemcard/iconMap';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from '@/features/auction/types';
import { headerHeightFor } from '@/app/theme';
import { formatDateTime, formatNumber, formatRemaining } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import { useCanQuery } from '@/lib/settings';
import { useAutoLoadMore } from '@/lib/useAutoLoadMore';
import { useControlledPagination } from '@/lib/useListPagination';
import { RefreshIcon, SearchIcon } from '@/components/icons';

const { Text } = Typography;

/** 표 머리를 눌렀을 때 antd 가 알려 주는 정렬 정보 가운데 쓰는 것만. */
interface SorterLike {
  columnKey?: unknown;
  order?: AuctionSort['order'] | null;
}

/** 카테고리를 고르지 않은 상태. 트리의 '전체' 노드가 이 값을 가리킨다. */
const ALL_CATEGORIES = '';

/**
 * 자동완성에 보여 줄 개수. 드롭다운은 antd 가 보이는 줄만 그리므로(가상 목록)
 * 이보다 늘려도 DOM 은 거의 늘지 않지만, 사람이 훑을 수 있는 것도 이 정도다.
 */
const SUGGESTION_LIMIT = 20;

const EMPTY_INPUT: AuctionSearchInput = {
  category: ALL_CATEGORIES,
  keyword: '',
};

/**
 * 그림 칸 크기. 아이콘은 인벤토리 칸(24px) 단위라 48x48 이 가장 많다. 48 이면 넷 중 셋이
 * 원래 크기 그대로 들어가고, 긴 것(48x96 같은)은 정확히 절반으로 줄어든다.
 */
const AUCTION_ICON_BOX = 48;

/**
 * 그림 열. 카테고리별 그림 목록에서 바로 찾고, 목록을 받지 못했을 때만 카드를 쓴다.
 *
 * 이 칸이 스스로 지켜보는 이유는 표 전체가 메모로 굳어 있어서다. 목록이나 카드가 뒤늦게
 * 도착해도 이 칸만 다시 그려진다.
 */
function ItemIconCell({ rawName, category }: { rawName: string; category: string }) {
  const name = canonicalItemName(rawName);
  const card = useItemCard(category, name);
  return <ItemIcon category={category} name={name} card={card} size={AUCTION_ICON_BOX} />;
}

/**
 * 이름 열은 표시 이름 한 줄이다. 인챈트를 뗀 원래 이름은 줄마다 되풀이되어 목록만 길어졌다.
 * 세부 옵션으로 거르는 중이면 걸린 옵션을 아래에 적는다. 표에는 옵션 칸이 없어 누르지 않고는
 * 왜 걸렸는지 보이지 않는다.
 */
function ItemNameCell({
  displayName,
  notes,
  partial,
}: {
  displayName: string;
  notes?: string[];
  /** 검색어가 이름에 그대로 들어맞지 않고 일부만 걸려 나온 줄. */
  partial?: boolean;
}) {
  return (
    <Flex vertical gap={2}>
      <Flex gap={6} align="center" wrap>
        <Text strong style={{ fontSize: 14 }}>
          {displayName}
        </Text>
        {partial ? <Tag style={{ margin: 0 }}>부분 일치</Tag> : null}
      </Flex>
      {notes?.map((note) => (
        <Text key={note} type="secondary" style={{ fontSize: 12 }}>
          {note}
        </Text>
      ))}
    </Flex>
  );
}

/** 그림 칸 폭. 칸 안쪽 여백까지 더한다. */
const ICON_COLUMN_WIDTH = AUCTION_ICON_BOX + 24;
/** 좁은 화면의 그림 칸. 작은 표의 칸 여백(양쪽 8px)만 더해 이름 칸에 폭을 돌린다. */
const COMPACT_ICON_COLUMN_WIDTH = AUCTION_ICON_BOX + 16;

/**
 * 표 아래 한 줄. 끝쪽에서 다음 묶음을 받는 중인지, 드물게 걸려 멈췄는지 알린다.
 * 더 받을 것이 있어도 조용히 기다리는 중이면 아무것도 적지 않는다.
 */
function LoadMoreStatus({
  hasNextPage,
  isFetching,
  paused,
  onResume,
}: {
  hasNextPage: boolean;
  isFetching: boolean;
  paused: boolean;
  onResume: () => void;
}) {
  if (isFetching) {
    return (
      <Flex align="center" gap={8} role="status">
        <Spin size="small" />
        <Text type="secondary" style={{ fontSize: 12 }}>
          다음 매물을 불러오는 중입니다.
        </Text>
      </Flex>
    );
  }
  if (!hasNextPage) return null;
  if (paused) {
    return (
      <Flex gap={4} wrap align="center">
        <Text type="secondary" style={{ fontSize: 12 }}>
          몇 번 더 받아 봤지만 조건에 맞는 것이 늘지 않아 멈췄습니다.
        </Text>
        <Button type="link" size="small" onClick={onResume}>
          계속 찾기
        </Button>
      </Flex>
    );
  }
  return (
    <Text type="secondary" style={{ fontSize: 12 }}>
      마지막 쪽을 열면 다음 매물을 이어서 불러옵니다.
    </Text>
  );
}

/** 거래 내역 한 줄을 상세 모달이 받는 모양으로. 거래 내역 탭과 첫 화면 미리보기가 같이 쓴다. */
function historyItemDetail(record: AuctionHistoryItem): AuctionItemDetail {
  return {
    displayName: record.item_display_name,
    rawName: record.item_name,
    category: record.auction_item_category,
    count: record.item_count,
    pricePerUnit: record.auction_price_per_unit,
    options: record.item_option,
    timeLabel: '거래 시각',
    timeValue: record.date_auction_buy,
    showRemaining: false,
  };
}

export function AuctionPage() {
  const formatGold = useGoldFormatter();
  const canQuery = useCanQuery();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isWide = Boolean(screens.md);
  // 표 머리는 사이트 헤더 바로 아래에 붙는다. 0 에 붙이면 헤더 밑으로 숨어 보이지 않았다.
  const headerHeight = headerHeightFor(screens);
  const stickyHeader = useMemo(() => ({ offsetHeader: headerHeight }), [headerHeight]);

  /**
   * 검색 조건과 보는 방식은 주소가 주인이다. 찾기, 카테고리 고르기, 탭 바꾸기는 주소를 새로 써서
   * 뒤로 가기로 돌아올 수 있게 하고, 정렬과 쪽 넘기기는 그 자리를 고친다. 검색은 주소의 조건이
   * 바뀔 때 아래 효과가 한다. 그래서 새로고침, 뒤로 가기, 링크 공유가 같은 길을 탄다.
   * 입력칸(form, optionFilter)은 찾기를 누르기 전의 초안이라 주소를 건드리지 않는다.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = useMemo(() => readSearchState(searchParams), [searchParams]);
  const view = useMemo(() => readViewState(searchParams), [searchParams]);
  const { tab, sort, exact } = view;
  const searchKey = JSON.stringify([urlSearch.category, urlSearch.keyword, urlSearch.filterKey]);

  /**
   * 한 번의 조작에서 주소를 두 번 고치면(정렬을 바꾸면 표가 쪽 넘기기도 알린다) 두 번째가 첫 번째를
   * 덮어쓴다. 다음 렌더를 기다리지 않고 방금 쓴 주소에서 이어 가려고 ref 에 들고 있는다.
   */
  const paramsRef = useRef(searchParams);
  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);
  const navigate = useCallback(
    (next: URLSearchParams, replace: boolean) => {
      paramsRef.current = next;
      setSearchParams(next, { replace });
    },
    [setSearchParams],
  );
  const mutateParams = useCallback(
    (change: (params: URLSearchParams) => void, replace: boolean) => {
      const next = new URLSearchParams(paramsRef.current);
      change(next);
      navigate(next, replace);
    },
    [navigate],
  );

  const [form, setForm] = useState<AuctionSearchInput>(() => ({
    category: urlSearch.category,
    keyword: urlSearch.keyword,
  }));
  /** 처음 열 때 주소에 검색이 실려 있었는지. 그랬다면 첫 화면 미리보기가 끼어들지 않는다. */
  const [hadInitialSearch] = useState(
    () => isAuctionSearchReady(urlSearch) || urlSearch.filterKey !== '',
  );
  const [submitted, setSubmitted] = useState<AuctionSearchInput | null>(null);
  const [detail, setDetail] = useState<AuctionItemDetail | null>(null);

  const query = submitted ?? EMPTY_INPUT;
  /** 카테고리와 검색어 없이 상세 검색 조건만으로 찾는 중. 조건에 맞을 수 있는 카테고리를 차례로 훑는다. */
  const scanning = (query.scan?.length ?? 0) > 0;
  const enabled = canQuery && submitted !== null && (isAuctionSearchReady(query) || scanning);

  /**
   * 전체 이름 인덱스 한 파일. 자동완성뿐 아니라 거래 내역 탭이 카테고리 없이 검색어만으로
   * 찾을 때 실제 이름을 골라내는 데도 쓴다(matchingNames, useAuctionHistoryQuery).
   */
  const nameIndexQuery = useItemNameIndexQuery();

  const keywordItemsQuery = useAuctionItemsQuery(query, enabled && !scanning && tab === 'items');
  /**
   * 상세 검색은 워커가 10분마다 모아 둔 장비 매물에서 찾는다. 실시간으로는 카테고리 하나에 몇 초씩
   * 걸린다. 모아 둔 것이 없거나 너무 묵었으면 예전처럼 카테고리를 차례로 불러온다.
   */
  const snapshot = useAuctionSnapshotQuery(query.scan, enabled && scanning && tab === 'items');
  const liveScan = snapshot.status === 'unavailable' || snapshot.status === 'off';
  const scanQuery = useAuctionScanQuery(query.scan, enabled && scanning && liveScan && tab === 'items');
  const itemsQuery = !scanning ? keywordItemsQuery : liveScan ? scanQuery : snapshot;
  const scanProgress = scanning && liveScan ? scanQuery.data : undefined;
  const historyQuery = useAuctionHistoryQuery(query, nameIndexQuery.data, enabled && tab === 'history');

  /**
   * 첫 화면 미리보기(issue #8). 아직 아무것도 찾지 않았을 때만 서버 전체의 최근 거래를 받는다.
   * 거래 내역 탭은 이 목록을 그대로 보여주고, 판매 중 매물 탭은 가장 흔한 카테고리를 아래
   * 효과(autoSelectedRef)에서 한 번 자동으로 골라 채운다.
   */
  const preview = useRecentTradesPreview(canQuery && submitted === null);
  const previewTopCategory = useMemo(() => {
    const trades = preview.data;
    if (!trades || trades.length === 0) return null;
    const counts = new Map<string, number>();
    for (const trade of trades) {
      counts.set(trade.auction_item_category, (counts.get(trade.auction_item_category) ?? 0) + 1);
    }
    let top: string | null = null;
    let max = 0;
    for (const [category, count] of counts) {
      if (count > max) {
        top = category;
        max = count;
      }
    }
    return top;
  }, [preview.data]);

  // 빈 배열을 매 렌더 새로 만들면 아래 통계 useMemo 가 매번 다시 돈다.
  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const history = useMemo(() => historyQuery.data?.items ?? [], [historyQuery.data]);

  /**
   * 세부 옵션 조건. 넥슨 API 는 옵션으로 찾지 못해 불러온 매물을 화면에서 거른다.
   * 찾기를 다시 누르지 않아도 바로 걸리고, 계산은 입력 뒤로 미뤄 타이핑이 밀리지 않게 한다.
   * 맞는 것이 모자라면 아래 자동 불러오기가 다음 묶음을 더 받는다.
   */
  const [optionFilter, setOptionFilter] = useState<OptionFilter>(() => urlSearch.filter);
  /** 매물을 불러오기 전에도 상세 검색 자동완성이 비지 않게 하는 게임 데이터의 세공, 인챈트 이름. */
  const optionNames = useOptionNamesQuery().data;
  const deferredFilter = useDeferredValue(optionFilter);
  const filtering = activeConditionCount(deferredFilter) > 0;
  /** 조건으로 고를 수 있는 옵션. 지금 보고 있는 탭의 불러온 매물에서 뽑는다. */
  const optionCatalog = useMemo(
    () => buildOptionCatalog(tab === 'items' ? items : history),
    [tab, items, history],
  );
  /**
   * 검색어가 이름에 얼마나 바로 들어맞는지(matchTier). 정렬은 늘 이 등급이 먼저고, 그 안에서 열 기준으로 간다.
   * 넥슨은 검색어를 단어로 쪼개 맞춰서 "소울리버레이트 보우" 로 찾으면 "소울 리버레이트 크로스보우" 도 온다.
   * 진짜 이름이 뒤로 밀리지 않게 하고, 정확히 일치만 남기는 것도 이 등급으로 한다.
   */
  const tierKeyword = submitted?.keyword ?? '';
  // 정렬은 같은 줄을 여러 번 견주므로 등급은 줄마다 한 번만 센다. 검색어가 바뀌면 캐시도 새로 만든다.
  const tierOf = useMemo(() => {
    const cache = new WeakMap<object, MatchTier>();
    return (row: { item_name: string }): MatchTier => {
      let tier = cache.get(row);
      if (tier === undefined) {
        tier = matchTier(canonicalItemName(row.item_name), tierKeyword);
        cache.set(row, tier);
      }
      return tier;
    };
  }, [tierKeyword]);
  const exactOnly = exact && tierKeyword.trim() !== '';
  const visibleItems = useMemo(() => {
    const byOption = filtering ? items.filter((item) => matchesOptionFilter(item, deferredFilter)) : items;
    return exactOnly ? byOption.filter((item) => tierOf(item) === 0) : byOption;
  }, [filtering, items, deferredFilter, exactOnly, tierOf]);
  const visibleHistory = useMemo(() => {
    const byOption = filtering ? history.filter((item) => matchesOptionFilter(item, deferredFilter)) : history;
    return exactOnly ? byOption.filter((item) => tierOf(item) === 0) : byOption;
  }, [filtering, history, deferredFilter, exactOnly, tierOf]);
  /**
   * 일부만 걸려 나온 줄에 라벨을 단다. 이름이 그대로 들어맞는 줄이 하나라도 있을 때만 그렇다. 전부 부분
   * 일치라면 구분할 것이 없어 라벨이 줄마다 붙으면 소음이다.
   */
  const itemsHaveClose = useMemo(
    () => tierKeyword.trim() !== '' && visibleItems.some((item) => tierOf(item) < PARTIAL_TIER),
    [tierKeyword, visibleItems, tierOf],
  );
  const historyHaveClose = useMemo(
    () => tierKeyword.trim() !== '' && visibleHistory.some((item) => tierOf(item) < PARTIAL_TIER),
    [tierKeyword, visibleHistory, tierOf],
  );
  const itemIsPartial = useCallback(
    (row: { item_name: string }) => itemsHaveClose && tierOf(row) >= PARTIAL_TIER,
    [itemsHaveClose, tierOf],
  );
  const historyIsPartial = useCallback(
    (row: { item_name: string }) => historyHaveClose && tierOf(row) >= PARTIAL_TIER,
    [historyHaveClose, tierOf],
  );
  /**
   * 열 정렬에 등급을 앞세운다. antd 는 내림차순일 때 비교 결과를 뒤집으므로 그때는 등급도 뒤집어 두어야
   * 결과적으로 등급이 늘 앞이다.
   */
  const tiered = useCallback(
    <T extends { item_name: string }>(compare: (a: T, b: T) => number) =>
      (a: T, b: T, order?: AuctionSort['order'] | null) => {
        const byTier = tierOf(a) - tierOf(b);
        if (byTier !== 0) return order === 'descend' ? -byTier : byTier;
        return compare(a, b);
      },
    [tierOf],
  );
  const draftFilterKey = useMemo(() => serializeFilter(deferredFilter), [deferredFilter]);
  /**
   * 최근 1일 시세. 불러온 매물이 전부 한 아이템이면 위에 요약 칸을 하나 두고, 여러 아이템이 섞이면
   * 줄마다 그 아이템의 1일 중위 가격을 붙인다. 섞인 목록에서 한 줄 요약은 뜻이 없다.
   *
   * 판매 중 매물로 셈하지 않는다. 호가는 팔린 값이 아니고, 한 번에 받는 500건이 전부도 아니다.
   * 이름은 경매장 이름 그대로(@ 포함) 묻는다. 기록도 그 이름으로 쌓인다.
   *
   * 상세 검색 조건에 맞는 줄만 묻는다. 모아 둔 장비 매물은 수만 건이라, 불러온 것을 다 물으면
   * 이름 수천 개가 묶음 수십 번으로 나간다.
   */
  const itemNames = useMemo(
    () => [...new Set(visibleItems.map((item) => item.item_name))],
    [visibleItems],
  );
  const singleItem = itemNames.length === 1 ? visibleItems[0] : undefined;
  const recent = useMarketRecentQuery(itemNames, enabled && tab === 'items' && itemNames.length > 0);
  const recentByName = itemNames.length > 1 ? recent.items : null;

  const itemsLoaded = itemsQuery.data?.loadedCount ?? 0;
  const historyLoaded = historyQuery.data?.loadedCount ?? 0;
  /** 워커가 쌓아 둔 기록으로 찾을 때만 있다. 최근 1시간짜리 라이브 조회에는 없다. */
  const historySince = historyQuery.data?.since ?? null;

  /**
   * 지금 보고 있는 탭의 그림을 준비한다.
   *
   * 그림은 카테고리별 그림 목록에서 찾는다. 목록은 CDN 에서 오고 카테고리마다 한 번이면 되므로,
   * 결과가 오자마자 그림을 한꺼번에 받는다. 카테고리를 고르면 결과를 기다리지 않고 그 목록부터 받는다.
   * 목록을 받지 못한 카테고리만 워커에 카드를 묻는다. 그때도 이름을 모아 한 번에 넘기므로
   * 같은 이름은 한 번만, 이미 아는 것은 아예 묻지 않는다. 보이지 않는 탭은 건드리지 않는다.
   * 시세처럼 상세 검색 조건에 맞는 줄만 본다.
   */
  const cardKeys = useMemo(() => {
    const rows: { item_name: string; auction_item_category: string }[] =
      tab === 'items' ? visibleItems : visibleHistory;
    return rows.map((row) => ({ category: row.auction_item_category, name: canonicalItemName(row.item_name) }));
  }, [tab, visibleItems, visibleHistory]);
  const mapCategories = useMemo(
    () => [form.category, ...cardKeys.map((key) => key.category)],
    [form.category, cardKeys],
  );
  const iconMaps = useIconMaps(mapCategories);
  const lookupKeys = useMemo(
    () => cardKeys.filter((key) => iconMaps.needsLookup(key.category)),
    [cardKeys, iconMaps],
  );
  usePrefetchItemCards(lookupKeys);

  // 목록은 쪽으로 나눠 보여 준다. 쪽 번호와 크기는 주소에 있고, 새로 찾으면 주소에서 빠져 첫 쪽으로 돌아간다.
  // 카드는 위에서 불러온 줄 전체를 한꺼번에 받아 두므로 쪽을 넘겨도 다시 묻지 않는다.
  const changePage = useCallback(
    (page: number, size: number) => mutateParams((params) => writeViewState(params, { page, size }), true),
    [mutateParams],
  );
  const itemsPaging = useControlledPagination({ page: view.page, pageSize: view.size, onChange: changePage });
  const historyPaging = useControlledPagination({ page: view.page, pageSize: view.size, onChange: changePage });

  /**
   * 입력칸의 조건을 고치면 거르는 결과가 바로 바뀌므로 옛 쪽 번호는 뜻이 없다. 찾기를 누르기 전이라
   * 주소의 조건과 달라졌을 때만 첫 쪽으로 돌린다. 뒤로 가기로 조건과 쪽이 함께 바뀔 때는 건드리지 않는다.
   */
  useEffect(() => {
    if (draftFilterKey !== urlSearch.filterKey && view.page > 1) {
      mutateParams((params) => params.delete('page'), true);
    }
    // 입력 중인 조건이 바뀔 때만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFilterKey]);

  /** 표 머리를 눌러 정렬을 바꾼다. 쪽 넘기기는 pagination.onChange 가 맡으므로 여기서는 정렬만 본다. */
  const changeSort = useCallback(
    (_pagination: unknown, _filters: unknown, sorter: SorterLike | SorterLike[], extra: { action: string }) => {
      if (extra.action !== 'sort') return;
      const picked = Array.isArray(sorter) ? sorter[0] : sorter;
      const key = typeof picked?.columnKey === 'string' ? picked.columnKey : '';
      mutateParams((params) => {
        params.delete('page');
        if (key && picked?.order) writeViewState(params, { sort: { key, order: picked.order } });
        else params.delete('sort');
      }, true);
    },
    [mutateParams],
  );

  // 끝쪽에 닿으면 다음 500건을 알아서 받는다. 쪽이 끝없이 이어지는 것처럼 보인다.
  const itemsMore = useAutoLoadMore({
    page: itemsPaging.page,
    pageSize: itemsPaging.pageSize,
    rowCount: visibleItems.length,
    hasNextPage: itemsQuery.hasNextPage,
    isFetching: itemsQuery.isFetching,
    fetchNextPage: itemsQuery.fetchNextPage,
    active: enabled && tab === 'items',
    resetKey: submitted,
  });
  const historyMore = useAutoLoadMore({
    page: historyPaging.page,
    pageSize: historyPaging.pageSize,
    rowCount: visibleHistory.length,
    hasNextPage: historyQuery.hasNextPage,
    isFetching: historyQuery.isFetching,
    fetchNextPage: historyQuery.fetchNextPage,
    active: enabled && tab === 'history',
    resetKey: submitted,
  });

  const queryClient = useQueryClient();

  /**
   * 상세 검색 조건을 넣는 동안 찾을 카테고리의 모아 둔 매물을 미리 받는다. 찾기를 누르면 받아 둔
   * 것으로 바로 거른다. 세공 이름을 치는 중에는 어느 장비인지 몰라 32곳을 다 받게 되므로, 이름이
   * 게임 데이터의 세공과 맞을 때만 받는다. 조건을 다 넣을 때까지 잠깐 기다린다.
   */
  const prefetchCategories = useMemo(() => {
    if (activeConditionCount(deferredFilter) === 0 || form.keyword.trim()) return null;
    const typing = deferredFilter.conditions.some(
      (condition) =>
        condition.kind === 'reforge' &&
        condition.name.trim() !== '' &&
        !optionNames?.reforgeCaps?.[condition.name.trim()],
    );
    if (typing) return null;
    if (form.category) return isSnapshotCategory(form.category) ? [form.category] : null;
    return scanCategoriesFor(deferredFilter, optionNames);
  }, [deferredFilter, form.category, form.keyword, optionNames]);
  useEffect(() => {
    if (!canQuery) return;
    // 조건이 없어도 목록은 받아 둔다. 5KB 남짓이다.
    const categories = prefetchCategories ?? [];
    const timer = setTimeout(() => void prefetchAuctionSnapshot(queryClient, categories), categories.length ? 400 : 0);
    return () => clearTimeout(timer);
  }, [canQuery, prefetchCategories, queryClient]);

  /** 찾기를 눌렀는데 사전을 기다리는 중. 두 번 누르지 않게 버튼을 돌린다. */
  const [resolving, setResolving] = useState(() => isAuctionSearchReady(form));
  const deferredKeyword = useDeferredValue(form.keyword);
  const suggestions = useMemo(
    () =>
      nameIndexQuery.data
        ? searchNames(nameIndexQuery.data, deferredKeyword, { category: form.category, limit: SUGGESTION_LIMIT })
        : [],
    [nameIndexQuery.data, deferredKeyword, form.category],
  );
  const suggestionOptions = useMemo(
    () =>
      suggestions.map((item) => ({
        value: item.name,
        label: <NameSuggestionLabel item={item} showCategory={!form.category} />,
      })),
    [suggestions, form.category],
  );

  // 상세 검색 조건만 있어도 찾을 수 있다. 그때는 카테고리를 차례로 훑는다(runSearch).
  const canSubmit = isAuctionSearchReady(form) || activeConditionCount(optionFilter) > 0;

  /**
   * 줄 전체를 눌러 상세를 연다.
   *
   * 마우스만 되는 게 아니라 키보드로도 닿아야 한다. 표의 줄은 원래 초점을 받지 못하므로
   * tabIndex 를 주고 Enter 와 Space 를 같이 받는다. 옵션은 표에 열이 없고 이 창에서 본다.
   */
  const rowInteraction = useCallback((build: () => AuctionItemDetail) => {
    return {
      tabIndex: 0,
      style: { cursor: 'pointer' },
      onClick: () => setDetail(build()),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setDetail(build());
      },
    };
  }, []);

  /**
   * 주소의 검색 조건으로 실제 검색을 건다. 보내기 전에 사전으로 검색어를 다듬는다.
   *
   * 넥슨 검색은 단어 단위로만 맞아서 "꿀우유" 로는 "향기로운 꿀 우유" 가, "우유" 로는
   * "딸기우유" 가 안 걸린다. 사전에서 걸리는 이름을 모두 찾아 넥슨이 알아듣는 검색어로
   * 나눠 보낸다(resolveSearch). 초성은 사전의 이름으로 바꾸고 입력칸과 주소에도 그 이름을 적는다.
   *
   * 검색어가 있는데 사전을 아직 받는 중이면 다 받을 때까지 기다린다. 사전 없이 보내면
   * "꿀우유" 가 그대로 넘어가 0건이 된다. 사전은 700KB 남짓이라 첫 검색에서 흔히 겹친다.
   * 기다리는 사이 주소가 또 바뀌었으면 옛 검색은 버린다(searchRun).
   */
  const searchRun = useRef(0);
  async function runSearch(next: AuctionSearchInput, filter: OptionFilter) {
    const run = ++searchRun.current;
    const filtering = activeConditionCount(filter) > 0;

    // 장비나 유물 카테고리에 상세 검색 조건을 넣고 찾으면 모아 둔 매물에서 찾는다. 이름을 넣었으면 이름으로 찾는다.
    if (filtering && !next.keyword.trim() && isSnapshotCategory(next.category) && canUseSnapshot()) {
      setResolving(false);
      setSubmitted({ category: next.category, keyword: '', scan: [next.category] });
      return;
    }
    if (!isAuctionSearchReady(next)) {
      setResolving(false);
      // 카테고리도 검색어도 없지만 상세 검색 조건이 있으면, 조건에 맞을 수 있는 카테고리를 훑는다.
      if (filtering) {
        const scan = scanCategoriesFor(filter, optionNames);
        if (scan.length === 0) {
          message.warning('넣은 조건을 모두 채울 수 있는 아이템이 없습니다. 세공과 유물 조건을 다시 확인해 주세요.');
          return;
        }
        setSubmitted({ category: ALL_CATEGORIES, keyword: '', scan });
        return;
      }
      // 주소에 검색이 없다. 아무것도 찾지 않은 첫 화면이다.
      setSubmitted(null);
      return;
    }

    let index = nameIndexQuery.data;
    if (index === undefined && next.keyword.trim()) {
      setResolving(true);
      index = await queryClient.ensureQueryData(itemNameIndexQueryOptions).catch(() => null);
    }
    if (run !== searchRun.current) return;
    setResolving(false);

    const resolved = resolveSearch(index, next);
    if (!resolved) {
      message.warning('초성으로 찾을 이름이 없습니다. 이름 일부를 입력하거나 카테고리를 먼저 골라 주세요.');
      return;
    }

    setForm((prev) =>
      resolved.keyword !== prev.keyword || resolved.category !== prev.category
        ? { keyword: resolved.keyword, category: resolved.category }
        : prev,
    );
    // 다듬은 검색어(초성을 이름으로 바꾼 것)를 주소에도 적는다. 공유한 링크가 같은 결과를 보게 한다.
    if (resolved.keyword !== next.keyword) {
      mutateParams((params) => {
        if (resolved.keyword) params.set('keyword', resolved.keyword);
        else params.delete('keyword');
      }, true);
    }
    // 같은 조건이면 그대로 둔다. 새 객체가 되면 끝쪽 자동 불러오기가 처음부터 다시 센다.
    setSubmitted((prev) => (prev && JSON.stringify(prev) === JSON.stringify(resolved) ? prev : resolved));
  }

  /** 주소의 검색 조건이 바뀔 때(찾기, 뒤로 가기, 새로고침, 다른 화면에서 온 링크)마다 입력칸을 맞추고 다시 찾는다. */
  useEffect(() => {
    const input = { category: urlSearch.category, keyword: urlSearch.keyword };
    setForm((prev) =>
      prev.category === input.category && prev.keyword.trim() === input.keyword ? prev : input,
    );
    setOptionFilter((prev) => (serializeFilter(prev) === urlSearch.filterKey ? prev : urlSearch.filter));
    void runSearch(input, urlSearch.filter);
    // 주소의 검색 조건이 바뀔 때만 다시 찾는다. 나머지는 그 렌더에서 읽은 값으로 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  /**
   * 찾기. 입력칸의 초안을 주소에 쓴다. 검색은 주소가 바뀌면 위 효과가 한다.
   * 주소가 그대로면(같은 조건으로 다시 누름) 바뀔 것이 없어 아무 일도 하지 않는다.
   */
  function commitSearch(next: AuctionSearchInput, replace = false, options: { exact?: boolean } = {}) {
    const filterKey = serializeFilter(optionFilter);
    if (!isAuctionSearchReady(next) && filterKey === '') return;
    const params = searchParamsFor(paramsRef.current, {
      category: next.category,
      keyword: next.keyword,
      filterKey,
    });
    if (options.exact) writeViewState(params, { exact: true });
    navigate(params, replace);
  }

  /** 카테고리를 고르는 것 자체가 둘러보기 행동이라 바로 조회한다. */
  function selectCategory(category: string, replace = false) {
    const next = { ...form, category };
    setForm(next);
    if (isAuctionSearchReady(next)) commitSearch(next, replace);
  }

  /**
   * 첫 화면 미리보기(issue #8). 아직 아무것도 찾지 않았으면(주소로 온 조건도 없으면) 최근 거래에서
   * 가장 흔한 카테고리를 한 번만 골라 판매 중 매물 탭을 채운다. "검색 초기화"로 되돌아갔을 때
   * 다시 끼어들지 않게 한 번 하고 나면 다시 하지 않는다(autoSelectedRef).
   */
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (submitted !== null || hadInitialSearch) {
      autoSelectedRef.current = true;
      return;
    }
    if (!previewTopCategory) return;
    autoSelectedRef.current = true;
    // 첫 화면을 채우는 것이지 사용자가 고른 검색이 아니라서 뒤로 가기 단계로 남기지 않는다.
    selectCategory(previewTopCategory, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewTopCategory, submitted]);

  /**
   * 트리는 CategoryPicker 하나만 쓴다.
   *
   * 여기에 같은 트리를 따로 들고 있던 탓에 아이템 정보 화면에서 고친 것(묶음을 눌러 펼치기)이
   * 경매장에는 반영되지 않았다. 화면마다 복사본을 두면 이런 차이가 조용히 생긴다.
   *
   * 카드 높이는 트리에 맡기고 스크롤은 페이지 하나로 둔다. 창 높이에서 고정값을 빼 카드 안에
   * 스크롤을 두었더니, 그 값이 카드 바깥 높이와 어긋나 트리를 펼치면 카드와 페이지가 함께
   * 스크롤됐다. 1px 만 넘쳐도 페이지 스크롤바가 떠서 화면이 흔들려 보였다.
   */
  const categoryPanel = <CategoryPicker value={form.category} onChange={selectCategory} />;

  /** 주소의 정렬을 열에 건다. 표는 스스로 정렬 상태를 두지 않고 주소가 가리키는 대로 그린다. */
  const sortOrderOf = useCallback(
    (key: string): AuctionSort['order'] | null => (sort.key === key ? sort.order : null),
    [sort],
  );

  // 제네릭을 직접 적는다. useMemo 안에서는 배열 리터럴이 문맥 타입을 잃어
  // align: 'right' 같은 값이 string 으로 넓어진다.
  /**
   * 열은 그림, 이름, 수량, 가격, 남은 시간 다섯뿐이다. 카테고리와 옵션은 표에서 뺐다.
   * 옵션은 줄을 누르면 뜨는 상세 창에 전부 있다. 표는 훑어보는 자리라 칸이 적을수록 읽힌다.
   */
  const itemColumns = useMemo<TableColumnsType<AuctionItem>>(() => isWide ? [
    {
      title: '',
      key: 'icon',
      width: ICON_COLUMN_WIDTH,
      render: (_value, record) => <ItemIconCell rawName={record.item_name} category={record.auction_item_category} />,
    },
    {
      title: '이름',
      dataIndex: 'item_display_name',
      render: (_value, record) => (
        <ItemNameCell
          displayName={record.item_display_name}
          partial={itemIsPartial(record)}
          notes={filtering ? describeMatch(record, deferredFilter) : undefined}
        />
      ),
    },
    {
      title: '수량',
      key: 'count',
      dataIndex: 'item_count',
      width: 80,
      align: 'right',
      sorter: tiered<AuctionItem>((a, b) => a.item_count - b.item_count),
      sortOrder: sortOrderOf('count'),
      render: (value: number) => <span className="tnum">{formatNumber(value)}</span>,
    },
    // 여러 아이템이 섞인 목록에서만. 호가 옆에 최근에 실제로 팔린 값을 두어 비싼지 싼지 바로 보이게 한다.
    ...(recentByName
      ? [
          {
            title: '1일 중위',
            key: 'recent',
            width: 120,
            align: 'right' as const,
            render: (_value: unknown, record: AuctionItem) => {
              const summary = recentByName[record.item_name];
              return summary ? (
                <span className="tnum">{formatGold(summary.mid)}</span>
              ) : (
                <Text type="secondary">-</Text>
              );
            },
          },
        ]
      : []),
    {
      title: '가격',
      key: 'price',
      dataIndex: 'auction_price_per_unit',
      width: 170,
      align: 'right',
      sortOrder: sortOrderOf('price'),
      // 매물끼리 견주는 기준은 개당 가격이다. 묶음 크기가 달라도 이쪽이 비교가 된다.
      sorter: tiered<AuctionItem>((a, b) => a.auction_price_per_unit - b.auction_price_per_unit),
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} count={record.item_count} />
      ),
    },
    {
      title: '남은 시간',
      key: 'expire',
      dataIndex: 'date_auction_expire',
      width: 160,
      sortOrder: sortOrderOf('expire'),
      sorter: tiered<AuctionItem>((a, b) => Date.parse(a.date_auction_expire) - Date.parse(b.date_auction_expire)),
      render: (value: string) => (
        <Flex vertical gap={0}>
          <Text className="tnum" style={{ fontSize: 14 }}>
            {formatRemaining(value)}
          </Text>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {formatDateTime(value)}
          </Text>
        </Flex>
      ),
    },
  ] : [
    // 768px 미만. 다섯 칸을 가로로 밀면 이름 칸이 한 글자 폭으로 눌렸다. 그림, 이름, 가격 세 칸만
    // 두고 수량과 남은 시간, 1일 중위는 이름 아래에 적는다. 가로 스크롤 없이 한 화면에 든다.
    {
      title: '',
      key: 'icon',
      width: COMPACT_ICON_COLUMN_WIDTH,
      render: (_value, record) => <ItemIconCell rawName={record.item_name} category={record.auction_item_category} />,
    },
    {
      title: '이름',
      dataIndex: 'item_display_name',
      render: (_value, record) => {
        const summary = recentByName?.[record.item_name];
        const remaining = formatRemaining(record.date_auction_expire);
        return (
          <ItemNameCell
            displayName={record.item_display_name}
            partial={itemIsPartial(record)}
            notes={[
              `${formatNumber(record.item_count)}개, ${remaining === '만료' ? remaining : `${remaining} 남음`}`,
              ...(summary ? [`1일 중위 ${formatGold(summary.mid)}`] : []),
              ...(filtering ? describeMatch(record, deferredFilter) : []),
            ]}
          />
        );
      },
    },
    {
      title: '가격',
      key: 'price',
      dataIndex: 'auction_price_per_unit',
      align: 'right',
      sortOrder: sortOrderOf('price'),
      sorter: tiered<AuctionItem>((a, b) => a.auction_price_per_unit - b.auction_price_per_unit),
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} count={record.item_count} />
      ),
    },
  ], [isWide, recentByName, filtering, deferredFilter, sortOrderOf, tiered, itemIsPartial, formatGold]);

  /** 열 정의는 렌더마다 새로 만들 이유가 없다. 아래 패널 메모의 의존성이기도 하다. */
  const historyColumns = useMemo<TableColumnsType<AuctionHistoryItem>>(() => isWide ? [
    {
      title: '',
      key: 'icon',
      width: ICON_COLUMN_WIDTH,
      render: (_value, record) => <ItemIconCell rawName={record.item_name} category={record.auction_item_category} />,
    },
    {
      title: '이름',
      dataIndex: 'item_display_name',
      render: (_value, record) => (
        <ItemNameCell
          displayName={record.item_display_name}
          partial={historyIsPartial(record)}
          notes={filtering ? describeMatch(record, deferredFilter) : undefined}
        />
      ),
    },
    {
      title: '수량',
      key: 'count',
      dataIndex: 'item_count',
      width: 80,
      align: 'right',
      sorter: tiered<AuctionHistoryItem>((a, b) => a.item_count - b.item_count),
      sortOrder: sortOrderOf('count'),
      render: (value: number) => <span className="tnum">{formatNumber(value)}</span>,
    },
    {
      title: '가격',
      key: 'price',
      dataIndex: 'auction_price_per_unit',
      width: 170,
      align: 'right',
      sortOrder: sortOrderOf('price'),
      sorter: tiered<AuctionHistoryItem>((a, b) => a.auction_price_per_unit - b.auction_price_per_unit),
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} count={record.item_count} />
      ),
    },
    {
      title: '거래 시각',
      key: 'time',
      dataIndex: 'date_auction_buy',
      width: 170,
      sortOrder: sortOrderOf('time'),
      sorter: tiered<AuctionHistoryItem>((a, b) => Date.parse(a.date_auction_buy) - Date.parse(b.date_auction_buy)),
      render: (value: string) => <span className="tnum">{formatDateTime(value)}</span>,
    },
  ] : [
    // 768px 미만. 판매 중 매물 표와 같은 까닭으로 세 칸만 둔다.
    {
      title: '',
      key: 'icon',
      width: COMPACT_ICON_COLUMN_WIDTH,
      render: (_value, record) => <ItemIconCell rawName={record.item_name} category={record.auction_item_category} />,
    },
    {
      title: '이름',
      dataIndex: 'item_display_name',
      render: (_value, record) => (
        <ItemNameCell
          displayName={record.item_display_name}
          partial={historyIsPartial(record)}
          notes={[
            `${formatNumber(record.item_count)}개, ${formatDateTime(record.date_auction_buy)}`,
            ...(filtering ? describeMatch(record, deferredFilter) : []),
          ]}
        />
      ),
    },
    {
      title: '가격',
      key: 'price',
      dataIndex: 'auction_price_per_unit',
      align: 'right',
      sortOrder: sortOrderOf('price'),
      sorter: tiered<AuctionHistoryItem>((a, b) => a.auction_price_per_unit - b.auction_price_per_unit),
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} count={record.item_count} />
      ),
    },
  ], [isWide, filtering, deferredFilter, sortOrderOf, tiered, historyIsPartial]);

  /**
   * 결과 영역은 검색어 타이핑과 분리한다.
   *
   * 한 글자 칠 때마다 500줄짜리 표까지 다시 그리면 입력이 밀린다. 패널이 쓰는 값에는
   * form 이 없으므로, 메모해 두면 타이핑 중에는 이 아래가 통째로 멈춰 있는다.
   */
  const itemsPanel = useMemo(() => (
    <Flex vertical gap={16}>
      {singleItem ? (
        <Card
          variant="outlined"
          size="small"
          title="최근 1일 거래"
          extra={
            <Link to={itemInfoPath(singleItem.auction_item_category, canonicalItemName(singleItem.item_name))}>
              한 달 시세 보기
            </Link>
          }
        >
          {recent.isLoading ? (
            <Skeleton active title={false} paragraph={{ rows: 2 }} />
          ) : recent.items[singleItem.item_name] ? (
            <RecentTradeStats summary={recent.items[singleItem.item_name]} label="최근 1일 개당 가격" />
          ) : (
            <Text type="secondary">최근 1일 동안 거래된 기록이 없습니다.</Text>
          )}
        </Card>
      ) : null}

      <QueryState
        isLoading={itemsQuery.isPending && enabled}
        error={itemsQuery.error}
        isEmpty={visibleItems.length === 0}
        emptyMessage={
          itemsLoaded > 0
            ? itemsQuery.hasNextPage && !itemsMore.paused
              ? `불러온 ${formatNumber(itemsLoaded)}건 중 조건에 맞는 것이 아직 없어 더 찾고 있습니다.`
              : `불러온 ${formatNumber(itemsLoaded)}건 중 조건에 맞는 것이 없습니다. 조건을 넓혀 보세요.`
            : '조건에 맞는 매물이 없습니다. 검색어를 줄이거나 카테고리를 바꿔 보세요.'
        }
      >
        <Flex vertical gap={12}>
          <Table<AuctionItem>
            columns={itemColumns}
            dataSource={visibleItems}
            onRow={(record) =>
              rowInteraction(() => ({
                displayName: record.item_display_name,
                rawName: record.item_name,
                category: record.auction_item_category,
                count: record.item_count,
                pricePerUnit: record.auction_price_per_unit,
                options: record.item_option,
                timeLabel: '만료',
                timeValue: record.date_auction_expire,
                showRemaining: true,
              }))
            }
            rowKey={(record, index) => `${record.item_display_name}-${record.date_auction_expire}-${index ?? 0}`}
            size="small"
            pagination={itemsPaging.pagination}
            onChange={changeSort}
            scroll={isWide ? { x: 640 } : undefined}
            sticky={stickyHeader}
          />
          <LoadMoreStatus
            hasNextPage={itemsQuery.hasNextPage}
            isFetching={itemsQuery.isFetchingNextPage}
            paused={itemsMore.paused}
            onResume={itemsMore.resume}
          />
        </Flex>
      </QueryState>
    </Flex>
  ), [enabled, changeSort, itemColumns, visibleItems, itemsLoaded, itemsMore, itemsPaging.pagination, itemsQuery, isWide, recent, rowInteraction, singleItem, stickyHeader]);

  const historyPanel = useMemo(() => (
    <QueryState
      isLoading={historyQuery.isPending && enabled}
      error={historyQuery.error}
      isEmpty={visibleHistory.length === 0}
      emptyMessage={
        historyLoaded > 0
          ? historyQuery.hasNextPage && !historyMore.paused
            ? `거래 ${formatNumber(historyLoaded)}건 중 조건에 맞는 것이 아직 없어 더 찾고 있습니다.`
            : `거래 ${formatNumber(historyLoaded)}건 중 조건에 맞는 것이 없습니다. 검색어를 줄여 보세요.`
          : historySince
            ? `${historySince}부터 거래된 내역이 없습니다.`
            : '최근 1시간 안에 거래된 내역이 없습니다.'
      }
    >
      <Flex vertical gap={12}>
        {historySince ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            거래 기록은 {historySince}부터 모았습니다.
          </Text>
        ) : null}
        {visibleHistory.length !== historyLoaded ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            거래 {formatNumber(historyLoaded)}건 가운데 {formatNumber(visibleHistory.length)}건이 조건과 맞습니다.
          </Text>
        ) : null}
        <Table<AuctionHistoryItem>
          columns={historyColumns}
          dataSource={visibleHistory}
          onRow={(record) => rowInteraction(() => historyItemDetail(record))}
          rowKey={(record) => record.auction_buy_id}
          size="small"
          pagination={historyPaging.pagination}
          onChange={changeSort}
          scroll={isWide ? { x: 640 } : undefined}
          sticky={stickyHeader}
        />
        <LoadMoreStatus
          hasNextPage={historyQuery.hasNextPage}
          isFetching={historyQuery.isFetchingNextPage}
          paused={historyMore.paused}
          onResume={historyMore.resume}
        />
      </Flex>
    </QueryState>
  ), [enabled, changeSort, visibleHistory, historyColumns, historyLoaded, historySince, historyMore, historyPaging.pagination, historyQuery, isWide, rowInteraction, stickyHeader]);

  return (
    <>
      <BrowseLayout
        title="경매장 조회"
        notice={<ApiKeyNotice />}
        sideTitle="카테고리"
        side={categoryPanel}
      >
        <Flex vertical gap={16}>
          <Card variant="outlined" size="small">
            <Flex vertical gap={10}>
              <Flex gap={8} wrap align="center">
                <AutoComplete
                  value={form.keyword}
                  options={suggestionOptions}
                  onChange={(keyword: string) => setForm((prev) => ({ ...prev, keyword }))}
                  onSelect={(keyword: string) => {
                    // 카테고리를 좁히는 판단은 runSearch 가 사전으로 한 곳에서 한다.
                    // 자동완성에서 고른 것은 그 아이템을 찾겠다는 뜻이라 이름이 정확히 같은 것만 보인다.
                    const next = { ...form, keyword };
                    setForm(next);
                    commitSearch(next, false, { exact: true });
                  }}
                  style={{ flex: '1 1 260px', minWidth: 0 }}
                >
                  <Input
                    placeholder="아이템명 검색"
                    allowClear
                    onPressEnter={() => commitSearch(form)}
                  />
                </AutoComplete>

                <Button
                  type="primary"
                  icon={<SearchIcon />}
                  loading={resolving}
                  disabled={!canSubmit || !canQuery}
                  onClick={() => commitSearch(form)}
                >
                  찾기
                </Button>
                <Checkbox
                  checked={exact}
                  onChange={(event) =>
                    mutateParams((params) => {
                      writeViewState(params, { exact: event.target.checked });
                      params.delete('page');
                    }, true)
                  }
                >
                  정확히 일치
                </Checkbox>
                <Button
                  icon={<RefreshIcon />}
                  onClick={() => {
                    setForm(EMPTY_INPUT);
                    setOptionFilter(EMPTY_OPTION_FILTER);
                    navigate(new URLSearchParams(), false);
                  }}
                >
                  검색 초기화
                </Button>
              </Flex>

              <Flex gap={8} wrap align="center">
                {form.category ? (
                  <Tag closable onClose={() => selectCategory(ALL_CATEGORIES)}>
                    {form.category}
                  </Tag>
                ) : null}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {/*
                    찾는 방식이 둘이라 그대로 알린다. 전체 검색은 사전으로 걸리는 이름을 골라
                    keyword-search 를 나눠 부르고, 카테고리를 고르면 그 목록을 받아 와 이름 일부로 거른다.
                    걸리는 이름이 너무 많으면 다 부르지 못하니 그때만 알린다.
                  */}
                  {/* 모아 둔 매물은 그 사이 팔린 것이 섞일 수 있어 모은 시각을 함께 알린다. */}
                  {scanning && snapshot.status === 'checking'
                    ? '모아 둔 장비 매물을 받는 중입니다.'
                    : scanning && snapshot.status === 'ready' && snapshot.at !== null
                      ? !snapshot.data
                        ? '모아 둔 장비 매물을 받는 중입니다.'
                        : `${snapshotAgeLabel(snapshot.at)} 모아 둔 장비 매물 ${formatNumber(itemsLoaded)}건에서 찾았습니다. 그 사이 팔린 매물이 있을 수 있습니다.`
                      : nameIndexQuery.isPending
                    ? '아이템 이름을 불러오는 중입니다.'
                    : form.category
                      ? `${form.category} 매물에서 이름 일부로 찾습니다.`
                      : submitted?.keywordsTruncated && !submitted.category
                        ? '걸리는 이름이 많아 일부만 찾았습니다. 조금 더 길게 입력하거나 카테고리를 골라 주세요.'
                        : submitted?.scan && !form.category && !form.keyword.trim()
                          ? `상세 검색 조건이 붙을 수 있는 장비 카테고리 ${formatNumber(submitted.scan.length)}곳을 차례로 불러와 거릅니다.${
                              scanProgress
                                ? ` 불러오기 마친 카테고리 ${formatNumber(scanProgress.scanned)}/${formatNumber(scanProgress.total)}곳.`
                                : ''
                            }`
                          : '이름 일부로 찾습니다. 띄어쓰기는 달라도 됩니다. 상세 검색 조건만 넣고 찾아도 됩니다.'}
                </Text>
              </Flex>

              <DetailSearchBar
                value={optionFilter}
                onChange={setOptionFilter}
                catalog={optionCatalog}
                names={optionNames}
                category={form.category}
              />
            </Flex>
          </Card>

          {submitted === null && resolving ? (
            <Card variant="outlined">
              <Skeleton active />
            </Card>
          ) : submitted === null && preview.data && preview.data.length > 0 ? (
            <Card variant="outlined" size="small" title="최근 거래">
              <Flex vertical gap={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  아직 검색하지 않아 서버 전체의 최근 거래를 보여주고 있습니다. 카테고리를 고르거나
                  검색하면 조건에 맞는 결과로 바뀝니다.
                </Text>
                <Table<AuctionHistoryItem>
                  columns={historyColumns}
                  dataSource={preview.data}
                  onRow={(record) => rowInteraction(() => historyItemDetail(record))}
                  rowKey={(record) => record.auction_buy_id}
                  size="small"
                  pagination={false}
                  scroll={isWide ? { x: 640 } : undefined}
                />
              </Flex>
            </Card>
          ) : submitted === null ? (
            <Card variant="outlined">
              <EmptyState
                variant="search"
                description="카테고리를 고르거나, 아이템명이나 상세 검색 조건을 넣은 뒤 찾기를 누르세요."
              />
            </Card>
          ) : (
            <Tabs
              activeKey={tab}
              onChange={(key) => navigate(tabParamsFor(paramsRef.current, key as AuctionTab), false)}
              items={[
                { key: 'items', label: '판매 중 매물', children: itemsPanel },
                { key: 'history', label: '거래 내역', children: historyPanel },
              ]}
            />
          )}
        </Flex>
      </BrowseLayout>

      <AuctionItemDetailModal detail={detail} onClose={() => setDetail(null)} />
    </>
  );
}
