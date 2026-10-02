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
  Drawer,
  Flex,
  Grid,
  Input,
  Segmented,
  Skeleton,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { ApiKeyNotice } from '@/components/ApiKeyNotice';
import { DetailConditionBadges, DetailOptionsPanel } from '@/components/AuctionOptionFilter';
import { hasDetailOptions } from '@/features/auction/optionKinds';
import { AuctionPriceCell } from '@/components/AuctionPriceCell';
import { AuctionItemDetailModal, type AuctionItemDetail } from '@/components/AuctionItemDetailModal';
import { BrowseLayout } from '@/components/BrowseLayout';
import { CategoryBreadcrumb } from '@/components/CategoryBreadcrumb';
import { CategoryPicker } from '@/components/CategoryPicker';
import { SavedSearchControls } from '@/components/SavedSearches';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { NameSuggestionLabel } from '@/components/NameSuggestionLabel';
import { QueryState } from '@/components/QueryState';
import { PopularTrades } from '@/components/market/PopularTrades';
import { RecentTradeStats } from '@/components/market/RecentTradeStats';
import { categoryPath, leavesOfGroupKey } from '@/features/auction/categoryTree';
import { itemInfoPath } from '@/features/auction/dictionary';
import {
  isAuctionSearchReady,
  matchesKeyword,
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
  splitTerms,
  useItemNameIndexQuery,
} from '@/features/auction/nameIndex';
import {
  activeConditionCount,
  buildOptionCatalog,
  describeMatch,
  EMPTY_OPTION_FILTER,
  matchesOptionFilter,
  type MatchNote,
  type OptionFilter,
} from '@/features/auction/optionFilter';
import { serializeFilter } from '@/features/auction/filterUrl';
import { matchTier, PARTIAL_TIER, type MatchTier } from '@/features/auction/matchTier';
import { isSymbolItem, searchesSymbolItems } from '@/features/auction/symbolItems';
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
import { useMarketRecentQuery, useRelicRecentQuery } from '@/features/market/api';
import { isRelicOption, parseRelicOption, relicOptionOf } from '@/features/relics/murias';
import { riskThresholds, rowKeyOf, summarizeMurias } from '@/features/relics/prices';
import { canonicalItemName, useItemCard, usePrefetchItemCards } from '@/features/itemcard/cards';
import { useIconMaps } from '@/features/itemcard/iconMap';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from '@/features/auction/types';
import { headerHeightFor } from '@/app/theme';
import { formatDateTime, formatNumber, formatRemaining } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import { useCanQuery } from '@/lib/settings';
import { useAutoLoadMore } from '@/lib/useAutoLoadMore';
import { useControlledPagination } from '@/lib/useListPagination';
import { useUserSettings } from '@/lib/userSettings';
import { AddIcon, HelpIcon, RefreshIcon, SearchIcon, WarningIcon } from '@/components/icons';

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
  matches,
  partial,
  warning,
}: {
  displayName: string;
  /** 믿기 어려운 값이라는 경고. 이름 옆 아이콘에 올리거나 눌러서 읽는다. */
  warning?: string;
  notes?: string[];
  /** 상세 검색 조건에 걸린 옵션. 조각(배지)으로 보이고, 조건을 채운 조각은 강조한다. */
  matches?: MatchNote[];
  /** 검색어가 이름에 그대로 들어맞지 않고 일부만 걸려 나온 줄. */
  partial?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={2}>
      <Flex gap={6} align="center" wrap>
        <Text strong style={{ fontSize: 14 }}>
          {displayName}
        </Text>
        {partial ? <Tag style={{ margin: 0 }}>부분 일치</Tag> : null}
        {warning ? (
          <Tooltip title={warning} trigger={['hover', 'click']}>
            <Button
              type="text"
              size="small"
              aria-label={warning}
              icon={<WarningIcon style={{ color: token.colorWarning }} />}
              style={{ width: 22, height: 22, minWidth: 22, padding: 0 }}
            />
          </Tooltip>
        ) : null}
      </Flex>
      {notes?.map((note) => (
        <Text key={note} type="secondary" style={{ fontSize: 12 }}>
          {note}
        </Text>
      ))}
      {matches?.map((match) => (
        <Flex key={match.label} gap={4} wrap align="center">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {match.label}
          </Text>
          {match.chips.map((chip, index) => (
            <Tag
              key={`${chip.text}-${index}`}
              color={chip.hit ? 'processing' : undefined}
              // 긴 이름(세공, 인챈트)이 좁은 칸 밖으로 넘치지 않게 줄을 바꾼다.
              style={{ margin: 0, fontWeight: chip.hit ? 600 : 400, whiteSpace: 'normal', maxWidth: '100%' }}
            >
              {chip.text}
            </Tag>
          ))}
        </Flex>
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
  loadAll,
}: {
  hasNextPage: boolean;
  isFetching: boolean;
  paused: boolean;
  onResume: () => void;
  /** 조건으로 거르느라 매물을 모두 받는 중인지. 멈춘 까닭이 다르다. */
  loadAll: boolean;
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
          {loadAll ? '매물이 많아 여기까지만 받았습니다.' : '몇 번 더 받아 봤지만 조건에 맞는 것이 늘지 않아 멈췄습니다.'}
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

/**
 * 개당 가격이 1일 중위가에서 몇 % 벗어났는지. "-52%", "+8%". 중위가를 모르거나 0 이면 없다. 0% 는 적지 않는다.
 */
function medianGap(pricePerUnit: number, median: number): string {
  if (!(median > 0)) return '';
  const percent = Math.round(((pricePerUnit - median) / median) * 100);
  if (percent === 0) return '';
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

/** 1일 중위 열 제목. 무엇을 묶어 계산한 값인지 물음표 위에 올리면 보인다. */
function MedianTitle() {
  return (
    <Flex gap={4} align="center" justify="flex-end">
      1일 중위
      <Tooltip
        title={
          <div style={{ fontSize: 12, maxWidth: 260 }}>
            최근 1일 동안 같은 이름의 아이템이 거래된 개당 가격의 중위값입니다. 인챈트, 세공, 색이 다른 거래도
            이름이 같으면 모두 합쳐 셉니다. 그래서 옵션이 붙은 이 매물과는 값이 다를 수 있습니다.
          </div>
        }
      >
        <span
          tabIndex={0}
          role="img"
          aria-label="1일 중위 집계 기준"
          style={{ display: 'inline-flex', fontSize: 14, cursor: 'help' }}
        >
          <Text type="secondary" style={{ display: 'inline-flex' }}>
            <HelpIcon />
          </Text>
        </span>
      </Tooltip>
    </Flex>
  );
}

/**
 * 심볼·도면·옷본을 숨겼다고 알린다. 숨긴 것이 없으면 아무것도 그리지 않는다. 표시 중일 때는 다시 숨길 수 있다.
 */
function SymbolNotice({
  count,
  showing,
  onToggle,
}: {
  count: number;
  showing: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  return (
    <Flex gap={4} align="center" wrap role="status">
      <Text type="secondary" style={{ fontSize: 12 }}>
        심볼·도면·옷본 {formatNumber(count)}건 {showing ? '표시 중' : '숨김'}
      </Text>
      <Button type="link" size="small" onClick={onToggle}>
        {showing ? '숨기기' : '보기'}
      </Button>
    </Flex>
  );
}

/** 가격 열 정렬 값. 묶음이어도 늘 개당 가격이다. 묶음 전체 값으로는 정렬하지 않는다. */
const priceOf = (row: { auction_price_per_unit: number }) => row.auction_price_per_unit;

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
  // 묶음을 찾을 때는 묶음의 카테고리로 거래를 받고 검색어는 받은 것에서 거른다. 이름으로 따로 부르면 묶음 밖 거래가 섞인다.
  const historyQuery = useAuctionHistoryQuery(
    query,
    scanning && query.keyword.trim() ? null : nameIndexQuery.data,
    enabled && tab === 'history',
  );

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
  // 묶음을 검색어와 함께 찾으면 카테고리를 차례로 불러온 매물에서 이름으로 거른다.
  const scanTerms = useMemo(
    () => (scanning && tierKeyword.trim() ? splitTerms(tierKeyword) : []),
    [scanning, tierKeyword],
  );
  const itemsMatching = useMemo(() => {
    const byKeyword = scanTerms.length > 0 ? items.filter((item) => matchesKeyword(item, scanTerms)) : items;
    const byOption = filtering ? byKeyword.filter((item) => matchesOptionFilter(item, deferredFilter)) : byKeyword;
    return exactOnly ? byOption.filter((item) => tierOf(item) === 0) : byOption;
  }, [filtering, items, scanTerms, deferredFilter, exactOnly, tierOf]);
  const historyMatching = useMemo(() => {
    const byOption = filtering ? history.filter((item) => matchesOptionFilter(item, deferredFilter)) : history;
    return exactOnly ? byOption.filter((item) => tierOf(item) === 0) : byOption;
  }, [filtering, history, deferredFilter, exactOnly, tierOf]);

  /**
   * 심볼, 도면, 옷본 제외(방문자 설정). 결과 위에 몇 건을 숨겼는지 알리고, 누르면 보인다. 새로 찾으면 다시
   * 숨긴다. 검색어가 그 단어를 직접 말하면 숨기지 않는다. 찾는 것을 숨기면 결과가 텅 빈다.
   */
  const [userSettings] = useUserSettings();
  const [showSymbols, setShowSymbols] = useState(false);
  useEffect(() => setShowSymbols(false), [searchKey]);
  const symbolRuleOn = userSettings.hideSymbols && !searchesSymbolItems(tierKeyword);
  const itemsSymbolCount = useMemo(
    () => (symbolRuleOn ? itemsMatching.filter((item) => isSymbolItem(item.item_name)).length : 0),
    [symbolRuleOn, itemsMatching],
  );
  const historySymbolCount = useMemo(
    () => (symbolRuleOn ? historyMatching.filter((item) => isSymbolItem(item.item_name)).length : 0),
    [symbolRuleOn, historyMatching],
  );
  const hideSymbols = symbolRuleOn && !showSymbols;
  const visibleItems = useMemo(
    () => (hideSymbols ? itemsMatching.filter((item) => !isSymbolItem(item.item_name)) : itemsMatching),
    [hideSymbols, itemsMatching],
  );
  const visibleHistory = useMemo(
    () => (hideSymbols ? historyMatching.filter((item) => !isSymbolItem(item.item_name)) : historyMatching),
    [hideSymbols, historyMatching],
  );
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
  /** 묶음(2개 이상) 매물이 있을 때만 가격순 기준을 고르게 한다. 없으면 개당과 전체가 같다. */
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

  /**
   * 무리아스의 유물은 이름이 모두 같고 옵션 문장 하나가 레벨 하나다. 이름으로 시세를 내면 모든 옵션과 레벨이 한 통계에
   * 섞여 뜻이 없다. 유물 줄에는 그 줄의 옵션 문장(레벨)으로 센 시세를 붙인다.
   */
  const hasRelicRows = useMemo(
    () => visibleItems.some((item) => (item.item_option ?? []).some(isRelicOption)),
    [visibleItems],
  );
  const relicRecent = useRelicRecentQuery(enabled && tab === 'items' && hasRelicRows);
  const recentFor = useCallback(
    (record: AuctionItem) => {
      const relic = (record.item_option ?? []).find(isRelicOption);
      if (relic) return relicRecent.data?.items[relic.option_value ?? ''] ?? null;
      return recentByName?.[record.item_name] ?? null;
    },
    [recentByName, relicRecent.data],
  );
  const showRecent = recentByName !== null || hasRelicRows;

  /**
   * 사기 위험. 레벨이 낮은 유물이 같은 옵션의 더 높은 레벨 최저가보다 비싸면 일반 사용자를 속이려는 올림이다.
   * 불러온 모든 유물 매물로 레벨마다 기준을 세운다. 일부만 불러왔으면 더 싼 높은 레벨을 놓칠 수 있어 위험을
   * 덜 잡을 뿐, 없는 위험을 만들지는 않는다.
   */
  const relicRisk = useMemo(() => {
    if (!hasRelicRows) return null;
    const table = new Map<string, (number | null)[]>();
    for (const row of summarizeMurias(items).rows) table.set(row.key, riskThresholds(row.levels));
    return table;
  }, [hasRelicRows, items]);
  const riskOf = useCallback(
    (record: AuctionItem): number | null => {
      if (!relicRisk) return null;
      const relic = relicOptionOf(record);
      if (!relic) return null;
      const threshold = relicRisk.get(rowKeyOf(relic))?.[relic.level - 1] ?? null;
      return threshold !== null && record.auction_price_per_unit > threshold ? threshold : null;
    },
    [relicRisk],
  );
  const riskNote = useCallback(
    (record: AuctionItem) => {
      const threshold = riskOf(record);
      return threshold === null
        ? undefined
        : `(사기 위험) 같은 옵션의 더 높은 레벨 최저가 ${formatGold(threshold)} 보다 비쌉니다.`;
    },
    [riskOf, formatGold],
  );

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

  /**
   * 조건(상세 검색, 카테고리 안의 검색어, 묶음 안의 검색어)으로 거르는 검색은 그 카테고리의 매물을 모두 받아 거른다.
   * 맞는 매물은 어느 묶음에 있을지 모르고, 일부만 보여 주면 결과가 모자란 줄도 모른다.
   * 거르지 않는 둘러보기는 끝쪽에 닿을 때만 다음 500건을 받는다. 쪽이 끝없이 이어지는 것처럼 보인다.
   */
  const loadEverything = filtering || scanTerms.length > 0 || (query.category !== '' && query.keyword.trim() !== '');
  const itemsMore = useAutoLoadMore({
    page: itemsPaging.page,
    pageSize: itemsPaging.pageSize,
    rowCount: visibleItems.length,
    hasNextPage: itemsQuery.hasNextPage,
    isFetching: itemsQuery.isFetching,
    fetchNextPage: itemsQuery.fetchNextPage,
    active: enabled && tab === 'items',
    resetKey: submitted,
    loadAll: loadEverything,
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
    loadAll: loadEverything,
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
    const groupLeaves = leavesOfGroupKey(form.category);
    if (groupLeaves) return groupLeaves.every(isSnapshotCategory) ? [...groupLeaves] : null;
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
    () => {
      if (!nameIndexQuery.data) return [];
      // 묶음은 이름 인덱스에 없는 카테고리다. 전체에서 찾아 묶음에 속한 이름만 남긴다.
      const leaves = leavesOfGroupKey(form.category);
      if (leaves) {
        return searchNames(nameIndexQuery.data, deferredKeyword, { limit: SUGGESTION_LIMIT * 8 })
          .filter((item) => item.categories.some((category) => leaves.includes(category)))
          .slice(0, SUGGESTION_LIMIT);
      }
      return searchNames(nameIndexQuery.data, deferredKeyword, { category: form.category, limit: SUGGESTION_LIMIT });
    },
    [nameIndexQuery.data, deferredKeyword, form.category],
  );
  const suggestionOptions = useMemo(
    () =>
      suggestions.map((item) => ({
        value: item.name,
        label: <NameSuggestionLabel item={item} showCategory={!form.category || leavesOfGroupKey(form.category) !== null} />,
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

    // 묶음(원거리 장비 등)을 찾으면 그 묶음의 카테고리를 차례로 불러온다. 넥슨 API 는 카테고리 하나씩만 준다.
    const groupLeaves = leavesOfGroupKey(next.category);
    if (groupLeaves) {
      setResolving(false);
      setSubmitted({ category: ALL_CATEGORIES, keyword: next.keyword.trim(), scan: [...groupLeaves] });
      return;
    }

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
  function commitSearch(
    next: AuctionSearchInput,
    replace = false,
    options: { exact?: boolean; filter?: OptionFilter } = {},
  ) {
    // 상세 검색 창에서 검색을 누르면 입력칸 상태가 아직 바뀌기 전이라, 창이 고른 조건을 직접 받는다.
    const filterKey = serializeFilter(options.filter ?? optionFilter);
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

  /**
   * 상세 검색은 인게임 경매장처럼 결과 옆에 둔다. 넓은 화면은 왼쪽 카테고리 칸이 카테고리와 상세 옵션 탭을 갖고(결과 칸 폭은
   * 그대로), 좁은 화면은 단추가 아래에서 올라오는 시트를 연다. 고치는 대로 불러온 결과가 바로 걸러진다.
   */
  const [sideTab, setSideTab] = useState<'category' | 'options'>('category');
  const [optionsSheet, setOptionsSheet] = useState(false);
  const optionsAvailable = hasDetailOptions(form.category, optionCatalog, optionFilter);
  const activeOptionCount = activeConditionCount(optionFilter);
  const optionsPanel = (
    <DetailOptionsPanel
      value={optionFilter}
      onChange={setOptionFilter}
      onSearch={(filter) => {
        setOptionFilter(filter);
        setOptionsSheet(false);
        commitSearch(form, false, { filter });
      }}
      catalog={optionCatalog}
      names={optionNames}
      category={form.category}
    />
  );
  const openOptions = () => (isWide ? setSideTab('options') : setOptionsSheet(true));
  const optionsLabel = activeOptionCount > 0 ? `상세 옵션 ${activeOptionCount}` : '상세 옵션';

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
          warning={riskNote(record)}
          matches={filtering ? describeMatch(record, deferredFilter) : undefined}
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
    ...(showRecent
      ? [
          {
            title: <MedianTitle />,
            key: 'recent',
            // 억 단위 금액이 두 줄로 갈라지지 않게 넓히고 줄바꿈을 막는다.
            width: 170,
            align: 'right' as const,
            onCell: () => ({ style: { whiteSpace: 'nowrap' as const } }),
            render: (_value: unknown, record: AuctionItem) => {
              const summary = recentFor(record);
              if (!summary) return <Text type="secondary">-</Text>;
              const gap = medianGap(record.auction_price_per_unit, summary.mid);
              return (
                <Flex vertical gap={0} align="flex-end">
                  <span className="tnum">{formatGold(summary.mid)}</span>
                  {gap ? (
                    <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                      중위 대비 {gap}
                    </Text>
                  ) : null}
                </Flex>
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
      // 가격은 늘 개당 가격이다. 묶음 크기가 달라도 이쪽이 비교가 된다.
      sorter: tiered<AuctionItem>((a, b) => priceOf(a) - priceOf(b)),
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} />
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
        const summary = recentFor(record);
        const remaining = formatRemaining(record.date_auction_expire);
        return (
          <ItemNameCell
            displayName={record.item_display_name}
            partial={itemIsPartial(record)}
            warning={riskNote(record)}
            notes={[
              `${formatNumber(record.item_count)}개, ${remaining === '만료' ? remaining : `${remaining} 남음`}`,
              ...(summary
                ? [
                    `1일 중위 ${formatGold(summary.mid)}${
                      medianGap(record.auction_price_per_unit, summary.mid)
                        ? ` (${medianGap(record.auction_price_per_unit, summary.mid)})`
                        : ''
                    }`,
                  ]
                : []),
            ]}
            matches={filtering ? describeMatch(record, deferredFilter) : undefined}
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
      sorter: tiered<AuctionItem>((a, b) => priceOf(a) - priceOf(b)),
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} />
      ),
    },
  ], [isWide, showRecent, recentFor, riskNote, filtering, deferredFilter, sortOrderOf, tiered, itemIsPartial, formatGold]);

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
          matches={filtering ? describeMatch(record, deferredFilter) : undefined}
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
      sorter: tiered<AuctionHistoryItem>((a, b) => priceOf(a) - priceOf(b)),
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} />
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
          ]}
          matches={filtering ? describeMatch(record, deferredFilter) : undefined}
        />
      ),
    },
    {
      title: '가격',
      key: 'price',
      dataIndex: 'auction_price_per_unit',
      align: 'right',
      sortOrder: sortOrderOf('price'),
      sorter: tiered<AuctionHistoryItem>((a, b) => priceOf(a) - priceOf(b)),
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_value, record) => (
        <AuctionPriceCell pricePerUnit={record.auction_price_per_unit} />
      ),
    },
  ], [isWide, filtering, deferredFilter, sortOrderOf, tiered, historyIsPartial]);

  /**
   * 결과 영역은 검색어 타이핑과 분리한다.
   *
   * 한 글자 칠 때마다 500줄짜리 표까지 다시 그리면 입력이 밀린다. 패널이 쓰는 값에는
   * form 이 없으므로, 메모해 두면 타이핑 중에는 이 아래가 통째로 멈춰 있는다.
   */
  /**
   * 무리아스의 유물을 옵션과 레벨 하나로 좁혀 봤을 때(보이는 줄의 옵션 문장이 하나) 그 레벨의 최근 1일 거래를 위에 보인다.
   * 문장이 여럿이면 줄마다의 시세 칸으로 충분하고, 모든 유물을 한 통계로 묶어 보이지 않는다.
   */
  const relicSummary = useMemo(() => {
    const sentences = new Set<string>();
    for (const item of visibleItems) {
      const option = (item.item_option ?? []).find(isRelicOption);
      if (option?.option_value) sentences.add(option.option_value);
    }
    if (sentences.size !== 1) return null;
    const [sentence] = [...sentences];
    const relic = parseRelicOption(sentence);
    return {
      label: relic ? `${relic.name} ${relic.level}레벨` : sentence,
      summary: relicRecent.data?.items[sentence] ?? null,
    };
  }, [visibleItems, relicRecent.data]);

  const itemsPanel = useMemo(() => (
    <Flex vertical gap={16}>
      <SymbolNotice count={itemsSymbolCount} showing={showSymbols} onToggle={() => setShowSymbols((prev) => !prev)} />
      {singleItem && !(singleItem.item_option ?? []).some(isRelicOption) ? (
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

      {relicSummary ? (
        <Card variant="outlined" size="small" title={`최근 1일 거래, ${relicSummary.label}`}>
          {relicRecent.isLoading ? (
            <Skeleton active title={false} paragraph={{ rows: 2 }} />
          ) : relicSummary.summary ? (
            <RecentTradeStats summary={relicSummary.summary} label="최근 1일 개당 가격" />
          ) : (
            <Text type="secondary">최근 1일 동안 이 레벨이 거래된 기록이 없습니다.</Text>
          )}
        </Card>
      ) : null}

      <QueryState
        isLoading={itemsQuery.isPending && enabled}
        error={itemsQuery.error}
        isEmpty={visibleItems.length === 0}
        emptyMessage={
          itemsQuery.hasNextPage && !itemsMore.paused
            ? '조건에 맞는 매물을 찾는 중입니다.'
            : itemsLoaded > 0
              ? '조건에 맞는 매물이 없습니다. 조건을 넓혀 보세요.'
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
            loadAll={loadEverything}
          />
        </Flex>
      </QueryState>
    </Flex>
  ), [enabled, changeSort, itemColumns, visibleItems, itemsSymbolCount, showSymbols, itemsLoaded, itemsMore, loadEverything, itemsPaging.pagination, relicSummary, relicRecent.isLoading, itemsQuery, isWide, recent, rowInteraction, singleItem, stickyHeader]);

  const historyPanel = useMemo(() => (
    <Flex vertical gap={12}>
      <SymbolNotice count={historySymbolCount} showing={showSymbols} onToggle={() => setShowSymbols((prev) => !prev)} />
    <QueryState
      isLoading={historyQuery.isPending && enabled}
      error={historyQuery.error}
      isEmpty={visibleHistory.length === 0}
      emptyMessage={
        // 내부 조회 한도(몇 건을 받았는지)는 사용자에게 뜻이 없다. 없는 까닭은 대부분 기간이라 기간으로 말하고,
        // 더 긴 기간을 볼 수 있는 아이템 정보의 시세 기록으로 잇는다.
        historyLoaded > 0 && historyQuery.hasNextPage && !historyMore.paused ? (
          '조건에 맞는 거래를 더 찾고 있습니다.'
        ) : (
          <Flex vertical gap={4} align="center">
            <span>
              {historySince ? `${historySince}부터` : '최근 1시간 동안'} 이 조건으로 거래된 기록이 없습니다.
            </span>
            <Link to={singleItem ? itemInfoPath(singleItem.auction_item_category, canonicalItemName(singleItem.item_name)) : '/items'}>
              더 긴 기간의 시세 기록 보기
            </Link>
          </Flex>
        )
      }
    >
      <Flex vertical gap={12}>
        {historySince ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            거래 기록은 {historySince}부터 모았습니다.
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
          loadAll={loadEverything}
        />
      </Flex>
    </QueryState>
    </Flex>
  ), [enabled, changeSort, singleItem, visibleHistory, historySymbolCount, showSymbols, historyColumns, historyLoaded, historySince, historyMore, loadEverything, historyPaging.pagination, historyQuery, isWide, rowInteraction, stickyHeader]);

  /**
   * 검색 카드에 보이는 한 줄 상태. 지금 하는 일이 있을 때만 적고, 평소에는 비운다.
   * 모아 둔 매물은 그 사이 팔린 것이 섞일 수 있어 모은 시각을 함께 알린다. 걸리는 이름이 너무 많으면
   * 다 부르지 못하니 그때도 알린다.
   */
  const scanProgressLabel = scanProgress
    ? ` 불러오기 마친 카테고리 ${formatNumber(scanProgress.scanned)}/${formatNumber(scanProgress.total)}곳.`
    : '';
  const searchStatus =
    scanning && snapshot.status === 'checking'
      ? '모아 둔 장비 매물을 받는 중입니다.'
      : scanning && snapshot.status === 'ready' && snapshot.at !== null
        ? !snapshot.data
          ? '모아 둔 장비 매물을 받는 중입니다.'
          : `${snapshotAgeLabel(snapshot.at)} 모아 둔 장비 매물에서 찾았습니다. 그 사이 팔린 매물이 있을 수 있습니다.`
        : nameIndexQuery.isPending
          ? '아이템 이름을 불러오는 중입니다.'
          : form.category && leavesOfGroupKey(form.category)
            ? `${categoryPath(form.category).at(-1)?.label} 묶음의 카테고리 ${formatNumber(submitted?.scan?.length ?? 0)}곳을 차례로 불러옵니다.${scanProgressLabel}`
            : submitted?.keywordsTruncated && !submitted.category
              ? '걸리는 이름이 많아 일부만 찾았습니다. 조금 더 길게 입력하거나 카테고리를 골라 주세요.'
              : submitted?.scan && !form.category && !form.keyword.trim()
                ? `상세 검색 조건이 붙을 수 있는 장비 카테고리 ${formatNumber(submitted.scan.length)}곳을 차례로 불러와 거릅니다.${scanProgressLabel}`
                : null;

  const keywordInput = (
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
      style={{ flex: '1 1 260px', minWidth: 0, width: isWide ? '100%' : undefined }}
    >
      <Input placeholder="아이템명 검색" allowClear onPressEnter={() => commitSearch(form)} />
    </AutoComplete>
  );
  const searchButton = (
    <Button
      type="primary"
      icon={<SearchIcon />}
      loading={resolving}
      disabled={!canSubmit || !canQuery}
      onClick={() => commitSearch(form)}
    >
      찾기
    </Button>
  );
  // 지금 입력칸의 조건을 저장하고, 저장한 조건으로 바로 검색한다.
  const savedControls = (
    <SavedSearchControls
      current={{ keyword: form.keyword, category: form.category, filterKey: serializeFilter(optionFilter) }}
      onApply={(saved) => navigate(searchParamsFor(paramsRef.current, saved), false)}
    />
  );
  const resetButton = (
    <Button
      icon={<RefreshIcon />}
      aria-label="검색 초기화"
      title="검색 초기화"
      onClick={() => {
        setForm(EMPTY_INPUT);
        setOptionFilter(EMPTY_OPTION_FILTER);
        navigate(new URLSearchParams(), false);
      }}
    />
  );
  const breadcrumb = <CategoryBreadcrumb category={form.category} onSelect={selectCategory} />;
  const exactCheckbox = (
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
  );
  const statusText = searchStatus ? (
    <Text type="secondary" style={{ fontSize: 12 }}>
      {searchStatus}
    </Text>
  ) : null;

  return (
    <>
      <BrowseLayout
        title="경매장 조회"
        notice={<ApiKeyNotice />}
        sideTitle={
          isWide ? (
            <Segmented
              block
              size="small"
              aria-label="왼쪽 칸 보기"
              value={sideTab}
              onChange={setSideTab}
              options={[
                { value: 'category', label: '카테고리' },
                { value: 'options', label: optionsLabel, disabled: !optionsAvailable && sideTab !== 'options' },
              ]}
            />
          ) : (
            '카테고리'
          )
        }
        side={isWide && sideTab === 'options' ? optionsPanel : categoryPanel}
      >
        <Flex vertical gap={16}>
          <PopularTrades
            onSearch={(name) => {
              // 이름만으로 찾고 이름이 같은 것만 보인다. 카테고리까지 걸면 그 카테고리를 통째로 받아야 한다.
              const params = searchParamsFor(paramsRef.current, { category: '', keyword: name, filterKey: '' });
              writeViewState(params, { exact: true });
              navigate(params, false);
            }}
          />
          <Card variant="outlined" size="small">
            <Flex vertical gap={10}>
              {/*
                검색 카드는 두 줄이다(인게임 경매장과 같다): 입력과 단추, 분류 경로와 정확히 일치와 상태.
                상세 검색은 결과 옆(왼쪽 칸의 탭, 좁은 화면은 시트)에서 고치고, 건 조건이 있을 때만 아래에 배지 한 줄이 생긴다.
                넓은 화면에서는 두 줄을 같은 칸 나누기(grid)에 올려 정확히 일치가 늘 찾기 단추 바로 아래에 선다.
                분류 경로나 상태 문구가 길어져도 이 칸은 움직이지 않는다. 좁은 화면에서는 줄바꿈에 맡기고,
                정확히 일치를 분류 경로 앞에 두어 거기서도 제자리를 지킨다.
              */}
              {isWide ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
                    columnGap: 8,
                    rowGap: 10,
                    alignItems: 'center',
                  }}
                >
                  {keywordInput}
                  {searchButton}
                  {savedControls}
                  {resetButton}
                  <Flex gap={12} wrap align="center" style={{ minWidth: 0 }}>
                    <Button
                      size="small"
                      icon={<AddIcon />}
                      type={sideTab === 'options' ? 'primary' : 'default'}
                      disabled={!optionsAvailable}
                      onClick={() => setSideTab('options')}
                    >
                      {optionsLabel}
                    </Button>
                    {breadcrumb}
                    {statusText}
                  </Flex>
                  <div style={{ gridColumn: '2 / -1' }}>{exactCheckbox}</div>
                </div>
              ) : (
                <>
                  <Flex gap={8} wrap align="center">
                    {keywordInput}
                    {searchButton}
                    {savedControls}
                    {resetButton}
                  </Flex>
                  <Flex gap={12} wrap align="center">
                    {exactCheckbox}
                    <Button size="small" icon={<AddIcon />} disabled={!optionsAvailable} onClick={() => setOptionsSheet(true)}>
                      {optionsLabel}
                    </Button>
                    {breadcrumb}
                    {statusText}
                  </Flex>
                </>
              )}

              <DetailConditionBadges value={optionFilter} onChange={setOptionFilter} onOpen={openOptions} />
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

      {/* 좁은 화면의 상세 검색. 아래에서 올라오는 시트이고, 안의 패널은 넓은 화면의 왼쪽 탭과 같다. */}
      <Drawer
        open={optionsSheet && !isWide}
        onClose={() => setOptionsSheet(false)}
        placement="bottom"
        height="85dvh"
        title="상세 옵션"
        destroyOnHidden
      >
        {optionsPanel}
      </Drawer>
      <AuctionItemDetailModal detail={detail} onClose={() => setDetail(null)} />
    </>
  );
}
