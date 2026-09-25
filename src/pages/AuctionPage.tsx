import { useCallback, useDeferredValue, useMemo, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import { ApiKeyNotice } from '@/components/ApiKeyNotice';
import { AuctionPriceCell } from '@/components/AuctionPriceCell';
import { AuctionItemDetailModal, type AuctionItemDetail } from '@/components/AuctionItemDetailModal';
import { CategoryPicker } from '@/components/CategoryPicker';
import { ItemIcon } from '@/components/ItemIcon';
import { NameSuggestionLabel } from '@/components/NameSuggestionLabel';
import { QueryState } from '@/components/QueryState';
import { isAuctionSearchReady, useAuctionHistoryQuery, useAuctionItemsQuery } from '@/features/auction/hooks';
import { resolveSearch, searchNames, useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { calculatePriceStats } from '@/features/auction/stats';
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

/** 이름 열은 표시 이름 한 줄이다. 인챈트를 뗀 원래 이름은 줄마다 되풀이되어 목록만 길어졌다. */
function ItemNameCell({ displayName }: { displayName: string }) {
  return (
    <Text strong style={{ fontSize: 14 }}>
      {displayName}
    </Text>
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

  const [form, setForm] = useState<AuctionSearchInput>(() => readSearchInput(searchParams));
  const [submitted, setSubmitted] = useState<AuctionSearchInput | null>(() => {
    const initial = readSearchInput(searchParams);
    return isAuctionSearchReady(initial) ? initial : null;
  });
  const [tab, setTab] = useState<Tab>('items');
  const [detail, setDetail] = useState<AuctionItemDetail | null>(null);

  const query = submitted ?? EMPTY_INPUT;
  const enabled = canQuery && submitted !== null && isAuctionSearchReady(query);

  const itemsQuery = useAuctionItemsQuery(query, enabled && tab === 'items');
  const historyQuery = useAuctionHistoryQuery(query, enabled && tab === 'history');

  // 빈 배열을 매 렌더 새로 만들면 아래 통계 useMemo 가 매번 다시 돈다.
  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const history = useMemo(() => historyQuery.data?.items ?? [], [historyQuery.data]);
  const stats = useMemo(() => calculatePriceStats(items), [items]);

  const itemsLoaded = itemsQuery.data?.loadedCount ?? 0;
  const historyLoaded = historyQuery.data?.loadedCount ?? 0;

  /**
   * 지금 보고 있는 탭의 그림을 준비한다.
   *
   * 그림은 카테고리별 그림 목록에서 찾는다. 목록은 CDN 에서 오고 카테고리마다 한 번이면 되므로,
   * 결과가 오자마자 그림을 한꺼번에 받는다. 카테고리를 고르면 결과를 기다리지 않고 그 목록부터 받는다.
   * 목록을 받지 못한 카테고리만 워커에 카드를 묻는다. 그때도 이름을 모아 한 번에 넘기므로
   * 같은 이름은 한 번만, 이미 아는 것은 아예 묻지 않는다. 보이지 않는 탭은 건드리지 않는다.
   */
  const cardKeys = useMemo(() => {
    const rows: { item_name: string; auction_item_category: string }[] = tab === 'items' ? items : history;
    return rows.map((row) => ({ category: row.auction_item_category, name: canonicalItemName(row.item_name) }));
  }, [tab, items, history]);
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
  const itemsPaging = useListPagination(submitted);
  const historyPaging = useListPagination(submitted);

  // 끝쪽에 닿으면 다음 500건을 알아서 받는다. 쪽이 끝없이 이어지는 것처럼 보인다.
  const itemsMore = useAutoLoadMore({
    page: itemsPaging.page,
    pageSize: itemsPaging.pageSize,
    rowCount: items.length,
    hasNextPage: itemsQuery.hasNextPage,
    isFetching: itemsQuery.isFetching,
    fetchNextPage: itemsQuery.fetchNextPage,
    active: enabled && tab === 'items',
    resetKey: submitted,
  });
  const historyMore = useAutoLoadMore({
    page: historyPaging.page,
    pageSize: historyPaging.pageSize,
    rowCount: history.length,
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

  const canSubmit = isAuctionSearchReady(form);

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
   * 자동완성은 초성과 붙여 쓴 이름을 받아 주지만 넥슨 검색은 받지 않는다("ㅅㅅㄷ" 은 400,
   * "숏소드" 는 2건). 사전에서 이름을 찾아 제대로 띄어 쓴 이름으로 바꿔 보내고, 바뀐
   * 검색어는 입력칸에도 그대로 보여 준다. 무엇으로 찾았는지 사용자가 알아야 한다.
   */
  function runSearch(next: AuctionSearchInput) {
    if (!isAuctionSearchReady(next)) return;

    const resolved = resolveSearch(nameIndexQuery.data, next);
    if (!resolved) {
      message.warning('초성으로 찾을 이름이 없습니다. 이름 일부를 입력하거나 카테고리를 먼저 골라 주세요.');
      return;
    }

    const final = { ...next, ...resolved };
    if (final.keyword !== form.keyword || final.category !== form.category) setForm(final);
    setSubmitted(final);
  }

  /** 카테고리를 고르는 것 자체가 둘러보기 행동이라 바로 조회한다. */
  function selectCategory(category: string) {
    const next = { ...form, category };
    setForm(next);
    if (isAuctionSearchReady(next)) runSearch(next);
  }

  /**
   * 트리는 CategoryPicker 하나만 쓴다.
   *
   * 여기에 같은 트리를 따로 들고 있던 탓에 아이템 정보 화면에서 고친 것(묶음을 눌러 펼치기)이
   * 경매장에는 반영되지 않았다. 화면마다 복사본을 두면 이런 차이가 조용히 생긴다.
   */
  const categoryPanel = isWide ? (
    <Card
      variant="outlined"
      size="small"
      title="카테고리"
      styles={{ body: { maxHeight: 'calc(100dvh - 240px)', overflowY: 'auto' } }}
    >
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
      render: (_value, record) => <ItemNameCell displayName={record.item_display_name} />,
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
  ], []);

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
      render: (_value, record) => <ItemNameCell displayName={record.item_display_name} />,
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
  ], []);

  /**
   * 결과 영역은 검색어 타이핑과 분리한다.
   *
   * 한 글자 칠 때마다 500줄짜리 표까지 다시 그리면 입력이 밀린다. 패널이 쓰는 값에는
   * form 이 없으므로, 메모해 두면 타이핑 중에는 이 아래가 통째로 멈춰 있는다.
   */
  const itemsPanel = useMemo(() => (
    <Flex vertical gap={16}>
      {stats ? (
        <Card variant="outlined" size="small">
          <Row gutter={[16, 16]} aria-label="개당 가격 통계">
            {(
              [
                ['매물 수', formatNumber(stats.count)],
                ['최저', formatGold(stats.min)],
                ['중위', formatGold(stats.median)],
                ['평균', formatGold(stats.average)],
                ['최고', formatGold(stats.max)],
              ] as const
            ).map(([label, value]) => (
              // 값은 한 줄로 둔다. 칸이 좁으면 숫자를 쪼개지 않고 칸째 다음 줄로 넘긴다.
              <Col key={label} flex="1 1 auto">
                <Statistic
                  title={label}
                  value={value}
                  styles={{ content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}
                />
              </Col>
            ))}
          </Row>
          <Text type="secondary" style={{ fontSize: 12 }}>
            지금까지 불러온 매물 {formatNumber(stats.count)}건만으로 계산한 값입니다. 뒤쪽으로 넘겨 더 불러오면 값이 바뀝니다.
          </Text>
        </Card>
      ) : null}

      <QueryState
        isLoading={itemsQuery.isPending && enabled}
        error={itemsQuery.error}
        isEmpty={items.length === 0}
        emptyMessage={
          itemsLoaded > 0
            ? itemsQuery.hasNextPage && !itemsMore.paused
              ? `불러온 ${formatNumber(itemsLoaded)}건 중 조건에 맞는 것이 아직 없어 더 찾고 있습니다.`
              : `불러온 ${formatNumber(itemsLoaded)}건 중 조건에 맞는 것이 없습니다. 조건을 넓혀 보세요.`
            : '조건에 맞는 매물이 없습니다. 검색어를 줄이거나 카테고리를 바꿔 보세요.'
        }
      >
        <Flex vertical gap={12}>
          {items.length !== itemsLoaded ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              불러온 {formatNumber(itemsLoaded)}건 가운데 조건에 맞는 {formatNumber(items.length)}건을 보고 있습니다.
            </Text>
          ) : null}
          <Table<AuctionItem>
            columns={itemColumns}
            dataSource={items}
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
  ), [enabled, itemColumns, items, itemsLoaded, itemsMore, itemsPaging.pagination, itemsQuery, rowInteraction, stats]);

  const historyPanel = useMemo(() => (
    <QueryState
      isLoading={historyQuery.isPending && enabled}
      error={historyQuery.error}
      isEmpty={history.length === 0}
      emptyMessage={
        historyLoaded > 0
          ? historyQuery.hasNextPage && !historyMore.paused
            ? `최근 1시간 거래 ${formatNumber(historyLoaded)}건 중 조건에 맞는 것이 아직 없어 더 찾고 있습니다.`
            : `최근 1시간 거래 ${formatNumber(historyLoaded)}건 중 조건에 맞는 것이 없습니다. 검색어를 줄여 보세요.`
          : '최근 1시간 안에 거래된 내역이 없습니다.'
      }
    >
      <Flex vertical gap={12}>
        {history.length !== historyLoaded ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            최근 1시간 거래 {formatNumber(historyLoaded)}건 가운데 {formatNumber(history.length)}건이 검색어와
            맞습니다.
          </Text>
        ) : null}
        <Table<AuctionHistoryItem>
          columns={historyColumns}
          dataSource={history}
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
  ), [enabled, history, historyColumns, historyLoaded, historyMore, historyPaging.pagination, historyQuery, rowInteraction]);

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
                      runSearch(next);
                    }}
                    style={{ flex: '1 1 260px', minWidth: 0 }}
                  >
                    <Input
                      placeholder="아이템명 검색"
                      allowClear
                      onPressEnter={() => runSearch(form)}
                    />
                  </AutoComplete>

                  <Button
                    type="primary"
                    icon={<SearchIcon />}
                    disabled={!canSubmit || !canQuery}
                    onClick={() => runSearch(form)}
                  >
                    찾기
                  </Button>
                  <Button
                    icon={<RefreshIcon />}
                    onClick={() => {
                      setForm(EMPTY_INPUT);
                      setSubmitted(null);
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
                      찾는 방식이 둘이라 그대로 알린다. 전체 검색은 넥슨 쪽 keyword-search 라
                      단어가 맞아야 하고, 카테고리를 고르면 그 목록을 받아 와 이름 일부로 거른다.
                    */}
                    {nameIndexQuery.isPending
                      ? '아이템 이름을 불러오는 중입니다.'
                      : form.category
                        ? `${form.category} 매물에서 이름 일부로 찾습니다.`
                        : '전체 검색은 단어가 맞아야 찾습니다. 자동완성에서 고르면 그 카테고리로 좁혀 정확히 찾습니다.'}
                  </Text>
                </Flex>
              </Flex>
            </Card>

            {submitted === null ? (
              <Card variant="outlined">
                <Text type="secondary">왼쪽에서 카테고리를 고르거나 아이템명을 입력한 뒤 찾기를 누르세요.</Text>
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
