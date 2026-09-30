import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Flex,
  Grid,
  Pagination,
  Progress,
  Row,
  Segmented,
  Skeleton,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
  theme,
  type TableColumnsType,
  type TreeDataNode,
} from 'antd';
import { BagImage } from '@/components/BagImage';
import { ColorChannelFields } from '@/components/ColorChannelFields';
import { canSearchBags } from '@/features/bags/api';
import {
  COLOR_CHANNEL_KEYS,
  describeColorChannel,
  emptyColorChannels,
  hasColorChannels,
} from '@/features/colorChannels';
import { BAG_NAMES } from '@/features/bags/constants';
import { formatRgb } from '@/features/bags/color';
import { useDyeBook, type BagDyeBook } from '@/features/bags/dye';
import {
  bagCategory,
  bareName,
  buildBagTree,
  CATEGORY_ORDER,
  isSturdier,
  namesOfSelection,
  type BagTreeNode,
} from '@/features/bags/groups';
import { bagNamesOf, buildListings, type BagListing } from '@/features/bags/listings';
import {
  bagConditionParams,
  hasBagConditions,
  readBagConditions,
  type PartCondition,
} from '@/features/bags/searchParams';
import { useBagSearch } from '@/features/bags/useBagSearch';
import { useGridFit } from '@/features/bags/useGridFit';
import { ServerSelect } from '@/components/ServerSelect';
import { useServerParam } from '@/lib/useServerParam';
import { formatNumber } from '@/lib/format';
import { formatPriceWithType, useGoldFormatter } from '@/lib/useGoldFormatter';
import { useListPagination } from '@/lib/useListPagination';
import { useQueryParams } from '@/lib/useQueryParams';
import { EmptyState } from '@/components/EmptyState';
import { ArrowDownIcon, GridIcon, ListIcon, SearchIcon } from '@/components/icons';

const { Title, Text } = Typography;

const PART_LABELS = ['파트 A', '파트 B', '파트 C'];

type ViewMode = 'grid' | 'table';

const VIEW_OPTIONS = [
  { value: 'grid', label: '그림', icon: <GridIcon /> },
  { value: 'table', label: '표', icon: <ListIcon /> },
];

/**
 * 그림 보기 카드. 높이를 고정해 두어야 화면에 몇 줄 들어가는지 셀 수 있다(useGridFit).
 * 그림 96 + 이름 22 + 색 견본 18 + 글 두 줄 36 + 간격 16 + 안쪽 여백 16 + 테두리 2.
 */
const CARD_MIN_WIDTH = 140;
const CARD_HEIGHT = 206;
const GRID_GAP = 8;
/** 격자 아래 쪽 넘기기 버튼 자리. 간격 10 + 작은 쪽 넘기기 24 + 여유 8. */
const PAGINATION_ROOM = 42;
/** 휴대폰에서는 화면에 맞추지 않고 이만큼씩 보여 준다. 어차피 스크롤로 본다. */
const MOBILE_PAGE_SIZE = 20;
/** 표는 한 줄이 높아(그림 48px) 10줄로 시작한다. */
const TABLE_PAGE_SIZE = 10;

/** 분류 탭의 "전체". 분류 키(herb, leather …)와 겹치지 않는 값이다. */
const ALL_TAB = 'all';

/** 표 줄의 주머니 그림. 원본 48px 그대로다. */
const ROW_IMAGE_SIZE = 48;
/** 그림 보기 카드의 주머니 그림. 원본의 두 배. */
const CARD_IMAGE_SIZE = 96;

/** 조건을 고친 뒤 주소에 쓰기까지 기다리는 시간. 색을 끌어 고르는 동안 주소가 계속 바뀌지 않게 한다. */
const URL_WRITE_DELAY_MS = 300;

/** 결과가 유효한지 다시 볼 간격. 데이터를 다시 받는 것이 아니라 "지났다" 표시만 바꾼다. */
const CLOCK_TICK_MS = 30 * 1000;

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

