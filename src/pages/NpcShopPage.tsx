import { useMemo, useState } from 'react';
import { ClockCircleOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Flex,
  Form,
  Row,
  Select,
  Table,
  Tabs,
  Typography,
  type TableColumnsType,
} from 'antd';
import { ApiKeyNotice } from '@/components/ApiKeyNotice';
import { ItemImage } from '@/components/ItemIcon';
import { ItemOptionList } from '@/components/ItemOptionList';
import { QueryState } from '@/components/QueryState';
import { NPC_NAMES, SERVER_NAMES, channelsOf } from '@/features/npcshop/constants';
import { useNpcShopQuery } from '@/features/npcshop/hooks';
import type { NpcShopItem, NpcShopPrice, NpcShopQueryInput } from '@/features/npcshop/types';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';
import { useListPagination } from '@/lib/useListPagination';

const { Title, Text } = Typography;

/** 그림 칸 크기. 경매장과 같게 둔다. 48x48 이 원래 크기 그대로 들어간다. */
const NPC_ICON_BOX = 48;

const DEFAULT_INPUT: NpcShopQueryInput = {
  npcName: NPC_NAMES[0],
  serverName: SERVER_NAMES[0],
  channel: 1,
};

const SERVER_OPTIONS = SERVER_NAMES.map((server) => ({ value: server, label: server }));
const NPC_OPTIONS = NPC_NAMES.map((npc) => ({ value: npc, label: npc }));

/**
 * 드롭다운을 body 가 아니라 자기 폼 안에 띄운다.
 *
 * body 에 붙으면 페이지가 스크롤될 때마다 antd 가 위치를 다시 계산하고, sticky 헤더와
 * 맞물려 화면이 흔들린다. 여기 셋은 모두 같은 카드 안에 있어 잘릴 걱정이 없다.
 */
const DROPDOWN_IN_PLACE = {
  getPopupContainer: (trigger: HTMLElement) => trigger.parentElement ?? document.body,
} as const;

function formatPrices(prices: NpcShopPrice[] | undefined): string {
  if (!prices || prices.length === 0) return '-';
  return prices.map((price) => `${formatNumber(price.price_value)} ${price.price_type}`).join(' / ');
}

