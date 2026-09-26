import { useCallback, useDeferredValue, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  App,
  AutoComplete,
  Button,
  Card,
  Col,
  Flex,
  Grid,
  Input,
  Row,
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
  relicCondition,
  type OptionFilter,
} from '@/features/auction/optionFilter';
import { RELIC_MAX_LEVEL } from '@/features/relics/murias';
import { scanCategoriesFor, useOptionNamesQuery } from '@/features/auction/optionNames';
import { useMarketRecentQuery } from '@/features/market/api';
import { canonicalItemName, useItemCard, usePrefetchItemCards } from '@/features/itemcard/cards';
import { useIconMaps } from '@/features/itemcard/iconMap';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from '@/features/auction/types';
import { formatDateTime, formatGold, formatNumber, formatRemaining } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';
import { useAutoLoadMore } from '@/lib/useAutoLoadMore';
import { useListPagination } from '@/lib/useListPagination';
import { RefreshIcon, SearchIcon } from '@/components/icons';

const { Title, Text } = Typography;

type Tab = 'items' | 'history';

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

/** 주소에 실려 온 검색 조건. 아이템 정보에서 "시세 보기" 로 넘어오는 경로다. */
function readSearchInput(params: URLSearchParams): AuctionSearchInput {
  return {
    category: params.get('category') ?? ALL_CATEGORIES,
    keyword: params.get('keyword') ?? '',
  };
}

/**
 * 주소에 실려 온 무리아스 유물 조건. 유물 시세 화면에서 칸을 누르면 그 옵션과 레벨로 온다.
 * 레벨이 1~10 이 아니면 그쪽 끝은 비워 둔다.
 */
