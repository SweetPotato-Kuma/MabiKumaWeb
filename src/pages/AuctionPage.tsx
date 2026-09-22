import { useMemo, useState } from 'react';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Flex,
  Form,
  Input,
  Row,
  Select,
  Statistic,
  Table,
  Tabs,
  Typography,
  type TableColumnsType,
} from 'antd';
import { ApiKeyNotice } from '@/components/ApiKeyNotice';
import { ItemOptionList } from '@/components/ItemOptionList';
import { QueryState } from '@/components/QueryState';
import { AUCTION_ITEM_CATEGORIES, KEYWORD_MAX_COUNT } from '@/features/auction/constants';
import { isAuctionSearchReady, useAuctionHistoryQuery, useAuctionItemsQuery } from '@/features/auction/hooks';
import { calculatePriceStats } from '@/features/auction/stats';
import type { AuctionHistoryItem, AuctionItem, AuctionSearchInput } from '@/features/auction/types';
import { formatDateTime, formatGold, formatNumber, formatRemaining } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';

const { Title, Text } = Typography;

type Tab = 'items' | 'history';

const EMPTY_INPUT: AuctionSearchInput = {
  category: '',
  keyword: '',
};

const CATEGORY_OPTIONS = [
  { value: '', label: '전체' },
  ...AUCTION_ITEM_CATEGORIES.map((category) => ({ value: category, label: category })),
];

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
  const [form, setForm] = useState<AuctionSearchInput>(EMPTY_INPUT);
  const [submitted, setSubmitted] = useState<AuctionSearchInput | null>(null);
  const [tab, setTab] = useState<Tab>('items');

  const query = submitted ?? EMPTY_INPUT;
  const enabled = canQuery && submitted !== null && isAuctionSearchReady(query);

  const itemsQuery = useAuctionItemsQuery(query, enabled && tab === 'items');
  const historyQuery = useAuctionHistoryQuery(query, enabled && tab === 'history');

  // 빈 배열을 매 렌더 새로 만들면 아래 통계 useMemo 가 매번 다시 돈다.
  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const history = useMemo(() => historyQuery.data?.items ?? [], [historyQuery.data]);
  const stats = useMemo(() => calculatePriceStats(items), [items]);

  const canSubmit = isAuctionSearchReady(form);

  /**
   * 키워드 검색은 카테고리를 서버에서 걸러 주지 않아 화면에서 거른다.
   * 그래서 "불러온 수"와 "보이는 수"가 달라질 수 있고, 그 사실을 숨기지 않는다.
   */
  const itemsLoaded = itemsQuery.data?.loadedCount ?? 0;
  const historyLoaded = historyQuery.data?.loadedCount ?? 0;

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
            ? `불러온 ${formatNumber(itemsLoaded)}건 중 ${query.category} 카테고리는 없습니다. 더 불러오거나 카테고리를 풀어 보세요.`
            : '조건에 맞는 매물이 없습니다. 검색어를 줄이거나 카테고리를 바꿔 보세요.'
        }
      >
        <Flex vertical gap={12}>
          {items.length !== itemsLoaded ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              불러온 {formatNumber(itemsLoaded)}건 가운데 {query.category} 카테고리 {formatNumber(items.length)}건을
              보고 있습니다.
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
            <Button
              block
              loading={itemsQuery.isFetchingNextPage}
              onClick={() => void itemsQuery.fetchNextPage()}
            >
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
          <Button
            block
            loading={historyQuery.isFetchingNextPage}
            onClick={() => void historyQuery.fetchNextPage()}
          >
            더 불러오기
          </Button>
        ) : null}
      </Flex>
    </QueryState>
  );

  return (
    <Flex vertical gap={20}>
      <Title level={3} style={{ margin: 0 }}>
        경매장 조회
      </Title>

      <ApiKeyNotice />

      <Card variant="outlined">
        <Form
          layout="vertical"
          onFinish={() => {
            if (!canSubmit) return;
            setSubmitted({ ...form });
          }}
        >
          {/* 2단 폼. 768px 미만에서는 한 단으로 떨어진다. */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={14}>
              <Form.Item
                label="검색어"
                extra={`이름 일부만 넣어도 됩니다. 여러 단어는 쉼표나 공백으로 최대 ${KEYWORD_MAX_COUNT}개까지 넣을 수 있고, 모두 포함된 아이템을 찾습니다.`}
              >
                <Input
                  value={form.keyword}
                  placeholder="예: 소드"
                  allowClear
                  onChange={(event) => setForm((prev) => ({ ...prev, keyword: event.target.value }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item label="카테고리" extra="검색어 없이 카테고리만 골라도 전체 매물을 볼 수 있습니다.">
                <Select
                  value={form.category}
                  onChange={(category) => setForm((prev) => ({ ...prev, category }))}
                  options={CATEGORY_OPTIONS}
                  showSearch
                  optionFilterProp="label"
                  placeholder="전체"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Flex gap={10} wrap style={{ marginTop: 8 }}>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} disabled={!canSubmit || !canQuery}>
              검색
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setForm(EMPTY_INPUT);
                setSubmitted(null);
              }}
            >
              초기화
            </Button>
          </Flex>
        </Form>
      </Card>

      {submitted === null ? null : (
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
  );
}
