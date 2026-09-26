import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Grid,
  Input,
  Row,
  Skeleton,
  Spin,
  Statistic,
  Table,
  Tabs,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { RefreshIcon, SearchIcon } from '@/components/icons';
import { normalizeForSearch } from '@/features/auction/dictionary';
import { snapshotAgeLabel } from '@/features/auction/snapshot';
import { useRelicListings } from '@/features/relics/hooks';
import {
  formatRelicValue,
  MURIAS_RELIC_NAME,
  muriasAuctionPath,
  RELIC_CATEGORY,
  RELIC_LEVELS,
  RELIC_MAX_LEVEL,
  relicAuctionPath,
} from '@/features/relics/murias';
import {
  RELIC_GRADES,
  summarizeMurias,
  summarizeOtherRelics,
  type MuriasRow,
  type OtherRelicRow,
  type PriceCell,
} from '@/features/relics/prices';
import type { AuctionItem } from '@/features/auction/types';
import { formatGold, formatGoldShort, formatNumber } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';

const { Title, Text } = Typography;

type TabKey = 'murias' | 'others';

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'murias', label: '무리아스의 유물' },
  { key: 'others', label: '그 밖의 유물' },
];

const tabOf = (value: string | null): TabKey => (value === 'others' ? 'others' : 'murias');

/** 유물 그림 한 변. 던전 코인 표의 교환품 그림과 같다. */
const ITEM_ICON = 28;

/**
 * 가격 칸 폭. "14억 5,000만 G" 가 한 줄에 든다. 이름 칸과 레벨 열 칸이 1440px 화면에 가로 밀기
 * 없이 다 들어가는 폭이다. 가장 많이 보는 10레벨이 오른쪽 끝이라 잘리면 안 된다.
 */
const PRICE_COLUMN_WIDTH = 106;

/**
 * 표가 넓어도 페이지는 화면 폭을 넘지 않는다. 세로 Flex 의 칸은 기본으로 내용보다 좁아지지
 * 않아서, 가로로 미는 표가 페이지 전체를 넓혔다. 좁아질 수 있게 풀어 표 안에서만 민다.
 */
const SHRINK = { minWidth: 0 } as const;

/** 매물이 없는 칸을 표 끝으로 보낸다. */
const priceOf = (cell: PriceCell | null) => cell?.lowest ?? Number.POSITIVE_INFINITY;

/**
 * 가격 한 칸. 가장 싼 개당 가격과 매물 수를 적고, 누르면 경매장에서 그 매물을 본다.
 * 칸이 좁아 억과 만으로 줄이고, 정확한 값은 마우스를 올리면 보인다. 표가 가격으로 가득해
 * 전부 링크 색이면 읽히지 않으므로 글자는 본문색으로 둔다. 누를 수 있다는 것은 표 아래에 적는다.
 */
function PriceLink({ cell, to, label }: { cell: PriceCell | null; to: string; label: string }) {
  const { token } = theme.useToken();
  if (!cell) return <Text type="secondary">-</Text>;
  return (
    <Link
      to={to}
      aria-label={`${label} 매물 보기`}
      title={formatGold(cell.lowest)}
      style={{ color: token.colorText, display: 'block' }}
    >
      <Flex vertical gap={0} align="flex-end">
        <span className="tnum" style={{ whiteSpace: 'nowrap' }}>
          {formatGoldShort(cell.lowest)}
        </span>
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          {formatNumber(cell.count)}건
        </Text>
      </Flex>
    </Link>
  );
}

/** 표를 기다리는 동안. 최종 표처럼 줄이 늘어선 모양이다. */
function TableSkeleton({ loaded }: { loaded: number }) {
  return (
    <Card variant="outlined" aria-busy="true">
      <Flex vertical gap={12}>
        {loaded > 0 ? (
          <Flex gap={8} align="center" role="status">
            <Spin size="small" />
            <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
              매물 {formatNumber(loaded)}건을 받았습니다. 나머지를 받는 중입니다.
            </Text>
          </Flex>
        ) : null}
        <Skeleton active title={false} paragraph={{ rows: 8 }} />
      </Flex>
    </Card>
  );
}

/** 이름으로 좁히는 칸. 라벨은 칸 위에 둔다. */
function NameFilter({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Flex vertical gap={4} style={{ maxWidth: 360 }}>
      <Text strong style={{ fontSize: 13 }}>
        <label htmlFor={id}>{label}</label>
      </Text>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        allowClear
        prefix={<SearchIcon />}
        placeholder={placeholder}
      />
    </Flex>
  );
}