function readOptionFilter(params: URLSearchParams): OptionFilter {
  const name = params.get('relic');
  if (name === null) return EMPTY_OPTION_FILTER;
  const level = (key: string) => {
    const value = Number(params.get(key));
    return Number.isInteger(value) && value >= 1 && value <= RELIC_MAX_LEVEL ? value : null;
  };
  return { conditions: [relicCondition(name, level('relicMin'), level('relicMax'))] };
}

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
function ItemNameCell({ displayName, notes }: { displayName: string; notes?: string[] }) {
  return (
    <Flex vertical gap={2}>
      <Text strong style={{ fontSize: 14 }}>
        {displayName}
      </Text>
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

export function AuctionPage() {
  const canQuery = useCanQuery();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isWide = Boolean(screens.md);

  // 아이템 정보에서 넘어올 때 조건이 주소에 실려 온다. 첫 렌더에서만 읽고 이후에는 화면이 주인이다.
  const [searchParams] = useSearchParams();

  const [initialInput] = useState(() => readSearchInput(searchParams));
  const [form, setForm] = useState<AuctionSearchInput>(initialInput);
  // 주소로 온 조건도 찾기를 누른 것과 같은 길(runSearch)로 보낸다. 아래 효과에서 한 번 부른다.
  const [submitted, setSubmitted] = useState<AuctionSearchInput | null>(null);
  const [tab, setTab] = useState<Tab>('items');
  const [detail, setDetail] = useState<AuctionItemDetail | null>(null);

  const query = submitted ?? EMPTY_INPUT;
  /** 카테고리와 검색어 없이 상세 검색 조건만으로 찾는 중. 조건에 맞을 수 있는 카테고리를 차례로 훑는다. */
  const scanning = (query.scan?.length ?? 0) > 0;
  const enabled = canQuery && submitted !== null && (isAuctionSearchReady(query) || scanning);

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
  const historyQuery = useAuctionHistoryQuery(query, enabled && tab === 'history');

  // 빈 배열을 매 렌더 새로 만들면 아래 통계 useMemo 가 매번 다시 돈다.
  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const history = useMemo(() => historyQuery.data?.items ?? [], [historyQuery.data]);

  /**
   * 세부 옵션 조건. 넥슨 API 는 옵션으로 찾지 못해 불러온 매물을 화면에서 거른다.
   * 찾기를 다시 누르지 않아도 바로 걸리고, 계산은 입력 뒤로 미뤄 타이핑이 밀리지 않게 한다.
   * 맞는 것이 모자라면 아래 자동 불러오기가 다음 묶음을 더 받는다.
   */
  const [optionFilter, setOptionFilter] = useState<OptionFilter>(() => readOptionFilter(searchParams));
  /** 매물을 불러오기 전에도 상세 검색 자동완성이 비지 않게 하는 게임 데이터의 세공, 인챈트 이름. */
  const optionNames = useOptionNamesQuery().data;
  const deferredFilter = useDeferredValue(optionFilter);
  const filtering = activeConditionCount(deferredFilter) > 0;
  /** 조건으로 고를 수 있는 옵션. 지금 보고 있는 탭의 불러온 매물에서 뽑는다. */
  const optionCatalog = useMemo(
    () => buildOptionCatalog(tab === 'items' ? items : history),
    [tab, items, history],
  );
  const visibleItems = useMemo(
    () => (filtering ? items.filter((item) => matchesOptionFilter(item, deferredFilter)) : items),
    [filtering, items, deferredFilter],
  );
  const visibleHistory = useMemo(
    () =>
      filtering ? history.filter((item) => matchesOptionFilter(item, deferredFilter)) : history,
    [filtering, history, deferredFilter],
  );
  /** 조건이 바뀌면 옛 쪽 번호는 뜻이 없다. 찾기를 새로 한 것처럼 첫 쪽으로 돌아간다. */
  const pagingKey = useMemo(
    () => `${JSON.stringify(submitted)}|${JSON.stringify(deferredFilter)}`,
    [submitted, deferredFilter],
  );
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

  // 목록은 쪽으로 나눠 보여 준다. 새로 찾으면 첫 쪽으로 돌아간다.
  // 카드는 위에서 불러온 줄 전체를 한꺼번에 받아 두므로 쪽을 넘겨도 다시 묻지 않는다.
  const itemsPaging = useListPagination(pagingKey);
  const historyPaging = useListPagination(pagingKey);

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

  /**
   * 자동완성은 전체 이름 인덱스 한 파일로 한다. 카테고리를 골랐으면 그 안에서만 고른다.
   *
   * 목록 계산은 useDeferredValue 로 입력칸 뒤로 미룬다. 고정 지연(디바운스)과 달리
   * 기다리는 시간이 없고, 입력칸이 늘 먼저 그려진다. 계산 자체는 받을 때 전처리를
   * 끝내 두어서 15,000개를 훑어도 1ms 안쪽이다.
   */
  const nameIndexQuery = useItemNameIndexQuery();
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
  const [resolving, setResolving] = useState(() => isAuctionSearchReady(initialInput));
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
   * 검색을 보낸다. 보내기 전에 사전으로 검색어를 다듬는다.
   *
   * 넥슨 검색은 단어 단위로만 맞아서 "꿀우유" 로는 "향기로운 꿀 우유" 가, "우유" 로는
   * "딸기우유" 가 안 걸린다. 사전에서 걸리는 이름을 모두 찾아 넥슨이 알아듣는 검색어로
   * 나눠 보낸다(resolveSearch). 초성은 사전의 이름으로 바꾸고 입력칸에도 보여 준다.
   *
   * 검색어가 있는데 사전을 아직 받는 중이면 다 받을 때까지 기다린다. 사전 없이 보내면
   * "꿀우유" 가 그대로 넘어가 0건이 된다. 사전은 700KB 남짓이라 첫 검색에서 흔히 겹친다.
   */
  async function runSearch(next: AuctionSearchInput) {
    // 장비나 유물 카테고리에 상세 검색 조건을 넣고 찾으면 모아 둔 매물에서 찾는다. 이름을 넣었으면 이름으로 찾는다.
    if (
      activeConditionCount(optionFilter) > 0 &&
      !next.keyword.trim() &&
      isSnapshotCategory(next.category) &&
      canUseSnapshot()
    ) {
      setResolving(false);
      setSubmitted({ category: next.category, keyword: '', scan: [next.category] });
      return;
    }
    if (!isAuctionSearchReady(next)) {
      setResolving(false);
      // 카테고리도 검색어도 없지만 상세 검색 조건이 있으면, 조건에 맞을 수 있는 카테고리를 훑는다.
      if (activeConditionCount(optionFilter) > 0) {
        const scan = scanCategoriesFor(optionFilter, optionNames);
        if (scan.length === 0) {
          message.warning('넣은 조건을 모두 채울 수 있는 아이템이 없습니다. 세공과 유물 조건을 다시 확인해 주세요.');
          return;
        }
        setSubmitted({ category: ALL_CATEGORIES, keyword: '', scan });
      }
      return;
    }

    let index = nameIndexQuery.data;
    if (index === undefined && next.keyword.trim()) {
      setResolving(true);
      index = await queryClient.ensureQueryData(itemNameIndexQueryOptions).catch(() => null);
    }
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
    setSubmitted(resolved);
  }

  useEffect(() => {
    void runSearch(initialInput);
    // 첫 렌더에서 한 번만 부른다. 이후에는 화면이 주인이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 카테고리를 고르는 것 자체가 둘러보기 행동이라 바로 조회한다. */
  function selectCategory(category: string) {
    const next = { ...form, category };
    setForm(next);
    if (isAuctionSearchReady(next)) void runSearch(next);
  }

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
  const categoryPanel = isWide ? (
    <Card variant="outlined" size="small" title="카테고리">
      <CategoryPicker value={form.category} onChange={selectCategory} />
    </Card>
  ) : (
    <CategoryPicker value={form.category} onChange={selectCategory} />
  );

  // 제네릭을 직접 적는다. useMemo 안에서는 배열 리터럴이 문맥 타입을 잃어
  // align: 'right' 같은 값이 string 으로 넓어진다.
  /**
   * 열은 그림, 이름, 수량, 가격, 남은 시간 다섯뿐이다. 카테고리와 옵션은 표에서 뺐다.
   * 옵션은 줄을 누르면 뜨는 상세 창에 전부 있다. 표는 훑어보는 자리라 칸이 적을수록 읽힌다.
   */
  const itemColumns = useMemo<TableColumnsType<AuctionItem>>(() => [
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
          notes={filtering ? describeMatch(record, deferredFilter) : undefined}
        />
      ),
    },
    {
      title: '수량',
      dataIndex: 'item_count',
      width: 80,
      align: 'right',
      sorter: (a, b) => a.item_count - b.item_count,
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
      dataIndex: 'auction_price_per_unit',
      width: 170,
      align: 'right',
      defaultSortOrder: 'ascend',
      // 매물끼리 견주는 기준은 개당 가격이다. 묶음 크기가 달라도 이쪽이 비교가 된다.
      sorter: (a, b) => a.auction_price_per_unit - b.auction_price_per_unit,
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} count={record.item_count} />
      ),
    },
    {
      title: '남은 시간',
      dataIndex: 'date_auction_expire',
      width: 160,
      sorter: (a, b) => Date.parse(a.date_auction_expire) - Date.parse(b.date_auction_expire),
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
  ], [recentByName, filtering, deferredFilter]);

  /** 열 정의는 렌더마다 새로 만들 이유가 없다. 아래 패널 메모의 의존성이기도 하다. */
  const historyColumns = useMemo<TableColumnsType<AuctionHistoryItem>>(() => [
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
          notes={filtering ? describeMatch(record, deferredFilter) : undefined}
        />
      ),
    },
    {
      title: '수량',
      dataIndex: 'item_count',
      width: 80,
      align: 'right',
      sorter: (a, b) => a.item_count - b.item_count,
      render: (value: number) => <span className="tnum">{formatNumber(value)}</span>,
    },
    {
      title: '가격',
      dataIndex: 'auction_price_per_unit',
      width: 170,
      align: 'right',
      sorter: (a, b) => a.auction_price_per_unit - b.auction_price_per_unit,
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} count={record.item_count} />
      ),
    },
    {
      title: '거래 시각',
      dataIndex: 'date_auction_buy',
      width: 170,
      defaultSortOrder: 'descend',
      sorter: (a, b) => Date.parse(a.date_auction_buy) - Date.parse(b.date_auction_buy),
      render: (value: string) => <span className="tnum">{formatDateTime(value)}</span>,
    },
  ], [filtering, deferredFilter]);

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
            scroll={{ x: 640 }}
            sticky
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
  ), [enabled, itemColumns, visibleItems, itemsLoaded, itemsMore, itemsPaging.pagination, itemsQuery, recent, rowInteraction, singleItem]);

  const historyPanel = useMemo(() => (
    <QueryState
      isLoading={historyQuery.isPending && enabled}
      error={historyQuery.error}
      isEmpty={visibleHistory.length === 0}
      emptyMessage={
        historyLoaded > 0
          ? historyQuery.hasNextPage && !historyMore.paused
            ? `최근 1시간 거래 ${formatNumber(historyLoaded)}건 중 조건에 맞는 것이 아직 없어 더 찾고 있습니다.`
            : `최근 1시간 거래 ${formatNumber(historyLoaded)}건 중 조건에 맞는 것이 없습니다. 검색어를 줄여 보세요.`
          : '최근 1시간 안에 거래된 내역이 없습니다.'
      }
    >
      <Flex vertical gap={12}>
        {visibleHistory.length !== historyLoaded ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            최근 1시간 거래 {formatNumber(historyLoaded)}건 가운데 {formatNumber(visibleHistory.length)}건이 조건과
            맞습니다.
          </Text>
        ) : null}
        <Table<AuctionHistoryItem>
          columns={historyColumns}
          dataSource={visibleHistory}
          onRow={(record) =>
            rowInteraction(() => ({
              displayName: record.item_display_name,
              rawName: record.item_name,
              category: record.auction_item_category,
              count: record.item_count,
              pricePerUnit: record.auction_price_per_unit,
              options: record.item_option,
              timeLabel: '거래 시각',
              timeValue: record.date_auction_buy,
              showRemaining: false,
            }))
          }
          rowKey={(record) => record.auction_buy_id}
          size="small"
          pagination={historyPaging.pagination}
          scroll={{ x: 640 }}
          sticky
        />
        <LoadMoreStatus
          hasNextPage={historyQuery.hasNextPage}
          isFetching={historyQuery.isFetchingNextPage}
          paused={historyMore.paused}
          onResume={historyMore.resume}
        />
      </Flex>
    </QueryState>
  ), [enabled, visibleHistory, historyColumns, historyLoaded, historyMore, historyPaging.pagination, historyQuery, rowInteraction]);

  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        경매장 조회
      </Title>

      <ApiKeyNotice />

      {/* 좌측 카테고리, 우측 검색과 결과. 768px 미만에서는 위아래 한 단으로 떨어진다. */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8} lg={6}>
          {categoryPanel}
        </Col>

        <Col xs={24} md={16} lg={18}>
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
                      const next = { ...form, keyword };
                      setForm(next);
                      void runSearch(next);
                    }}
                    style={{ flex: '1 1 260px', minWidth: 0 }}
                  >
                    <Input
                      placeholder="아이템명 검색"
                      allowClear
                      onPressEnter={() => void runSearch(form)}
                    />
                  </AutoComplete>

                  <Button
                    type="primary"
                    icon={<SearchIcon />}
                    loading={resolving}
                    disabled={!canSubmit || !canQuery}
                    onClick={() => void runSearch(form)}
                  >
                    찾기
                  </Button>
                  <Button
                    icon={<RefreshIcon />}
                    onClick={() => {
                      setForm(EMPTY_INPUT);
                      setSubmitted(null);
                      setOptionFilter(EMPTY_OPTION_FILTER);
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
            ) : submitted === null ? (
              <Card variant="outlined">
                <EmptyState
                  variant="search"
                  description="왼쪽에서 카테고리를 고르거나, 아이템명이나 상세 검색 조건을 넣은 뒤 찾기를 누르세요."
                />
              </Card>
            ) : (
              <Tabs
                activeKey={tab}
                onChange={(key) => setTab(key as Tab)}
                items={[
                  { key: 'items', label: '판매 중 매물', children: itemsPanel },
                  { key: 'history', label: '최근 1시간 거래 내역', children: historyPanel },
                ]}
              />
            )}
          </Flex>
        </Col>
      </Row>

      <AuctionItemDetailModal detail={detail} onClose={() => setDetail(null)} />
    </Flex>
  );
}