/** 주머니 색 견본. 비교에 쓰인 파트는 테두리를 두껍게 해 무엇과 비교했는지 보이게 한다. */
function Swatches({
  colors,
  compared,
  size = 22,
}: {
  colors: string[];
  compared: readonly number[];
  size?: number;
}) {
  const { token } = theme.useToken();

  return (
    <Flex gap={size < 20 ? 4 : 6}>
      {colors.map((hex, part) => (
        <Tooltip key={part} title={`${PART_LABELS[part] ?? `파트 ${part + 1}`} ${formatRgb(hex)}`}>
          <span
            aria-label={`${PART_LABELS[part] ?? `파트 ${part + 1}`} ${formatRgb(hex)}`}
            style={{
              width: size,
              height: size,
              display: 'block',
              background: `#${hex}`,
              borderRadius: token.borderRadiusSM,
              // 흰색 주머니가 배경에 묻히지 않게 테두리를 늘 둔다.
              border: `1px solid ${token.colorBorder}`,
              outline: compared.includes(part) ? `2px solid ${token.colorPrimary}` : undefined,
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
 * 이름은 등급과 "주머니" 를 뗀 짧은 이름이고, 더 튼튼한 주머니는 작은 꼬리표로 가른다(그림의
 * 노란 + 표시와 같이 본다). 비슷함은 따로 줄을 쓰지 않고 색 견본 오른쪽에 둔다.
 *
 * 칸 너비를 정해 두고 화면에 들어가는 만큼 채운다. 768px 미만 휴대폰에서는 두 칸이 된다.
 * 따로 단을 나누는 규칙이 없어도 한 단으로 무너지지 않는다.
 */
function BagGrid({ rows, book }: { rows: BagListing[]; book: BagDyeBook | null }) {
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();

  return (
    <div
      role="list"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
        gap: GRID_GAP,
      }}
    >
      {rows.map((row) => (
        <Card
          key={row.key}
          role="listitem"
          size="small"
          variant="outlined"
          style={{ height: CARD_HEIGHT }}
          styles={{ body: { padding: 8 } }}
        >
          <Flex vertical gap={4}>
            <Flex justify="center">
              <BagImage book={book} name={row.name} colors={row.colors} size={CARD_IMAGE_SIZE} />
            </Flex>
            <Flex gap={4} align="center" style={{ minWidth: 0, height: 22 }}>
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
            <Flex justify="space-between" align="center" gap={4} style={{ height: 18 }}>
              <Swatches colors={row.colors} compared={row.comparedParts} size={16} />
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
              {row.price === null ? '-' : formatPriceWithType(formatGold, row.price, row.priceType)}
            </Text>
          </Flex>
        </Card>
      ))}
    </div>
  );
}

/** 탭 이름 옆에 개수를 흐리게 붙인다. */
function tabLabel(title: string, count: number) {
  return (
    <Flex gap={6} align="baseline">
      <span>{title}</span>
      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
        {formatNumber(count)}
      </Text>
    </Flex>
  );
}

/** 분류 트리를 antd Tree 모양으로. 잎은 짧은 이름으로 보인다(위 칸이 등급과 재료를 말해 준다). */
function toTreeData(nodes: readonly BagTreeNode[]): TreeDataNode[] {
  return nodes.map((node) => ({
    key: node.value,
    title: node.title,
    children: node.children ? toTreeData(node.children) : undefined,
  }));
}

/**
 * 파트 하나의 색 조건. 경매장 상세 검색과 같은 R, G, B 채널 입력이다. 채널마다 범위이거나 유사도(기준값
 * ± 오차%)이고, 아무 채널도 채우지 않은 파트는 어떤 색이든 찾는다.
 *
 * 파트마다 검색 여부를 고르고 접을 수 있다. 세 파트를 다 펼치면 아래의 주머니 분류가 화면 밖으로 밀려나서,
 * 처음에는 파트 A 만 펼쳐 둔다. 접어도 건 조건은 머리줄에 적어 무엇을 걸었는지 보인다.
 */
function PartChannelsRow({
  part,
  condition,
  open,
  onOpenChange,
  onChange,
}: {
  part: number;
  condition: PartCondition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: PartCondition) => void;
}) {
  const label = PART_LABELS[part];
  const narrowed = hasColorChannels(condition.channels);
  const summary = COLOR_CHANNEL_KEYS.map((key) => describeColorChannel(key, condition.channels[key]))
    .filter(Boolean)
    .join(' ');

  return (
    <Flex vertical gap={6}>
      <Flex justify="space-between" align="center" gap={8}>
        <Checkbox
          checked={condition.enabled}
          onChange={(event) => {
            onChange({ ...condition, enabled: event.target.checked });
            // 켜면 바로 채울 수 있게 펼치고, 끄면 접는다.
            onOpenChange(event.target.checked);
          }}
        >
          <Text strong>{label}</Text>
        </Checkbox>
        <Flex align="center" gap={2} style={{ minWidth: 0 }}>
          {!open && condition.enabled && summary ? (
            <Text
              type="secondary"
              className="tnum"
              ellipsis
              style={{ fontSize: 12, minWidth: 0, maxWidth: 160 }}
              title={summary}
            >
              {summary}
            </Text>
          ) : null}
          {open && narrowed ? (
            <Button
              type="link"
              size="small"
              aria-label={`${label} 조건 지우기`}
              onClick={() => onChange({ ...condition, channels: emptyColorChannels() })}
            >
              지우기
            </Button>
          ) : null}
          <Button
            type="text"
            size="small"
            aria-expanded={open}
            aria-label={`${label} 조건 ${open ? '접기' : '펼치기'}`}
            icon={
              <ArrowDownIcon
                style={{ transform: open ? undefined : 'rotate(-90deg)', transition: 'transform 0.15s' }}
              />
            }
            onClick={() => onOpenChange(!open)}
          />
        </Flex>
      </Flex>
      {open ? (
        <ColorChannelFields
          channels={condition.channels}
          disabled={!condition.enabled}
          onChange={(key, channel) =>
            onChange({ ...condition, channels: { ...condition.channels, [key]: channel } })
          }
        />
      ) : null}
    </Flex>
  );
}

export function BagsPage() {
  const formatGold = useGoldFormatter();
  const available = canSearchBags();
  const { state, search } = useBagSearch();
  // 찾기 전에 미리 받아 둔다. 결과가 올 때쯤이면 칠할 준비가 끝나 있다.
  const dyeBook = useDyeBook();
  const screens = Grid.useBreakpoint();
  const wide = Boolean(screens.md);

  /**
   * 검색 조건은 주소에 담는다. 처음 열 때 주소에서 읽고, 고칠 때마다 주소를 따라 고친다(replace).
   * 그래서 새로고침해도 조건이 남고 링크로 나눌 수 있다. 조건을 바꿔 보는 것마다 뒤로 가기 단계가
   * 쌓이지 않게 하고, 색을 끄는 동안 주소가 매번 바뀌지 않게 잠깐 기다린다.
   */
  const [params, updateParams] = useQueryParams();
  const [initial] = useState(() => ({ conditions: readBagConditions(params), shared: hasBagConditions(params) }));
  const [server, setServer] = useServerParam();
  /** 트리에서 체크한 칸들. 비어 있으면 모든 주머니. */
  const [selectedBags, setSelectedBags] = useState<string[]>(initial.conditions.bags);
  const [parts, setParts] = useState<PartCondition[]>(initial.conditions.parts);
  // 처음에는 켜 둔 파트만 펼친다. 조건이 실린 링크로 들어왔으면 건 파트가 보인다.
  const [openParts, setOpenParts] = useState<boolean[]>(() =>
    initial.conditions.parts.map((part) => part.enabled),
  );
  useEffect(() => {
    const timer = setTimeout(
      () => updateParams(bagConditionParams({ bags: selectedBags, parts })),
      URL_WRITE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [selectedBags, parts, updateParams]);
  // 조건이 실린 링크로 들어왔으면 찾기를 누른 것처럼 바로 받는다. 받은 결과는 조건과 상관없이 쓴다.
  useEffect(() => {
    if (available && initial.shared) void search(server);
    // 처음 열 때 한 번만 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [view, setView] = useState<ViewMode>('grid');
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);

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
  const treeData = useMemo(() => toTreeData(bagTree), [bagTree]);
  const bagNames = useMemo(() => namesOfSelection(bagTree, selectedBags), [bagTree, selectedBags]);
  // 끈 파트는 채널 값이 있어도 쓰지 않는다.
  const searchParts = useMemo(
    () => parts.map((part) => (part.enabled ? part.channels : null)),
    [parts],
  );

  const listings = useMemo(
    () => buildListings(state.channels, { bagNames, parts: searchParts }),
    [state.channels, bagNames, searchParts],
  );

  /**
   * 분류별 탭. 여러 분류를 함께 고르면 결과가 섞여 한 분류만 훑어보기 어렵다. 결과에 분류가
   * 둘 이상 있을 때만 탭을 보이고, "전체" 는 분류를 가리지 않고 가까운 순으로 본다.
   */
  const categoryOfName = useMemo(() => {
    const map = new Map<string, { key: string; title: string }>();
    for (const row of listings) if (!map.has(row.name)) map.set(row.name, bagCategory(row.name));
    return map;
  }, [listings]);
  const categoryTabs = useMemo(() => {
    const counts = new Map<string, { title: string; count: number }>();
    for (const row of listings) {
      const { key, title } = categoryOfName.get(row.name)!;
      counts.set(key, { title, count: (counts.get(key)?.count ?? 0) + 1 });
    }
    return CATEGORY_ORDER.filter((key) => counts.has(key)).map((key) => ({
      key,
      ...counts.get(key)!,
    }));
  }, [listings, categoryOfName]);
  const showTabs = categoryTabs.length > 1;
  // 체크를 바꿔 보던 분류가 결과에서 사라지면 전체로 돌아간다.
  const currentTab =
    showTabs && categoryTabs.some((tab) => tab.key === activeTab) ? activeTab : ALL_TAB;
  const visible = useMemo(
    () =>
      currentTab === ALL_TAB
        ? listings
        : listings.filter((row) => categoryOfName.get(row.name)?.key === currentTab),
    [listings, categoryOfName, currentTab],
  );

  const loading = state.status === 'loading';
  const expired = state.nextUpdate !== null && state.nextUpdate <= now;
  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  const failed = state.failedChannels.length > 0 && !loading;

  const resetKey = `${state.server}|${selectedBags.join(',')}|${JSON.stringify(searchParts)}|${currentTab}`;
  const tablePaging = useListPagination(resetKey, { defaultPageSize: TABLE_PAGE_SIZE });

  // 그림 보기는 화면에 맞춘 개수씩 넘긴다. 위쪽 안내가 생기거나 없어지면 격자가 움직이므로 다시 잰다.
  const gridRef = useRef<HTMLDivElement>(null);
  const fitted = useGridFit(gridRef, {
    minColumnWidth: CARD_MIN_WIDTH,
    rowHeight: CARD_HEIGHT,
    gap: GRID_GAP,
    reserveBelow: PAGINATION_ROOM,
    minRows: 2,
    layoutKey: `${view}|${loading}|${failed}|${expired}|${state.status}|${listings.length > 0}|${showTabs}`,
  });
  const gridPageSize = wide ? (fitted ?? MOBILE_PAGE_SIZE) : MOBILE_PAGE_SIZE;
  const [gridPage, setGridPage] = useState(1);
  useEffect(() => {
    setGridPage(1);
  }, [resetKey, gridPageSize]);

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
              <Swatches colors={row.colors} compared={row.comparedParts} />
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
          price === null ? (
            <Text type="secondary">-</Text>
          ) : (
            formatPriceWithType(formatGold, price, row.priceType)
          ),
      },
      {
        title: '비슷함',
        dataIndex: 'score',
        width: 100,
        align: 'right',
        className: 'tnum',
        render: (score: number | null) => (score === null ? '-' : `${score.toFixed(1)}%`),
      },
    ],
    [dyeBook, formatGold],
  );

  const validity =
    state.nextUpdate !== null && !expired
      ? `다음 상점 갱신 ${formatClock(state.nextUpdate)}까지 유효`
      : null;

  const viewToggle = (
    <Segmented
      size="small"
      aria-label="보기 방식"
      value={view}
      onChange={(value) => setView(value as ViewMode)}
      options={VIEW_OPTIONS}
    />
  );

  const conditions = (
    <Card variant="outlined" size="small" title="검색 조건">
      <Flex vertical gap={14}>
        <Flex vertical gap={6}>
          <Text>서버</Text>
          <ServerSelect block value={server} onChange={setServer} />
        </Flex>
        <Flex vertical gap={12}>
          <Text>원하는 색</Text>
          {parts.map((condition, part) => (
            <PartChannelsRow
              key={part}
              part={part}
              condition={condition}
              open={openParts[part]}
              onOpenChange={(open) =>
                setOpenParts((prev) => prev.map((entry, index) => (index === part ? open : entry)))
              }
              onChange={(next) =>
                setParts((prev) => prev.map((entry, index) => (index === part ? next : entry)))
              }
            />
          ))}
        </Flex>
        <Button
          type="primary"
          icon={<SearchIcon />}
          disabled={!available}
          loading={loading}
          onClick={() => void search(server)}
          block
        >
          찾기
        </Button>
      </Flex>
    </Card>
  );

  const bagPicker = (
    <Card
      variant="outlined"
      size="small"
      title="주머니"
      extra={
        selectedBags.length > 0 ? (
          <Button type="link" size="small" onClick={() => setSelectedBags([])}>
            모두 해제
          </Button>
        ) : null
      }
      styles={{
        body: wide
          ? { maxHeight: 'calc(100dvh - 520px)', minHeight: 160, overflowY: 'auto' }
          : undefined,
      }}
    >
      <Flex vertical gap={6}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {selectedBags.length === 0
            ? '고르지 않으면 모든 주머니를 봅니다.'
            : `${formatNumber(bagNames?.size ?? 0)}종을 봅니다.`}
        </Text>
        <Tree
          checkable
          selectable={false}
          treeData={treeData}
          checkedKeys={selectedBags}
          onCheck={(checked) =>
            setSelectedBags((Array.isArray(checked) ? checked : checked.checked).map(String))
          }
        />
      </Flex>
    </Card>
  );

  const results =
    state.status === 'idle' ? (
      <Card>
        <EmptyState
          variant="search"
          description="서버를 고르고 찾기를 누르세요. 주머니와 색은 찾은 뒤에 바꿔도 다시 받지 않습니다."
        />
      </Card>
    ) : state.status === 'error' ? (
      <Alert
        type="error"
        showIcon
        message="주머니를 받지 못했습니다"
        description="잠시 후 다시 찾아 주세요. 계속 안 되면 화면 위나 맨 아래의 의견 보내기로 알려 주세요."
      />
    ) : listings.length === 0 && loading ? (
      <Card aria-busy="true">
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    ) : listings.length === 0 ? (
      <Card>
        <EmptyState description="조건에 맞는 주머니가 없습니다. 색 조건을 넓히거나, 없는 파트(파트 C 등)의 조건을 지워 보세요." />
      </Card>
    ) : view === 'grid' ? (
      <>
        <div ref={gridRef}>
          <BagGrid
            rows={visible.slice((gridPage - 1) * gridPageSize, gridPage * gridPageSize)}
            book={dyeBook}
          />
        </div>
        <Flex justify="flex-end">
          <Pagination
            current={gridPage}
            pageSize={gridPageSize}
            total={visible.length}
            onChange={setGridPage}
            showSizeChanger={false}
            size="small"
          />
        </Flex>
      </>
    ) : (
      <Table<BagListing>
        columns={columns}
        dataSource={visible}
        rowKey="key"
        size="small"
        pagination={tablePaging.pagination}
        scroll={{ x: 720 }}
      />
    );

  return (
    <Flex vertical gap={16}>
      <Flex vertical gap={4}>
        <Title level={3} style={{ margin: 0 }}>
          튼튼한 주머니 찾기
        </Title>
        <Text type="secondary">
          고른 서버의 모든 채널, NPC 17명의 주머니를 조건에 맞는 것만 원하는 값에 가까운 순으로 보여 줍니다. 상점은
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

      {/* 왼쪽에 검색 조건과 주머니 트리, 오른쪽에 결과. 768px 미만에서는 위아래 한 단으로 떨어진다. */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={9} lg={7} xl={6}>
          <Flex vertical gap={16}>
            {conditions}
            {bagPicker}
          </Flex>
        </Col>

        <Col xs={24} md={15} lg={17} xl={18}>
          <Flex vertical gap={10}>
            {loading ? (
              <Card variant="outlined" size="small">
                <Flex vertical gap={6}>
                  <Progress percent={percent} showInfo={false} />
                  <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
                    {state.server} {state.total}채널 중 {state.done}채널을 받았습니다. 먼저 받은
                    채널부터 보여 줍니다.
                  </Text>
                </Flex>
              </Card>
            ) : null}

            {failed ? (
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

            {state.status !== 'idle' && state.status !== 'error' && listings.length > 0 ? (
              showTabs ? (
                // 개수는 탭마다 붙어 있으므로 따로 줄을 쓰지 않는다. 그만큼 격자가 한 줄 더 들어간다.
                // 768px 미만에서는 탭 옆에 유효 시각과 보기 단추를 두면 탭이 한두 개만 남고 단추가
                // 잘렸다. 그때는 그 둘을 탭 위 한 줄로 올린다.
                <Flex vertical gap={8}>
                  {wide ? null : (
                    <Flex justify="space-between" align="center" gap={12} wrap>
                      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                        {validity}
                      </Text>
                      {viewToggle}
                    </Flex>
                  )}
                  <Tabs
                    size="small"
                    activeKey={currentTab}
                    onChange={setActiveTab}
                    tabBarStyle={{ marginBottom: 0 }}
                    tabBarExtraContent={
                      wide ? (
                        <Flex gap={12} align="center">
                          {validity ? (
                            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                              {validity}
                            </Text>
                          ) : null}
                          {viewToggle}
                        </Flex>
                      ) : undefined
                    }
                    items={[
                      { key: ALL_TAB, label: tabLabel('전체', listings.length) },
                      ...categoryTabs.map((tab) => ({
                        key: tab.key,
                        label: tabLabel(tab.title, tab.count),
                      })),
                    ]}
                  />
                </Flex>
              ) : (
                <Flex justify="space-between" align="center" gap={12} wrap>
                  <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                    {state.server} {formatNumber(listings.length)}개
                    {validity ? `, ${validity}` : ''}
                  </Text>
                  {viewToggle}
                </Flex>
              )
            ) : null}

            {results}
          </Flex>
        </Col>
      </Row>
    </Flex>
  );
}
