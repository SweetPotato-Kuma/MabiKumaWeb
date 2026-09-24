import { useEffect, useMemo, useState } from 'react';
import { SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  ColorPicker,
  Empty,
  Flex,
  Form,
  Progress,
  Row,
  Segmented,
  Select,
  Skeleton,
  Table,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { canSearchBags } from '@/features/bags/api';
import { BAG_NAMES, COLOR_PRESETS } from '@/features/bags/constants';
import { bagNamesOf, buildListings, type BagListing, type PartMode } from '@/features/bags/listings';
import { useBagSearch } from '@/features/bags/useBagSearch';
import { CHANNEL_COUNT_BY_SERVER, SERVER_NAMES } from '@/features/npcshop/constants';
import { formatNumber } from '@/lib/format';
import { useListPagination } from '@/lib/useListPagination';

const { Title, Text } = Typography;

const PART_LABELS = ['파트 A', '파트 B', '파트 C'];

const PART_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: '아무 파트' },
  { value: '0', label: 'A' },
  { value: '1', label: 'B' },
  { value: '2', label: 'C' },
];

const SERVER_OPTIONS = SERVER_NAMES.map((server) => ({
  value: server,
  label: `${server} (${CHANNEL_COUNT_BY_SERVER[server]}채널)`,
}));

/** 결과가 유효한지 다시 볼 간격. 데이터를 다시 받는 것이 아니라 "지났다" 표시만 바꾼다. */
const CLOCK_TICK_MS = 30 * 1000;

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

/** 주머니 색 견본. 비교에 쓰인 파트는 테두리를 두껍게 해 무엇과 비교했는지 보이게 한다. */
function Swatches({ colors, matchedPart }: { colors: string[]; matchedPart: number | null }) {
  const { token } = theme.useToken();

  return (
    <Flex gap={6}>
      {colors.map((hex, part) => (
        <Tooltip key={part} title={`${PART_LABELS[part] ?? `파트 ${part + 1}`} #${hex}`}>
          <span
            aria-label={`${PART_LABELS[part] ?? `파트 ${part + 1}`} #${hex}`}
            style={{
              width: 22,
              height: 22,
              display: 'block',
              background: `#${hex}`,
              borderRadius: token.borderRadiusSM,
              // 흰색 주머니가 배경에 묻히지 않게 테두리를 늘 둔다.
              border: `1px solid ${token.colorBorder}`,
              outline: part === matchedPart ? `2px solid ${token.colorPrimary}` : undefined,
              outlineOffset: 1,
            }}
          />
        </Tooltip>
      ))}
    </Flex>
  );
}

