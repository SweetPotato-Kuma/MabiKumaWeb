import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  AutoComplete,
  Button,
  Card,
  Col,
  Flex,
  Grid,
  Input,
  Row,
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
import { ItemOptionList } from '@/components/ItemOptionList';
import { QueryState } from '@/components/QueryState';
import { matchItemNames, useCategoryItemNamesQuery } from '@/features/auction/dictionary';
import { isAuctionSearchReady, useAuctionHistoryQuery, useAuctionItemsQuery } from '@/features/auction/hooks';
import { calculatePriceStats } from '@/features/auction/stats';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from '@/features/auction/types';
import { formatDateTime, formatGold, formatNumber, formatRemaining } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

const { Title, Text } = Typography;

type Tab = 'items' | 'history';

/** 카테고리를 고르지 않은 상태. 트리의 '전체' 노드가 이 값을 가리킨다. */
const ALL_CATEGORIES = '';

/** 자동완성 목록을 다시 만들기 전에 기다리는 시간. 타이핑이 밀리지 않는 선으로 잡았다. */
const SUGGEST_DELAY_MS = 100;

const EMPTY_INPUT: AuctionSearchInput = {
  category: ALL_CATEGORIES,
  keyword: '',
};

/** 주소에 실려 온 검색 조건. 아이템 사전에서 "시세 보기" 로 넘어오는 경로다. */
function readSearchInput(params: URLSearchParams): AuctionSearchInput {
  return {
    category: params.get('category') ?? ALL_CATEGORIES,
    keyword: params.get('keyword') ?? '',
  };
}

/** 이름 열은 표시 이름과 원래 이름이 다를 때만 두 줄이 된다. */
function ItemNameCell({ displayName, rawName }: { displayName: string; rawName: string }) {
  return (
    <Flex vertical gap={0}>
      <Text strong style={{ fontSize: 14 }}>
        {displayName}
      </Text>
      {displayName !== rawName ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {rawName}
        </Text>
      ) : null}
    </Flex>
  );
}

