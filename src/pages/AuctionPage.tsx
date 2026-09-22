import { useMemo, useState } from 'react';
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
import { CategoryPicker } from '@/components/CategoryPicker';
import { ItemOptionList } from '@/components/ItemOptionList';
import { QueryState } from '@/components/QueryState';
import { matchItemNames, useCategoryItemNamesQuery } from '@/features/auction/dictionary';
import { isAuctionSearchReady, useAuctionHistoryQuery, useAuctionItemsQuery } from '@/features/auction/hooks';
import { calculatePriceStats } from '@/features/auction/stats';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from '@/features/auction/types';
import { formatDateTime, formatGold, formatNumber, formatRemaining } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';

const { Title, Text } = Typography;

type Tab = 'items' | 'history';

/** 카테고리를 고르지 않은 상태. 트리의 '전체' 노드가 이 값을 가리킨다. */
const ALL_CATEGORIES = '';

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
  const suggestions = useMemo(
    () => matchItemNames(dictionaryQuery.data ?? [], form.keyword).map((name) => ({ value: name })),
    [dictionaryQuery.data, form.keyword],
  );

  const canSubmit = isAuctionSearchReady(form);

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

  const itemColumns: TableColumnsType<AuctionItem> = [
    {
      title: '아이템',
      dataIndex: 'item_display_name',
      width: 220,
      render: (_value, record) => <ItemNameCell displayName={record.item_display_name} rawName={record.item_name} />,
    },
    { title: '카테고리', dataIndex: 'auction_item_category', width: 130 },
    {
      title: '수량',
      dataIndex: 'item_count',
      width: 90,
      align: 'right',
      className: 'tnum',
      sorter: (a, b) => a.item_count - b.item_count,
      render: (value: number) => formatNumber(value),
    },
    {
      title: '개당 가격',
      dataIndex: 'auction_price_per_unit',
      width: 140,
      align: 'right',
      className: 'tnum',
      defaultSortOrder: 'ascend',
      sorter: (a, b) => a.auction_price_per_unit - b.auction_price_per_unit,
      render: (value: number) => <Text strong>{formatGold(value)}</Text>,
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
      render: (_value, record) => <ItemOptionList options={record.item_option} />,
    },
  ];

  const historyColumns: TableColumnsType<AuctionHistoryItem> = [
    {
      title: '아이템',
      dataIndex: 'item_display_name',
      width: 220,
      render: (_value, record) => <ItemNameCell displayName={record.item_display_name} rawName={record.item_name} />,
    },
    { title: '카테고리', dataIndex: 'auction_item_category', width: 130 },
    {
      title: '수량',
      dataIndex: 'item_count',
      width: 90,
      align: 'right',
      className: 'tnum',
      sorter: (a, b) => a.item_count - b.item_count,
      render: (value: number) => formatNumber(value),
    },
    {
      title: '개당 가격',
      dataIndex: 'auction_price_per_unit',
      width: 140,
      align: 'right',
      className: 'tnum',
      sorter: (a, b) => a.auction_price_per_unit - b.auction_price_per_unit,
      render: (value: number) => <Text strong>{formatGold(value)}</Text>,
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
      render: (_value, record) => <ItemOptionList options={record.item_option} />,
    },
  ];

  const itemsPanel = (
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
                <Statistic title={label} value={value} valueStyle={{ fontVariantNumeric: 'tabular-nums' }} />
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
  );

  const historyPanel = (
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
  );

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
    </Flex>
  );
}
