import { useState } from 'react';
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
import { ItemOptionList } from '@/components/ItemOptionList';
import { QueryState } from '@/components/QueryState';
import { CHANNELS, NPC_NAMES, SERVER_NAMES } from '@/features/npcshop/constants';
import { useNpcShopQuery } from '@/features/npcshop/hooks';
import type { NpcShopItem, NpcShopPrice, NpcShopQueryInput } from '@/features/npcshop/types';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';

const { Title, Text } = Typography;

const DEFAULT_INPUT: NpcShopQueryInput = {
  npcName: NPC_NAMES[0],
  serverName: SERVER_NAMES[0],
  channel: 1,
};

const SERVER_OPTIONS = SERVER_NAMES.map((server) => ({ value: server, label: server }));
const CHANNEL_OPTIONS = CHANNELS.map((channel) => ({ value: channel, label: `${channel} 채널` }));
const NPC_OPTIONS = NPC_NAMES.map((npc) => ({ value: npc, label: npc }));

function formatPrices(prices: NpcShopPrice[] | undefined): string {
  if (!prices || prices.length === 0) return '-';
  return prices.map((price) => `${formatNumber(price.price_value)} ${price.price_type}`).join(' / ');
}

export function NpcShopPage() {
  const canQuery = useCanQuery();
  const [form, setForm] = useState<NpcShopQueryInput>(DEFAULT_INPUT);
  const [submitted, setSubmitted] = useState<NpcShopQueryInput | null>(null);
  const [activeTab, setActiveTab] = useState('0');

  const shopQuery = useNpcShopQuery(submitted ?? DEFAULT_INPUT, canQuery && submitted !== null);

  const tabs = shopQuery.data?.shop ?? [];

  const columns: TableColumnsType<NpcShopItem> = [
    {
      title: '아이템',
      dataIndex: 'item_display_name',
      width: 260,
      render: (_value, record) => (
        <Flex align="center" gap={10}>
          {record.image_url ? (
            // 폭과 높이를 미리 잡아 두어야 이미지가 늦게 와도 행이 밀리지 않는다.
            <img src={record.image_url} alt="" width={32} height={32} loading="lazy" style={{ flexShrink: 0 }} />
          ) : (
            <span style={{ width: 32, height: 32, flexShrink: 0 }} aria-hidden="true" />
          )}
          <Text strong style={{ fontSize: 14 }}>
            {record.item_display_name}
          </Text>
        </Flex>
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
              <Form.Item label="서버">
                <Select
                  value={form.serverName}
                  onChange={(serverName) => setForm((prev) => ({ ...prev, serverName }))}
                  options={SERVER_OPTIONS}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="채널">
                <Select
                  value={form.channel}
                  onChange={(channel) => setForm((prev) => ({ ...prev, channel }))}
                  options={CHANNEL_OPTIONS}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="NPC">
                <Select
                  value={form.npcName}
                  onChange={(npcName) => setForm((prev) => ({ ...prev, npcName }))}
                  options={NPC_OPTIONS}
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%' }}
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
                    pagination={false}
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
