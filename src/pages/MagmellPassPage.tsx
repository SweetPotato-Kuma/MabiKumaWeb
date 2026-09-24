import { useEffect, useMemo, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Form,
  Grid,
  Progress,
  Row,
  Segmented,
  Select,
  Skeleton,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { canSearchPasses } from '@/features/magmell/api';
import {
  buildPassRanking,
  passNamesOf,
  shortPassName,
  type PassListing,
} from '@/features/magmell/ranking';
import { usePassSearch } from '@/features/magmell/usePassSearch';
import { SERVER_NAMES } from '@/features/servers/constants';
import { formatNumber } from '@/lib/format';
import { useListPagination } from '@/lib/useListPagination';

const { Title, Text } = Typography;

const ALL = '';

const SERVER_OPTIONS = [
  { value: ALL, label: '모든 서버' },
  ...SERVER_NAMES.map((server) => ({ value: server, label: server })),
];

/** 최저가 요약에 채널을 몇 개까지 늘어놓을지. 넘치면 "외 N곳" 으로 줄인다. */
const SUMMARY_CHANNEL_LIMIT = 8;

/** 결과가 유효한지 다시 볼 간격. 데이터를 다시 받는 것이 아니라 "지났다" 표시만 바꾼다. */
const CLOCK_TICK_MS = 30 * 1000;

function formatPrice(price: number, priceType: string | null): string {
  return `${formatNumber(price)} ${priceType ?? ''}`.trim();
}

/** 가장 싼 값 한눈에 보기. 표를 읽기 전에 답이 먼저 보이게 한다. */
function LowestSummary({ listings }: { listings: PassListing[] }) {
  const { token } = theme.useToken();
  const lowest = useMemo(() => listings.filter((row) => row.rank === 1), [listings]);
  if (lowest.length === 0) return null;

  const first = lowest[0];
  const shown = lowest.slice(0, SUMMARY_CHANNEL_LIMIT);
  const hidden = lowest.length - shown.length;

  return (
    <Card variant="outlined">
      {/* 두 칸. 768px 미만에서는 한 단으로 떨어진다. */}
      <Row gutter={[24, 12]} align="middle">
        <Col xs={24} md={8}>
          <Statistic
            title="최저가"
            value={first.price}
            formatter={(value) => formatNumber(Number(value))}
            suffix={first.priceType ?? undefined}
            styles={{ content: { color: token.colorPrimary, fontWeight: 600 } }}
            className="tnum"
          />
        </Col>
        <Col xs={24} md={16}>
          <Flex vertical gap={8}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              이 값에 파는 곳 {lowest.length}곳
            </Text>
            <Flex wrap gap={6}>
              {shown.map((row) => (
                <Tag
                  key={row.key}
                  color="processing"
                  className="tnum"
                  style={{ marginInlineEnd: 0 }}
                >
                  {row.server} {row.channel}채널
                </Tag>
              ))}
              {hidden > 0 ? (
                <Tag className="tnum" style={{ marginInlineEnd: 0 }}>
                  외 {hidden}곳
                </Tag>
              ) : null}
            </Flex>
          </Flex>
        </Col>
      </Row>
    </Card>
  );
}

export function MagmellPassPage() {
  const available = canSearchPasses();
  const { token } = theme.useToken();
  const { state, search } = usePassSearch();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;

  const [server, setServer] = useState(ALL);
  const [passName, setPassName] = useState(ALL);

  // 불러오기 전에 고를 것이 없으므로 들어오자마자 불러 온다. 같은 탭에서는 상점이 바뀌기 전까지 다시 받지 않는다.
  useEffect(() => {
    if (available) void search();
  }, [available, search]);

  // 결과가 아직 유효한지 보여 주려고 시계만 돈다. 데이터를 다시 받지는 않는다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const listings = useMemo(
    () => buildPassRanking(state.results, { server: server || null, passName: passName || null }),
    [state.results, server, passName],
  );

  const passOptions = useMemo(
    () => [
      { value: ALL, label: '채널마다 가장 싼 통행증' },
      ...passNamesOf(state.results).map((name) => ({ value: name, label: shortPassName(name) })),
    ],
    [state.results],
  );

  /** 고른 서버에서 받은 채널 수. 목록 줄 수와 다르면 그 사실을 적는다. */
  const loadedChannels = useMemo(
    () =>
      state.results
        .filter((result) => !server || result.server === server)
        .reduce(
          (sum, result) =>
            sum + result.channels.filter((entry) => entry.error === undefined).length,
          0,
        ),
    [state.results, server],
  );

  const { pagination } = useListPagination(`${server}|${passName}|${state.status}`);

  const columns = useMemo<TableColumnsType<PassListing>>(
    () => [
      {
        title: '순위',
        dataIndex: 'rank',
        width: 72,
        align: 'right',
        className: 'tnum',
        render: (rank: number) =>
          rank === 1 ? (
            <Text strong style={{ color: token.colorPrimary }}>
              {rank}
            </Text>
          ) : (
            <Text strong={rank <= 3}>{rank}</Text>
          ),
      },
      ...(wide
        ? ([
            { title: '서버', dataIndex: 'server', width: 90 },
            {
              title: '채널',
              dataIndex: 'channel',
              width: 90,
              align: 'right',
              className: 'tnum',
              render: (channel: number) => `${channel}채널`,
            },
            {
              title: '통행증',
              dataIndex: 'passNames',
              // 두 통행증이 같은 값인 채널이 대부분이라 한 줄에 몰아 적는다. 줄마다 두 줄씩 늘어나지 않게.
              render: (names: string[]) => names.map(shortPassName).join(', '),
            },
          ] satisfies TableColumnsType<PassListing>)
        : ([
            {
              // 768px 미만에서는 칸을 합친다. 가로로 밀면 가장 중요한 가격 칸이 화면 밖으로 나간다.
              title: '채널',
              key: 'where',
              render: (_value: unknown, row: PassListing) => (
                <Flex vertical gap={2}>
                  <Text className="tnum">
                    {row.server} {row.channel}채널
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {row.passNames.map(shortPassName).join(', ')}
                  </Text>
                </Flex>
              ),
            },
          ] satisfies TableColumnsType<PassListing>)),
      {
        title: '가격',
        dataIndex: 'price',
        width: wide ? 200 : undefined,
        align: 'right',
        className: 'tnum',
        render: (price: number, row) =>
          row.rank === 1 ? (
            <Flex
              justify="flex-end"
              align={wide ? 'center' : 'flex-end'}
              gap={wide ? 8 : 2}
              vertical={!wide}
            >
              <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                최저가
              </Tag>
              <Text strong style={{ color: token.colorPrimary }}>
                {formatPrice(price, row.priceType)}
              </Text>
            </Flex>
          ) : (
            formatPrice(price, row.priceType)
          ),
      },
    ],
    [token.colorPrimary, wide],
  );

  const loading = state.status === 'loading';
  const expired = state.nextUpdate !== null && state.nextUpdate <= now;
  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  const skipped = loadedChannels - listings.length;

  return (
    <Flex vertical gap={20}>
      <Title level={3} style={{ margin: 0 }}>
        마그 멜 통행증 찾기
      </Title>

      {!available ? (
        <Alert
          type="warning"
          showIcon
          message="지금은 통행증을 찾을 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      <Card variant="outlined">
        <Form layout="vertical">
          {/* 세 칸. 768px 미만에서는 한 단으로 떨어진다. */}
          <Row gutter={[16, 16]} align="bottom">
            <Col xs={24} md={11}>
              <Form.Item label="서버" style={{ marginBottom: 0 }}>
                <Segmented
                  aria-label="서버"
                  value={server}
                  onChange={(value) => setServer(String(value))}
                  options={SERVER_OPTIONS}
                  style={{ maxWidth: '100%', overflowX: 'auto' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="통행증" htmlFor="pass-name" style={{ marginBottom: 0 }}>
                <Select
                  id="pass-name"
                  value={passName}
                  onChange={setPassName}
                  options={passOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => void search()}
                  disabled={!available}
                  loading={loading}
                  block
                >
                  다시 불러오기
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {loading ? (
        <Card variant="outlined" size="small">
          <Flex vertical gap={6}>
            <Progress percent={percent} showInfo={false} />
            <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
              서버 {state.total}곳 중 {state.done}곳을 받았습니다. 먼저 받은 서버부터 보여 줍니다.
            </Text>
          </Flex>
        </Card>
      ) : null}

      {state.failed.length > 0 && !loading ? (
        <Alert
          type="warning"
          showIcon
          message={`받지 못한 곳: ${state.failed
            .map((entry) =>
              entry.channels.length === 0
                ? `${entry.server} 전체`
                : `${entry.server} ${entry.channels.join(', ')}채널`,
            )
            .join(', ')}. 다시 불러오면 그 채널도 다시 받습니다.`}
        />
      ) : null}

      {expired ? (
        <Alert
          type="info"
          showIcon
          message="상점이 바뀌었습니다. 다시 불러오면 새 값을 받습니다."
          action={
            <Button size="small" onClick={() => void search()}>
              다시 불러오기
            </Button>
          }
        />
      ) : null}

      {state.status === 'idle' ? (
        available ? (
          <Card aria-busy="true">
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        ) : (
          <Card>
            <Empty description="조회 서버가 연결되면 이곳에 채널별 통행증 값이 나옵니다." />
          </Card>
        )
      ) : state.status === 'error' ? (
        <Alert
          type="error"
          showIcon
          message="통행증 값을 받지 못했습니다"
          description="잠시 후 다시 불러와 주세요. 계속 안 되면 오른쪽 아래 의견 보내기로 알려 주세요."
          action={
            <Button size="small" onClick={() => void search()}>
              다시 불러오기
            </Button>
          }
        />
      ) : listings.length === 0 && loading ? (
        <Card aria-busy="true">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : listings.length === 0 ? (
        <Card>
          <Empty description="고른 조건에 맞는 통행증이 없습니다. 서버를 모든 서버로 두거나 통행증을 바꿔 보세요." />
        </Card>
      ) : (
        <Flex vertical gap={10}>
          <LowestSummary listings={listings} />
          {/* 받은 채널과 목록 줄 수가 다를 때만 적는다. 숨기지 않되, 같을 때는 말하지 않는다. */}
          {skipped > 0 ? (
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              받은 {loadedChannels}채널 중 통행증이 없는 {skipped}채널은 목록에서 뺐습니다.
            </Text>
          ) : null}
          <Table<PassListing>
            columns={columns}
            dataSource={listings}
            rowKey="key"
            size="small"
            pagination={pagination}
            scroll={wide ? { x: 600 } : undefined}
            // 최저가 줄은 바탕도 칠해 쪽을 넘겨 봐도 어디까지가 최저가인지 보이게 한다.
            onRow={(row) => (row.rank === 1 ? { style: { background: token.colorPrimaryBg } } : {})}
          />
        </Flex>
      )}
    </Flex>
  );
}