export function NpcShopPage() {
  const canQuery = useCanQuery();
  const [form, setForm] = useState<NpcShopQueryInput>(DEFAULT_INPUT);
  const [submitted, setSubmitted] = useState<NpcShopQueryInput | null>(null);
  const [activeTab, setActiveTab] = useState('0');

  /** 채널 수는 서버마다 다르다. 류트는 44채널, 나머지는 16~25채널이다. */
  const channelOptions = useMemo(
    () => channelsOf(form.serverName).map((channel) => ({ value: channel, label: `${channel} 채널` })),
    [form.serverName],
  );

  // 목록은 쪽으로 나눠 보여 준다. 다른 상점을 찾거나 다른 탭을 열면 첫 쪽으로 돌아간다.
  const { pagination } = useListPagination(`${JSON.stringify(submitted)}|${activeTab}`);

  const shopQuery = useNpcShopQuery(submitted ?? DEFAULT_INPUT, canQuery && submitted !== null);

  const tabs = shopQuery.data?.shop ?? [];

  const columns: TableColumnsType<NpcShopItem> = [
    {
      /**
       * 그림을 32x32 로 못 박아 두었더니 48x48, 48x96 같은 그림이 칸에 맞춰 억지로 늘고
       * 줄었다. 원래 크기로 그리고 칸보다 큰 것만 정확히 절반으로 줄인다. 경매장과 같다.
       */
      title: '',
      key: 'icon',
      width: NPC_ICON_BOX + 24,
      render: (_value, record) =>
        record.image_url ? (
          <ItemImage src={record.image_url} size={NPC_ICON_BOX} />
        ) : (
          // 그림이 없어도 자리는 잡아 둔다. 줄마다 이름 시작점이 달라지지 않게.
          <span style={{ display: 'block', width: NPC_ICON_BOX, height: NPC_ICON_BOX }} aria-hidden="true" />
        ),
    },
    {
      title: '이름',
      dataIndex: 'item_display_name',
      width: 220,
      render: (_value, record) => (
        <Text strong style={{ fontSize: 14 }}>
          {record.item_display_name}
        </Text>
      ),
    },
    {
      title: '수량',
      dataIndex: 'item_count',
      width: 90,
      align: 'right',
      className: 'tnum',
      render: (value: number) => formatNumber(value),
    },
    {
      title: '가격',
      dataIndex: 'price',
      width: 180,
      className: 'tnum',
      render: (_value, record) => formatPrices(record.price),
    },
    {
      title: '구매 제한',
      dataIndex: 'limit_type',
      width: 140,
      render: (_value, record) =>
        record.limit_type ? (
          <span className="tnum">{`${record.limit_type} ${formatNumber(record.limit_value)}`}</span>
        ) : (
          <Text type="secondary">제한 없음</Text>
        ),
    },
    {
      title: '옵션',
      dataIndex: 'item_option',
      render: (_value, record) => <ItemOptionList options={record.item_option} />,
    },
  ];

  return (
    <Flex vertical gap={20}>
      <Title level={3} style={{ margin: 0 }}>
        NPC 상점 조회
      </Title>

      <ApiKeyNotice />

      <Card variant="outlined">
        <Form
          layout="vertical"
          onFinish={() => {
            setActiveTab('0');
            setSubmitted({ ...form });
          }}
        >
          {/* 3단 폼. 768px 미만에서는 한 단으로 떨어진다. */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}>
              <Form.Item label="서버" htmlFor="npc-server">
                <Select
                  id="npc-server"
                  value={form.serverName}
                  onChange={(serverName) =>
                    setForm((prev) => {
                      // 류트 30채널에서 울프로 바꾸면 30채널은 없다. 없는 채널이면 1채널로 돌린다.
                      const valid = channelsOf(serverName).includes(prev.channel);
                      return { ...prev, serverName, channel: valid ? prev.channel : 1 };
                    })
                  }
                  options={SERVER_OPTIONS}
                  style={{ width: '100%' }}
                  {...DROPDOWN_IN_PLACE}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="채널" htmlFor="npc-channel">
                <Select
                  id="npc-channel"
                  value={form.channel}
                  onChange={(channel) => setForm((prev) => ({ ...prev, channel }))}
                  options={channelOptions}
                  style={{ width: '100%' }}
                  {...DROPDOWN_IN_PLACE}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="NPC" htmlFor="npc-name">
                {/*
                  showSearch 를 걷어낸다. 켜 두면 antd 가 타이핑 가능한 입력칸을 그려서
                  드롭다운이 아니라 텍스트 입력처럼 보인다. NPC 는 21명뿐이라 검색으로
                  얻을 게 없고, 목록에서 고르는 편이 빠르다.
                */}
                <Select
                  id="npc-name"
                  value={form.npcName}
                  onChange={(npcName) => setForm((prev) => ({ ...prev, npcName }))}
                  options={NPC_OPTIONS}
                  style={{ width: '100%' }}
                  {...DROPDOWN_IN_PLACE}
                />
              </Form.Item>
            </Col>
          </Row>

          <Button type="primary" htmlType="submit" icon={<SearchOutlined />} disabled={!canQuery}>
            조회
          </Button>
        </Form>
      </Card>

      {submitted === null ? null : (
        <QueryState
          isLoading={shopQuery.isPending}
          error={shopQuery.error}
          isEmpty={tabs.length === 0}
          emptyMessage="해당 NPC의 상점 정보가 없습니다. 채널이나 서버를 바꿔 보세요."
        >
          <Flex vertical gap={12}>
            <Flex gap={16} wrap align="center">
              <Text type="secondary" style={{ fontSize: 13 }}>
                <ClockCircleOutlined /> 조회 시각{' '}
                <span className="tnum">{formatDateTime(shopQuery.data?.date_inquire)}</span>
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                다음 갱신 <span className="tnum">{formatDateTime(shopQuery.data?.date_shop_next_update)}</span>
              </Text>
            </Flex>

            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabs.map((shopTab, index) => ({
                key: String(index),
                label: shopTab.tab_name,
                children: (
                  <Table<NpcShopItem>
                    columns={columns}
                    dataSource={shopTab.item ?? []}
                    rowKey={(record, rowIndex) => `${record.item_display_name}-${rowIndex ?? 0}`}
                    size="small"
                    pagination={pagination}
                    scroll={{ x: 900 }}
                    sticky
                  />
                ),
              }))}
            />
          </Flex>
        </QueryState>
      )}
    </Flex>
  );
}