export function BagsPage() {
  const available = canSearchBags();
  const { state, search } = useBagSearch();

  const [server, setServer] = useState<string>(SERVER_NAMES[0]);
  const [bagName, setBagName] = useState('');
  const [useColor, setUseColor] = useState(true);
  const [color, setColor] = useState('#ffffff');
  const [part, setPart] = useState<PartMode>('any');

  // 결과가 아직 유효한지 보여 주려고 시계만 돈다. 데이터를 다시 받지는 않는다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const listings = useMemo(
    () => buildListings(state.channels, { bagName, color: useColor ? color : null, part }),
    [state.channels, bagName, useColor, color, part],
  );

  // 찾기 전에는 알려진 32종, 찾은 뒤에는 실제로 나온 이름을 합친다.
  const bagOptions = useMemo(() => {
    const names = new Set<string>([...BAG_NAMES, ...bagNamesOf(state.channels)]);
    return [
      { value: '', label: '모든 주머니' },
      ...[...names].sort((a, b) => a.localeCompare(b, 'ko')).map((name) => ({ value: name, label: name })),
    ];
  }, [state.channels]);

  const { pagination } = useListPagination(`${state.server}|${bagName}|${useColor}|${color}|${part}`);

  const scored = useColor;
  const columns = useMemo<TableColumnsType<BagListing>>(
    () => [
      {
        title: '색',
        dataIndex: 'colors',
        width: 110,
        render: (_value, row) => <Swatches colors={row.colors} matchedPart={row.matchedPart} />,
      },
      { title: '주머니', dataIndex: 'name', render: (name: string) => <Text strong>{name}</Text> },
      {
        title: '채널',
        dataIndex: 'channel',
        width: 90,
        align: 'right',
        className: 'tnum',
        render: (channel: number) => `${channel}채널`,
      },
      { title: 'NPC', dataIndex: 'npc', width: 120 },
      {
        title: '가격',
        dataIndex: 'price',
        width: 150,
        align: 'right',
        className: 'tnum',
        render: (price: number | null, row) =>
          price === null ? <Text type="secondary">-</Text> : `${formatNumber(price)} ${row.priceType ?? ''}`,
      },
      ...(scored
        ? [
            {
              title: '비슷함',
              dataIndex: 'score',
              width: 100,
              align: 'right' as const,
              className: 'tnum',
              render: (score: number | null) => (score === null ? '-' : `${score.toFixed(1)}%`),
            },
          ]
        : []),
    ],
    [scored],
  );

  const loading = state.status === 'loading';
  const expired = state.nextUpdate !== null && state.nextUpdate <= now;
  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <Flex vertical gap={20}>
      <Flex vertical gap={6}>
        <Title level={3} style={{ margin: 0 }}>
          튼튼한 주머니 찾기
        </Title>
        <Text type="secondary">
          고른 서버의 모든 채널에서 NPC 17명의 튼튼한 주머니를 불러 원하는 색에 가까운 순으로 보여 줍니다. 상점은
          에린 하루(현실 36분)마다 바뀝니다.
        </Text>
      </Flex>

      {!available ? (
        <Alert type="warning" showIcon message="지금은 주머니를 찾을 수 없습니다. 조회 서버 주소가 설정되지 않았습니다." />
      ) : null}

      <Card variant="outlined">
        <Form layout="vertical" onFinish={() => void search(server)}>
          {/* 네 칸. 768px 미만에서는 한 단으로 떨어진다. */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={6}>
              <Form.Item label="서버" htmlFor="bag-server">
                <Select id="bag-server" value={server} onChange={setServer} options={SERVER_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="주머니" htmlFor="bag-name">
                <Select
                  id="bag-name"
                  value={bagName}
                  onChange={setBagName}
                  options={bagOptions}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item label="원하는 색">
                <Flex gap={10} align="center">
                  <Checkbox checked={useColor} onChange={(event) => setUseColor(event.target.checked)}>
                    색으로 비교
                  </Checkbox>
                  <ColorPicker
                    value={color}
                    disabled={!useColor}
                    onChange={(value) => setColor(value.toHexString())}
                    presets={[{ label: '자주 찾는 색', colors: COLOR_PRESETS }]}
                    showText
                  />
                </Flex>
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item label="비교할 파트">
                <Segmented
                  value={String(part)}
                  disabled={!useColor}
                  onChange={(value) => setPart(value === 'any' ? 'any' : (Number(value) as PartMode))}
                  options={PART_OPTIONS}
                />
              </Form.Item>
            </Col>
          </Row>

          <Button type="primary" htmlType="submit" icon={<SearchOutlined />} disabled={!available} loading={loading}>
            찾기
          </Button>
        </Form>
      </Card>

      {loading ? (
        <Card variant="outlined" size="small">
          <Flex vertical gap={6}>
            <Progress percent={percent} showInfo={false} />
            <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
              {state.server} {state.total}채널 중 {state.done}채널을 받았습니다. 먼저 받은 채널부터 보여 줍니다.
            </Text>
          </Flex>
        </Card>
      ) : null}

      {state.failedChannels.length > 0 && !loading ? (
        <Alert
          type="warning"
          showIcon
          message={`${state.failedChannels.join(', ')}채널을 받지 못했습니다. 다시 찾으면 그 채널도 다시 불러옵니다.`}
        />
      ) : null}

      {expired ? (
        <Alert type="info" showIcon message="상점이 바뀌었습니다. 다시 찾으면 새 목록을 받습니다." />
      ) : null}

      {state.status === 'idle' ? (
        <Card>
          <Empty description="서버를 고르고 찾기를 누르세요. 주머니 종류와 색은 찾은 뒤에 바꿔도 다시 받지 않습니다." />
        </Card>
      ) : state.status === 'error' ? (
        <Alert
          type="error"
          showIcon
          message="주머니를 받지 못했습니다"
          description="잠시 후 다시 찾아 주세요. 계속 안 되면 오른쪽 아래 의견 보내기로 알려 주세요."
        />
      ) : listings.length === 0 && loading ? (
        <Card aria-busy="true">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : listings.length === 0 ? (
        <Card>
          <Empty description="조건에 맞는 주머니가 없습니다. 주머니를 모든 주머니로 두거나 비교할 파트를 바꿔 보세요." />
        </Card>
      ) : (
        <Flex vertical gap={10}>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {state.server} {formatNumber(listings.length)}개
            {state.nextUpdate !== null && !expired ? `, 다음 상점 갱신 ${formatClock(state.nextUpdate)}까지 유효` : ''}
          </Text>
          <Table<BagListing>
            columns={columns}
            dataSource={listings}
            rowKey="key"
            size="small"
            pagination={pagination}
            scroll={{ x: 760 }}
          />
        </Flex>
      )}
    </Flex>
  );
}