function MuriasView({ items }: { items: AuctionItem[] }) {
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const summary = useMemo(() => summarizeMurias(items), [items]);
  const [query, setQuery] = useState('');
  const needle = normalizeForSearch(query);
  const rows = needle
    ? summary.rows.filter((row) => normalizeForSearch(row.name).includes(needle))
    : summary.rows;

  const columns: TableColumnsType<MuriasRow> = [
    {
      title: '스킬 옵션',
      key: 'name',
      fixed: 'left',
      // 768px 미만에서는 이름 칸을 좁혀 레벨 칸이 한두 개라도 함께 보이게 한다.
      width: wide ? 220 : 136,
      sorter: (a, b) => a.name.localeCompare(b.name, 'ko'),
      render: (_value, row) => (
        <Flex vertical gap={2}>
          <Link to={muriasAuctionPath(row.name)} style={{ fontWeight: 600 }}>
            {row.name}
          </Link>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {RELIC_MAX_LEVEL}레벨 {formatRelicValue(row, row.max)}
            {row.verb ? ` ${row.verb}` : ''}
          </Text>
        </Flex>
      ),
    },
    // 칸마다 매물 수가 있어 합계는 넓은 화면에서만 둔다. 좁은 화면에서는 레벨 칸 하나가 더 소중하다.
    ...(wide
      ? [
          {
            title: '매물',
            dataIndex: 'count',
            width: 64,
            align: 'right' as const,
            sorter: (a: MuriasRow, b: MuriasRow) => a.count - b.count,
            render: (count: number) => <span className="tnum">{formatNumber(count)}</span>,
          },
        ]
      : []),
    ...RELIC_LEVELS.map(
      (level): TableColumnsType<MuriasRow>[number] => ({
        title: `${level}레벨`,
        key: `level-${level}`,
        width: PRICE_COLUMN_WIDTH,
        align: 'right',
        sorter: (a, b) => priceOf(a.levels[level - 1]) - priceOf(b.levels[level - 1]),
        render: (_value, row) => (
          <PriceLink
            cell={row.levels[level - 1]}
            to={muriasAuctionPath(row.name, level)}
            label={`${row.name} ${level}레벨`}
          />
        ),
      }),
    ),
  ];

  return (
    <Flex vertical gap={16} style={SHRINK}>
      <Card variant="outlined">
        {/* 세 칸. 768px 미만에서는 두 칸, 한 칸으로 떨어진다. */}
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Flex gap={12} align="center">
              <ItemIcon category={RELIC_CATEGORY} name={MURIAS_RELIC_NAME} size={40} />
              <Statistic
                title="판매 중"
                value={formatNumber(summary.listed)}
                suffix="건"
                styles={{ content: { fontVariantNumeric: 'tabular-nums' } }}
              />
            </Flex>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Statistic
              title="스킬 옵션"
              value={formatNumber(summary.rows.length)}
              suffix="종"
              styles={{ content: { fontVariantNumeric: 'tabular-nums' } }}
            />
          </Col>
          <Col xs={24} md={8}>
            <Statistic
              title={
                <>
                  <Link to={relicAuctionPath(`${MURIAS_RELIC_NAME}(이데아)`)}>
                    {MURIAS_RELIC_NAME}(이데아)
                  </Link>{' '}
                  최저가
                  {summary.idea ? `, ${formatNumber(summary.idea.count)}건` : ''}
                </>
              }
              value={summary.idea ? formatGold(summary.idea.lowest) : '매물 없음'}
              styles={{ content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}
            />
          </Col>
        </Row>
      </Card>

      {summary.unread > 0 ? (
        <Alert
          type="info"
          showIcon
          title={`옵션을 읽지 못한 무리아스의 유물 ${formatNumber(summary.unread)}건은 표에 넣지 않았습니다.`}
        />
      ) : null}

      <NameFilter
        id="relic-option-filter"
        label="스킬 이름으로 좁히기"
        value={query}
        onChange={setQuery}
        placeholder="예: 오버 드라이브"
      />

      {summary.rows.length === 0 ? (
        <EmptyState description="지금 경매장에 옵션이 붙은 무리아스의 유물 매물이 없습니다. 잠시 뒤 다시 열어 보세요." />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="search"
          description={`이름에 "${query.trim()}" 이 들어간 옵션이 없습니다. 스킬 이름 일부만 넣어 보세요.`}
        />
      ) : (
        <Card variant="outlined" style={SHRINK} styles={{ body: { padding: 0 } }}>
          <Table<MuriasRow>
            columns={columns}
            dataSource={rows}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        </Card>
      )}

      <Text type="secondary" style={{ fontSize: 12 }}>
        칸의 값은 그 레벨 매물 가운데 가장 싼 개당 가격이고, 누르면 경매장에서 그 매물을 봅니다.
        레벨은 옵션 수치를 최대 수치의 10분의 1 단위로 나눈 것입니다. 최대 700%인 옵션은 70%마다
        1레벨입니다.
      </Text>
    </Flex>
  );
}

function OthersView({ items }: { items: AuctionItem[] }) {
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const allRows = useMemo(() => summarizeOtherRelics(items), [items]);
  const [query, setQuery] = useState('');
  const needle = normalizeForSearch(query);
  const rows = needle
    ? allRows.filter((row) => normalizeForSearch(row.name).includes(needle))
    : allRows;

  const columns: TableColumnsType<OtherRelicRow> = [
    {
      title: '유물',
      key: 'name',
      fixed: 'left',
      width: wide ? 220 : 140,
      sorter: (a, b) => a.name.localeCompare(b.name, 'ko'),
      render: (_value, row) => (
        <Flex gap={8} align="center">
          <ItemIcon category={RELIC_CATEGORY} name={row.name} size={ITEM_ICON} />
          <ItemInfoLink name={row.name} category={RELIC_CATEGORY} />
        </Flex>
      ),
    },
    {
      title: '매물',
      dataIndex: 'count',
      width: 72,
      align: 'right',
      sorter: (a, b) => a.count - b.count,
      render: (count: number) => <span className="tnum">{formatNumber(count)}</span>,
    },
    ...RELIC_GRADES.map(
      (grade): TableColumnsType<OtherRelicRow>[number] => ({
        title: grade.label,
        key: grade.key,
        width: PRICE_COLUMN_WIDTH,
        align: 'right',
        sorter: (a, b) => priceOf(a.grades[grade.key]) - priceOf(b.grades[grade.key]),
        render: (_value, row) => {
          const cell = row.grades[grade.key];
          return (
            <PriceLink
              cell={cell}
              to={relicAuctionPath(cell?.itemName ?? row.name)}
              label={`${row.name} ${grade.label}`}
            />
          );
        },
      }),
    ),
  ];

  return (
    <Flex vertical gap={16} style={SHRINK}>
      <NameFilter
        id="relic-name-filter"
        label="유물 이름으로 좁히기"
        value={query}
        onChange={setQuery}
        placeholder="예: 와드네"
      />

      {allRows.length === 0 ? (
        <EmptyState description="지금 경매장에 무리아스의 유물 말고 다른 유물 매물이 없습니다. 잠시 뒤 다시 열어 보세요." />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="search"
          description={`이름에 "${query.trim()}" 이 들어간 유물이 없습니다. 이름 일부만 넣어 보세요.`}
        />
      ) : (
        <Card variant="outlined" style={SHRINK} styles={{ body: { padding: 0 } }}>
          <Table<OtherRelicRow>
            columns={columns}
            dataSource={rows}
            rowKey="name"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        </Card>
      )}

      <Text type="secondary" style={{ fontSize: 12 }}>
        이름 끝의 (특급), (이데아) 로 종류를 나눴습니다. 칸의 값은 그 종류 매물 가운데 가장 싼 개당
        가격이고, 누르면 경매장에서 그 매물을 봅니다.
      </Text>
    </Flex>
  );
}

export function RelicsPage() {
  const canQuery = useCanQuery();
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get('tab'));
  const listings = useRelicListings(canQuery);

  let body: ReactNode;
  if (!canQuery) body = null;
  else if (listings.error) {
    body = (
      <Alert
        type="error"
        showIcon
        role="alert"
        title="유물 매물을 받지 못했습니다"
        description={listings.error.message}
        action={
          <Button size="small" icon={<RefreshIcon />} onClick={listings.retry}>
            다시 받기
          </Button>
        }
      />
    );
  } else if (!listings.items) body = <TableSkeleton loaded={listings.loadedCount} />;
  else if (tab === 'murias') body = <MuriasView items={listings.items} />;
  else body = <OthersView items={listings.items} />;

  return (
    <Flex vertical gap={20} style={SHRINK}>
      <Flex vertical gap={4}>
        <Title level={3} style={{ margin: 0 }}>
          유물 시세
        </Title>
        <Text type="secondary">
          경매장에 올라온 유물의 최저가를 모아 봅니다. 무리아스의 유물은 스킬 옵션과 레벨별로
          나눕니다.
        </Text>
      </Flex>

      {!canQuery ? (
        <Alert
          type="warning"
          showIcon
          title="지금은 경매장 시세를 받을 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      <Flex vertical gap={0}>
        <Tabs
          activeKey={tab}
          onChange={(key) => setParams(key === 'murias' ? {} : { tab: key }, { replace: true })}
          items={TAB_ITEMS}
          tabBarStyle={{ marginBottom: 0 }}
        />
        {listings.at !== null && listings.items ? (
          <Text type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
            {snapshotAgeLabel(listings.at)} 받은 판매 중 매물 {formatNumber(listings.items.length)}
            건 기준입니다. 게임 데이터는 평균 10분 지연됩니다.
          </Text>
        ) : null}
      </Flex>

      {body}
    </Flex>
  );
}
