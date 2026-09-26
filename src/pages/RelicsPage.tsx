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
import { SkillIcon } from '@/components/crafting/RecipeInfo';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { RefreshIcon, SearchIcon } from '@/components/icons';
import { normalizeForSearch } from '@/features/auction/dictionary';
import { snapshotAgeLabel } from '@/features/auction/snapshot';
import {
  groupByArcana,
  useArcanaQuery,
  type ArcanaGroup,
  type ArcanaOption,
} from '@/features/relics/arcana';
import { useRelicListings } from '@/features/relics/hooks';
import {
  formatRelicValue,
  MURIAS_RELIC_NAME,
  muriasAuctionPath,
  RELIC_CATEGORY,
  RELIC_LEVELS,
  RELIC_MAX_LEVEL,
  relicAuctionPath,
  relicValueAt,
} from '@/features/relics/murias';
import {
  RELIC_GRADES,
  summarizeMurias,
  summarizeOtherRelics,
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

/** 그 밖의 유물 표의 가격 칸 폭. "14억 5,000만 G" 가 한 줄에 든다. */
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
function PriceLink({
  cell,
  to,
  label,
  showCount = true,
}: {
  cell: PriceCell | null;
  to: string;
  label: string;
  /** 매물 수를 가격 아래에 적는다. 매물 수 칸이 따로 있는 표에서는 끈다. */
  showCount?: boolean;
}) {
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
        {showCount ? (
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {formatNumber(cell.count)}건
          </Text>
        ) : null}
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

/** 아르카나 단추와 묶음 머리의 그림 크기. */
const ARCANA_ICON = 36;
const ARCANA_BUTTON_ICON = 20;
/** 옵션 카드의 스킬 그림. */
const SKILL_ICON = 32;

/** 옵션 카드 안 한 줄. */
interface LevelLine {
  level: number;
  cell: PriceCell | null;
}

/**
 * 스킬 옵션 하나. 스킬 그림과 옵션 이름을 머리에 두고, 레벨마다 그 레벨의 수치와 최저가를
 * 한 줄씩 적는다. 수치를 몰라도 레벨로 읽고, 레벨의 뜻이 궁금하면 옆의 수치를 본다.
 * 높은 레벨부터 적는다. 가장 많이 찾는 것이 10레벨이다.
 */
function OptionCard({ option }: { option: ArcanaOption }) {
  const { row, skill } = option;
  const lines: LevelLine[] = [...RELIC_LEVELS]
    .reverse()
    .map((level) => ({ level, cell: row.levels[level - 1] }));
  const columns: TableColumnsType<LevelLine> = [
    {
      title: '레벨',
      dataIndex: 'level',
      width: 64,
      render: (level: number, line) => (
        <Text className="tnum" type={line.cell ? undefined : 'secondary'}>
          {level}레벨
        </Text>
      ),
    },
    {
      title: '수치',
      key: 'value',
      align: 'right',
      render: (_value, line) => (
        <Text type="secondary" className="tnum" style={{ whiteSpace: 'nowrap' }}>
          {formatRelicValue(row, relicValueAt(row, line.level))}
        </Text>
      ),
    },
    {
      title: '매물',
      key: 'count',
      align: 'right',
      width: 52,
      render: (_value, line) =>
        line.cell ? <span className="tnum">{formatNumber(line.cell.count)}</span> : null,
    },
    {
      title: '최저가',
      key: 'price',
      align: 'right',
      render: (_value, line) => (
        <PriceLink
          cell={line.cell}
          to={muriasAuctionPath(row.name, line.level)}
          label={`${row.name} ${line.level}레벨`}
          showCount={false}
        />
      ),
    },
  ];
  return (
    <Card type="inner" size="small" variant="outlined" styles={{ body: { padding: 0 } }}>
      <Flex gap={10} align="center" style={{ padding: '12px 12px 8px' }}>
        {skill ? <SkillIcon skillId={skill.id} size={SKILL_ICON} /> : null}
        <Flex vertical gap={2} style={SHRINK}>
          <Link to={muriasAuctionPath(row.name)} style={{ fontWeight: 600 }}>
            {row.name}
          </Link>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {RELIC_MAX_LEVEL}레벨 {formatRelicValue(row, row.max)}
            {row.verb ? ` ${row.verb}` : ''}, 매물 {formatNumber(row.count)}건
          </Text>
        </Flex>
      </Flex>
      <Table<LevelLine>
        columns={columns}
        dataSource={lines}
        rowKey="level"
        size="small"
        pagination={false}
      />
    </Card>
  );
}

/** 아르카나 하나의 묶음. 머리에 아르카나 그림과 이름, 그 아래 옵션 카드들. */
function ArcanaSection({ group, wide }: { group: ArcanaGroup; wide: boolean }) {
  return (
    <Card
      variant="outlined"
      size={wide ? 'default' : 'small'}
      title={
        <Flex gap={12} align="center" style={{ paddingBlock: 8 }}>
          {group.arcana ? <SkillIcon skillId={group.arcana.awakening} size={ARCANA_ICON} /> : null}
          <Flex vertical gap={0}>
            <Text strong style={{ fontSize: 16 }}>
              {group.arcana?.name ?? '아르카나를 찾지 못한 옵션'}
            </Text>
            <Text type="secondary" className="tnum" style={{ fontSize: 12, fontWeight: 400 }}>
              스킬 옵션 {formatNumber(group.options.length)}종, 매물 {formatNumber(group.count)}건
            </Text>
          </Flex>
        </Flex>
      }
    >
      {/*
        넓은 화면에서는 옵션 카드를 한 줄에 셋까지 폭을 나눠 채운다. 아르카나마다 옵션이 셋 안팎이라
        300px 로만 자르면 넓은 화면에서 오른쪽이 비었다. 768px 미만에서는 한 줄에 하나씩 둔다.
      */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: wide
            ? 'repeat(auto-fill, minmax(max(300px, calc((100% - 24px) / 3)), 1fr))'
            : 'minmax(0, 1fr)',
          gap: 12,
        }}
      >
        {group.options.map((option) => (
          <OptionCard key={option.row.key} option={option} />
        ))}
      </div>
    </Card>
  );
}

/**
 * 아르카나 고르기. 하나를 고르면 그 아르카나의 옵션만 본다. 고른 것은 주소에 남아 새로 고쳐도,
 * 링크를 건네도 그대로다.
 */
function ArcanaPicker({
  groups,
  selected,
  onSelect,
}: {
  groups: ArcanaGroup[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const arcanas = groups.flatMap((group) => (group.arcana ? [group.arcana] : []));
  if (arcanas.length === 0) return null;
  const buttonProps = (on: boolean) =>
    ({
      size: 'small',
      color: on ? 'primary' : 'default',
      variant: on ? 'solid' : 'outlined',
      'aria-pressed': on,
    }) as const;
  return (
    <Flex vertical gap={4}>
      <Text strong style={{ fontSize: 13 }} id="relic-arcana-label">
        아르카나
      </Text>
      <Flex gap={6} wrap role="group" aria-labelledby="relic-arcana-label">
        <Button {...buttonProps(selected === null)} onClick={() => onSelect(null)}>
          전체
        </Button>
        {arcanas.map((arcana) => (
          <Button
            key={arcana.id}
            {...buttonProps(selected === arcana.id)}
            icon={<SkillIcon skillId={arcana.awakening} size={ARCANA_BUTTON_ICON} />}
            onClick={() => onSelect(arcana.id)}
          >
            {arcana.name}
          </Button>
        ))}
      </Flex>
    </Flex>
  );
}

function MuriasView({ items }: { items: AuctionItem[] }) {
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const summary = useMemo(() => summarizeMurias(items), [items]);
  const arcanaQuery = useArcanaQuery();
  const groups = useMemo(
    () => groupByArcana(summary.rows, arcanaQuery.data?.arcanas ?? []),
    [summary.rows, arcanaQuery.data],
  );
  const [params, setParams] = useSearchParams();
  const selectedParam = Number(params.get('arcana'));
  const selected = groups.some((group) => group.arcana?.id === selectedParam)
    ? selectedParam
    : null;
  const select = (id: number | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === null) next.delete('arcana');
        else next.set('arcana', String(id));
        return next;
      },
      { replace: true },
    );

  const [query, setQuery] = useState('');
  const needle = normalizeForSearch(query);
  // 옵션 이름이나 아르카나 이름에 들어 있으면 남긴다. "블래스트" 로 치면 그 아르카나가 통째로 남는다.
  const shown = groups
    .filter((group) => selected === null || group.arcana?.id === selected)
    .map((group) => ({
      ...group,
      options:
        needle && !normalizeForSearch(group.arcana?.name ?? '').includes(needle)
          ? group.options.filter((option) => normalizeForSearch(option.row.name).includes(needle))
          : group.options,
    }))
    .filter((group) => group.options.length > 0);

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

      {arcanaQuery.isPending ? (
        <Skeleton active title={false} paragraph={{ rows: 6 }} />
      ) : summary.rows.length === 0 ? (
        <EmptyState description="지금 경매장에 옵션이 붙은 무리아스의 유물 매물이 없습니다. 잠시 뒤 다시 열어 보세요." />
      ) : (
        <>
          <ArcanaPicker groups={groups} selected={selected} onSelect={select} />
          <NameFilter
            id="relic-option-filter"
            label="스킬 이름으로 좁히기"
            value={query}
            onChange={setQuery}
            placeholder="예: 오버 드라이브"
          />
          {shown.length === 0 ? (
            <EmptyState
              variant="search"
              description={`이름에 "${query.trim()}" 이 들어간 옵션이 없습니다. 스킬 이름 일부만 넣거나 아르카나를 전체로 바꿔 보세요.`}
            />
          ) : (
            shown.map((group) => (
              <ArcanaSection key={group.arcana?.id ?? 'unknown'} group={group} wide={wide} />
            ))
          )}
        </>
      )}

      <Text type="secondary" style={{ fontSize: 12 }}>
        최저가는 그 레벨 매물 가운데 가장 싼 개당 가격이고, 누르면 경매장에서 그 매물을 봅니다.
        레벨은 옵션 수치를 최대 수치의 10분의 1 단위로 나눈 것입니다. 아르카나 그림은 그 아르카나의
        각성 스킬 그림입니다.
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
