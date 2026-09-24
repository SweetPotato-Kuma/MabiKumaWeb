import { useEffect, useMemo, useState } from 'react';
import { AppstoreOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons';
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
  Pagination,
  Progress,
  Row,
  Segmented,
  Select,
  Skeleton,
  Table,
  Tag,
  Tooltip,
  TreeSelect,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { BagImage } from '@/components/BagImage';
import { canSearchBags } from '@/features/bags/api';
import { BAG_NAMES, COLOR_PRESETS } from '@/features/bags/constants';
import { useDyeBook, type BagDyeBook } from '@/features/bags/dye';
import { bareName, buildBagTree, isSturdier, namesOfSelection } from '@/features/bags/groups';
import {
  bagNamesOf,
  buildListings,
  type BagListing,
  type PartMode,
} from '@/features/bags/listings';
import { useBagSearch } from '@/features/bags/useBagSearch';
import { SERVER_NAMES } from '@/features/servers/constants';
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

const SERVER_OPTIONS = SERVER_NAMES.map((server) => ({ value: server, label: server }));

type ViewMode = 'grid' | 'table';

const VIEW_OPTIONS = [
  { value: 'grid', label: '그림', icon: <AppstoreOutlined /> },
  { value: 'table', label: '표', icon: <UnorderedListOutlined /> },
];

/**
 * 한 쪽에 보여 줄 개수. 그림 보기는 카드가 작아 넓은 화면에서 한 줄에 열 개 남짓 들어가므로
 * 여섯 줄쯤 되는 60개로 시작한다. 표는 한 줄이 높아(그림 48px) 20줄로 시작한다.
 */
const GRID_PAGE_SIZES = [30, 60, 120];
const GRID_PAGE_SIZE = 60;
const TABLE_PAGE_SIZE = 20;

/** 표 줄의 주머니 그림. 원본 48px 그대로다. */
const ROW_IMAGE_SIZE = 48;
/** 그림 보기 카드의 주머니 그림. 원본의 두 배. */
const CARD_IMAGE_SIZE = 96;

/** 결과가 유효한지 다시 볼 간격. 데이터를 다시 받는 것이 아니라 "지났다" 표시만 바꾼다. */
const CLOCK_TICK_MS = 30 * 1000;

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(row: BagListing): string {
  return row.price === null ? '-' : `${formatNumber(row.price)} ${row.priceType ?? ''}`.trim();
}

/** 주머니 색 견본. 비교에 쓰인 파트는 테두리를 두껍게 해 무엇과 비교했는지 보이게 한다. */
function Swatches({
  colors,
  matchedPart,
  size = 22,
}: {
  colors: string[];
  matchedPart: number | null;
  size?: number;
}) {
  const { token } = theme.useToken();

  return (
    <Flex gap={size < 20 ? 4 : 6}>
      {colors.map((hex, part) => (
        <Tooltip key={part} title={`${PART_LABELS[part] ?? `파트 ${part + 1}`} #${hex}`}>
          <span
            aria-label={`${PART_LABELS[part] ?? `파트 ${part + 1}`} #${hex}`}
            style={{
              width: size,
              height: size,
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

/**
 * 그림 보기. 색이 입혀진 주머니를 카드로 늘어놓아 눈으로 훑어 고를 수 있게 한다.
 *
 * 한 화면에 많이 보이도록 카드를 낮고 좁게 둔다. 이름은 등급과 "주머니" 를 뗀 짧은 이름이고,
 * 더 튼튼한 주머니는 작은 꼬리표로 가른다(그림의 + 표시와 같이 본다). 비슷함은 따로 줄을
 * 쓰지 않고 색 견본 오른쪽에 둔다.
 *
 * 칸 너비를 정해 두고 화면에 들어가는 만큼 채운다. 768px 미만 휴대폰에서는 두 칸, 넓은
 * 화면에서는 열 칸 남짓이 된다. 따로 단을 나누는 규칙이 없어도 한 단으로 무너지지 않는다.
 */
function BagGrid({ rows, book }: { rows: BagListing[]; book: BagDyeBook | null }) {
  const { token } = theme.useToken();

  return (
    <div
      role="list"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 8,
      }}
    >
      {rows.map((row) => (
        <Card
          key={row.key}
          role="listitem"
          size="small"
          variant="outlined"
          styles={{ body: { padding: 8 } }}
        >
          <Flex vertical gap={4}>
            <Flex justify="center">
              <BagImage book={book} name={row.name} colors={row.colors} size={CARD_IMAGE_SIZE} />
            </Flex>
            <Flex gap={4} align="center" style={{ minWidth: 0 }}>
              {isSturdier(row.name) ? (
                <Tag
                  bordered={false}
                  style={{ marginInlineEnd: 0, paddingInline: 4, fontSize: 11 }}
                >
                  더 튼튼한
                </Tag>
              ) : null}
              <Text strong ellipsis={{ tooltip: row.name }} style={{ fontSize: 13, minWidth: 0 }}>
                {bareName(row.name)}
              </Text>
            </Flex>
            <Flex justify="space-between" align="center" gap={4}>
              <Swatches colors={row.colors} matchedPart={row.matchedPart} size={16} />
              {row.score !== null ? (
                <Text className="tnum" style={{ fontSize: 12, color: token.colorPrimary }}>
                  {row.score.toFixed(1)}%
                </Text>
              ) : null}
            </Flex>
            <Text type="secondary" className="tnum" ellipsis style={{ fontSize: 12 }}>
              {row.channel}채널 {row.npc}
            </Text>
            <Text className="tnum" style={{ fontSize: 12 }}>
              {formatPrice(row)}
            </Text>
          </Flex>
        </Card>
      ))}
    </div>
  );
}

export function BagsPage() {
  const available = canSearchBags();
  const { state, search } = useBagSearch();
  // 찾기 전에 미리 받아 둔다. 결과가 올 때쯤이면 칠할 준비가 끝나 있다.
  const dyeBook = useDyeBook();

  const [server, setServer] = useState<string>(SERVER_NAMES[0]);
  /** 트리에서 고른 칸들. 비어 있으면 모든 주머니. */
  const [selectedBags, setSelectedBags] = useState<string[]>([]);
  const [useColor, setUseColor] = useState(true);
  const [color, setColor] = useState('#ffffff');
  const [part, setPart] = useState<PartMode>('any');
  const [view, setView] = useState<ViewMode>('grid');

  // 결과가 아직 유효한지 보여 주려고 시계만 돈다. 데이터를 다시 받지는 않는다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // 찾기 전에는 알려진 42종, 찾은 뒤에는 실제로 나온 이름을 합친다.
  const bagTree = useMemo(
    () => buildBagTree([...BAG_NAMES, ...bagNamesOf(state.channels)]),
    [state.channels],
  );
  const bagNames = useMemo(() => namesOfSelection(bagTree, selectedBags), [bagTree, selectedBags]);

  const listings = useMemo(
    () => buildListings(state.channels, { bagNames, color: useColor ? color : null, part }),
    [state.channels, bagNames, useColor, color, part],
  );

  const resetKey = `${state.server}|${selectedBags.join(',')}|${useColor}|${color}|${part}`;
  const gridPaging = useListPagination(resetKey, {
    defaultPageSize: GRID_PAGE_SIZE,
    pageSizeOptions: GRID_PAGE_SIZES,
  });
  const tablePaging = useListPagination(resetKey, { defaultPageSize: TABLE_PAGE_SIZE });

  const scored = useColor;
  const columns = useMemo<TableColumnsType<BagListing>>(
    () => [
      {
        title: '주머니',
        dataIndex: 'name',
        render: (name: string, row) => (
          <Flex gap={12} align="center">
            <BagImage book={dyeBook} name={row.name} colors={row.colors} size={ROW_IMAGE_SIZE} />
            <Flex vertical gap={6}>
              <Text strong>{name}</Text>
              <Swatches colors={row.colors} matchedPart={row.matchedPart} />
            </Flex>
          </Flex>
        ),
      },
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
          price === null ? <Text type="secondary">-</Text> : formatPrice(row),
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
    [scored, dyeBook],
  );

  const loading = state.status === 'loading';
  const expired = state.nextUpdate !== null && state.nextUpdate <= now;
  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <Flex vertical gap={20}>
      <Flex vertical gap={4}>
        <Title level={3} style={{ margin: 0 }}>
          튼튼한 주머니 찾기
        </Title>
        <Text type="secondary">
          고른 서버의 모든 채널, NPC 17명의 주머니를 원하는 색에 가까운 순으로 보여 줍니다. 상점은
          에린 하루(현실 36분)마다 바뀝니다.
        </Text>
      </Flex>

      {!available ? (
        <Alert
          type="warning"
          showIcon
          message="지금은 주머니를 찾을 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      <Card variant="outlined" styles={{ body: { paddingBottom: 0 } }}>
        <Form layout="vertical" onFinish={() => void search(server)}>
          {/*
            한 줄에 다섯 칸(992px 이상). 576px 이상은 두 칸씩, 그 아래 휴대폰은 한 단으로 쌓인다.
            찾기 버튼은 입력 칸 아래 끝에 맞춘다.
          */}
          <Row gutter={[16, 0]} align="bottom">
            <Col xs={24} sm={12} lg={3}>
              <Form.Item label="서버" htmlFor="bag-server">
                <Select
                  id="bag-server"
                  value={server}
                  onChange={setServer}
                  options={SERVER_OPTIONS}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={7}>
              <Form.Item label="주머니" htmlFor="bag-name">
                <TreeSelect
                  id="bag-name"
                  value={selectedBags}
                  onChange={(values: string[]) => setSelectedBags(values)}
                  treeData={bagTree}
                  treeCheckable
                  showCheckedStrategy={TreeSelect.SHOW_PARENT}
                  treeNodeLabelProp="label"
                  showSearch={{ treeNodeFilterProp: 'title' }}
                  maxTagCount="responsive"
                  allowClear
                  placeholder="모든 주머니"
                  popupMatchSelectWidth={false}
                  listHeight={400}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label="원하는 색">
                <Flex gap={10} align="center">
                  <Checkbox
                    checked={useColor}
                    onChange={(event) => setUseColor(event.target.checked)}
                  >
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
            <Col xs={24} sm={12} lg={5}>
              <Form.Item label="비교할 파트">
                <Segmented
                  value={String(part)}
                  disabled={!useColor}
                  onChange={(value) =>
                    setPart(value === 'any' ? 'any' : (Number(value) as PartMode))
                  }
                  options={PART_OPTIONS}
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={3}>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SearchOutlined />}
                  disabled={!available}
                  loading={loading}
                  block
                >
                  찾기
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
              {state.server} {state.total}채널 중 {state.done}채널을 받았습니다. 먼저 받은 채널부터
              보여 줍니다.
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
        <Alert
          type="info"
          showIcon
          message="상점이 바뀌었습니다. 다시 찾으면 새 목록을 받습니다."
        />
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
          <Empty description="조건에 맞는 주머니가 없습니다. 주머니 선택을 비우거나 비교할 파트를 바꿔 보세요." />
        </Card>
      ) : (
        <Flex vertical gap={10}>
          <Flex justify="space-between" align="center" gap={12} wrap>
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {state.server} {formatNumber(listings.length)}개
              {state.nextUpdate !== null && !expired
                ? `, 다음 상점 갱신 ${formatClock(state.nextUpdate)}까지 유효`
                : ''}
            </Text>
            <Segmented
              size="small"
              aria-label="보기 방식"
              value={view}
              onChange={(value) => setView(value as ViewMode)}
              options={VIEW_OPTIONS}
            />
          </Flex>
          {view === 'grid' ? (
            <>
              <BagGrid
                rows={listings.slice(
                  (gridPaging.page - 1) * gridPaging.pageSize,
                  gridPaging.page * gridPaging.pageSize,
                )}
                book={dyeBook}
              />
              <Flex justify="flex-end">
                <Pagination {...gridPaging.pagination} total={listings.length} />
              </Flex>
            </>
          ) : (
            <Table<BagListing>
              columns={columns}
              dataSource={listings}
              rowKey="key"
              size="small"
              pagination={tablePaging.pagination}
              scroll={{ x: 720 }}
            />
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            주머니 그림은 기본 그림 위에 상점에서 받은 파트 색을 칠해 그린 것입니다. 허브 주머니는
            게임에서도 색이 입혀지지 않아 게임 그림을 그대로 보여 주고, 파트 색은 견본과 색 비교에만
            씁니다.
          </Text>
        </Flex>
      )}
    </Flex>
  );
}