export function AuctionPage() {
  const canQuery = useCanQuery();
  const screens = Grid.useBreakpoint();
  const isWide = Boolean(screens.md);

  // 아이템 사전에서 넘어올 때 조건이 주소에 실려 온다. 첫 렌더에서만 읽고 이후에는 화면이 주인이다.
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

  // 자동완성은 고른 카테고리의 사전만 읽는다. 전체 사전은 15,000개가 넘는다.
  const dictionaryQuery = useCategoryItemNamesQuery(form.category);

  /**
   * 자동완성 계산은 한 박자 늦춘다.
   *
   * 큰 카테고리는 이름이 1,800개가 넘어서 한 글자마다 전부 훑으면 타이핑이 밀린다.
   * 입력칸은 form.keyword 로 즉시 반응하고, 목록만 여기서 따라온다.
   */
  const suggestKeyword = useDebouncedValue(form.keyword, SUGGEST_DELAY_MS);
  const suggestions = useMemo(
    () => matchItemNames(dictionaryQuery.data ?? [], suggestKeyword).map((name) => ({ value: name })),
    [dictionaryQuery.data, suggestKeyword],
  );

  const canSubmit = isAuctionSearchReady(form);

  /**
   * 줄 전체를 눌러 상세를 연다.
   *
   * 마우스만 되는 게 아니라 키보드로도 닿아야 한다. 표의 줄은 원래 초점을 받지 못하므로
   * tabIndex 를 주고 Enter 와 Space 를 같이 받는다. 줄이 눌리게 됐으니 줄 안의 옵션
   * 칸에서는 따로 펼치는 버튼을 뺐다.
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

  function runSearch(next: AuctionSearchInput) {
    if (!isAuctionSearchReady(next)) return;
    setSubmitted({ ...next });
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
   * 여기에 같은 트리를 따로 들고 있던 탓에 아이템 사전에서 고친 것(묶음을 눌러 펼치기)이
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
  const itemColumns = useMemo<TableColumnsType<AuctionItem>>(() => [
    {
      title: '아이템',
      dataIndex: 'item_display_name',
      width: 220,
      render: (_value, record) => <ItemNameCell displayName={record.item_display_name} rawName={record.item_name} />,
    },
    { title: '카테고리', dataIndex: 'auction_item_category', width: 130 },
    {
      /**
       * 수량은 따로 두지 않는다. 장비는 한 칸에 하나씩 올라오는 경우가 태반이라
       * "1" 만 적힌 칸이 표 하나를 통째로 차지했다. 여러 개 묶인 매물에서만
       * 가격 칸 안에서 개수를 말한다.
       */
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
      title: '만료',
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
    {
      title: '옵션',
      dataIndex: 'item_option',
      render: (_value, record) => <ItemOptionList options={record.item_option} expandable={false} />,
    },
  ], []);

  /** 열 정의는 렌더마다 새로 만들 이유가 없다. 아래 패널 메모의 의존성이기도 하다. */
  const historyColumns = useMemo<TableColumnsType<AuctionHistoryItem>>(() => [
    {
      title: '아이템',
      dataIndex: 'item_display_name',
      width: 220,
      render: (_value, record) => <ItemNameCell displayName={record.item_display_name} rawName={record.item_name} />,
    },
    { title: '카테고리', dataIndex: 'auction_item_category', width: 130 },
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
    {
      title: '옵션',
      dataIndex: 'item_option',
      render: (_value, record) => <ItemOptionList options={record.item_option} expandable={false} />,
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
              <Col key={label} flex="1 1 140px">
                <Statistic title={label} value={value} styles={{ content: { fontVariantNumeric: 'tabular-nums' } }} />
              </Col>
            ))}
          </Row>
          <Text type="secondary" style={{ fontSize: 12 }}>
            지금 보고 있는 매물 {formatNumber(stats.count)}건만으로 계산한 값입니다. 더 불러오면 값이 바뀝니다.
          </Text>
        </Card>
      ) : null}

      <QueryState
        isLoading={itemsQuery.isPending && enabled}
        error={itemsQuery.error}
        isEmpty={items.length === 0}
        emptyMessage={
          itemsLoaded > 0
            ? `불러온 ${formatNumber(itemsLoaded)}건 중 조건에 맞는 것이 없습니다. 더 불러오거나 조건을 넓혀 보세요.`
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
            pagination={false}
            scroll={{ x: 980 }}
            sticky
          />
          {itemsQuery.hasNextPage ? (
            <Button block loading={itemsQuery.isFetchingNextPage} onClick={() => void itemsQuery.fetchNextPage()}>
              500개 더 불러오기
            </Button>
          ) : null}
        </Flex>
      </QueryState>
    </Flex>
  ), [enabled, itemColumns, items, itemsLoaded, itemsQuery, rowInteraction, stats]);

  const historyPanel = useMemo(() => (
    <QueryState
      isLoading={historyQuery.isPending && enabled}
      error={historyQuery.error}
      isEmpty={history.length === 0}
      emptyMessage={
        historyLoaded > 0
          ? `최근 1시간 거래 ${formatNumber(historyLoaded)}건 중 조건에 맞는 것이 없습니다. 더 불러오거나 검색어를 줄여 보세요.`
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
          pagination={false}
          scroll={{ x: 980 }}
          sticky
        />
        {historyQuery.hasNextPage ? (
          <Button block loading={historyQuery.isFetchingNextPage} onClick={() => void historyQuery.fetchNextPage()}>
            더 불러오기
          </Button>
        ) : null}
      </Flex>
    </QueryState>
  ), [enabled, history, historyColumns, historyLoaded, historyQuery, rowInteraction]);

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
                    options={suggestions}
                    onChange={(keyword: string) => setForm((prev) => ({ ...prev, keyword }))}
                    onSelect={(keyword: string) => {
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
                    icon={<SearchOutlined />}
                    disabled={!canSubmit || !canQuery}
                    onClick={() => runSearch(form)}
                  >
                    찾기
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
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
                    {form.category
                      ? dictionaryQuery.isFetching
                        ? '아이템 이름을 불러오는 중입니다.'
                        : `${form.category} 매물에서 이름 일부로 찾습니다. 자동완성은 이름 ${formatNumber(dictionaryQuery.data?.length ?? 0)}개에서 거듭니다.`
                      : '전체 검색은 단어가 맞아야 찾습니다. 카테고리를 고르면 이름 일부만 넣어도 찾습니다.'}
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
