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
  Switch,
  Table,
  Tabs,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { SkillIcon } from '@/components/crafting/RecipeInfo';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { HistoryIcon, RefreshIcon, SearchIcon, WarningIcon } from '@/components/icons';
import { RelicTrendModal } from '@/components/relics/RelicTrendModal';
import { normalizeForSearch } from '@/features/auction/dictionary';
import { snapshotAgeLabel } from '@/features/auction/snapshot';
import {
  groupByArcana,
  useArcanaQuery,
  type ArcanaGroup,
  type ArcanaOption,
} from '@/features/relics/arcana';
import { useRelicListings } from '@/features/relics/hooks';
import { useOptionTradesQuery } from '@/features/market/api';
import {
  formatRelicValue,
  MURIAS_OPTION_TYPE,
  MURIAS_RELIC_NAME,
  muriasAuctionPath,
  RELIC_CATEGORY,
  RELIC_MAX_LEVEL,
  relicAuctionPath,
  relicValueAt,
} from '@/features/relics/murias';
import {
  ideaOdds,
  lastTradesByRow,
  RELIC_GRADES,
  summarizeMurias,
  summarizeOtherRelics,
  type IdeaOdds,
  type LastTrade,
  type MuriasRow,
  type OtherRelicRow,
  type PriceCell,
} from '@/features/relics/prices';
import type { AuctionItem } from '@/features/auction/types';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import { useCanQuery } from '@/lib/settings';
import { useQueryTextParam } from '@/lib/useQueryParams';

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
 * 전부 링크 색이면 읽히지 않으므로 글자는 본문색으로 둔다.
 */
function PriceLink({
  cell,
  to,
  label,
  showCount = true,
  unit = true,
  strong = false,
}: {
  cell: PriceCell | null;
  to: string;
  label: string;
  /** 매물 수를 가격 아래에 적는다. 매물 수 칸이 따로 있는 표에서는 끈다. */
  showCount?: boolean;
  /** 가격 뒤의 " G". 가격만 촘촘히 늘어선 곳에서는 뗀다. */
  unit?: boolean;
  /** 굵게. 무리아스의 유물에서 이데아 최저가 이상인 칸을 가른다. */
  strong?: boolean;
}) {
  const formatGold = useGoldFormatter();
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
        <span className="tnum" style={{ whiteSpace: 'nowrap', fontWeight: strong ? 700 : undefined }}>
          {formatGold(cell.lowest, unit)}
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
const SKILL_ICON = 28;
/** 아주 넓은 화면(1600px 이상)에서 아르카나 이름을 두는 왼쪽 칸 폭. "포비든 알케미스트" 가 한 줄에 든다. */
const ARCANA_COLUMN = 136;

/**
 * 레벨 줄 한 개의 세 칸. 레벨과 매물 수 칸은 폭을 못 박고, 가격이 가운데를 오른쪽 정렬로 쓴다.
 * 양옆을 글자만큼(max-content)으로 두면 "4건" 과 "12건" 줄의 가격 끝이 어긋났다. 폭을 박아 두면
 * 가격 끝이 세로로 한 줄에 선다.
 */
const LEVEL_GRID = '40px minmax(max-content, 1fr) auto';
/**
 * 레벨 단의 최소 폭. "10레벨"(39px), "4억 4,500만"(굵게 83px), "12건"(25px) 이 칸 사이 4px 씩과
 * 함께 한 줄에 드는 폭이다. 드물게 "21억 7,000만"(93px) 처럼 더 긴 가격은 단 사이 여백으로 조금 넘친다.
 */
const LEVEL_COLUMN_MIN = 160;
/** 레벨 두 단 사이. 가운데에 선이 지나간다. */
const LEVEL_COLUMN_GAP = 24;
/** 옵션 카드의 최소 폭. 레벨 두 단과 단 사이, 작은 카드 안쪽 여백(양쪽 12px)이 드는 폭이다. */
const OPTION_CARD_MIN = LEVEL_COLUMN_MIN * 2 + LEVEL_COLUMN_GAP + 24;
/**
 * 레벨 줄의 최대 폭. 한 단으로 떨어지는 휴대폰에서 줄이 화면 끝까지 늘면 레벨과 가격 사이가
 * 한참 벌어져 어느 가격이 어느 레벨 것인지 눈으로 따라가야 했다.
 */
const LEVEL_ROW_MAX = 240;

/** 레벨 단 둘. 높은 레벨이 왼쪽이다. 줄마다 레벨이 적혀 있어 범위는 화면에 따로 적지 않고 화면 읽기에만 알린다. */
const LEVEL_BLOCKS = [
  { label: '10~6레벨', levels: [10, 9, 8, 7, 6] },
  { label: '5~1레벨', levels: [5, 4, 3, 2, 1] },
];

/** 설명을 띄우는 작은 아이콘 단추. 마우스를 올리거나 눌러서 열고, 휴대폰에서도 눌러서 볼 수 있다. */
function InfoButton({ title, label, children }: { title: ReactNode; label: string; children: ReactNode }) {
  return (
    <Tooltip title={title} trigger={['hover', 'click']}>
      <Button
        type="text"
        size="small"
        aria-label={label}
        icon={children}
        style={{ width: 22, height: 22, minWidth: 22, padding: 0 }}
      />
    </Tooltip>
  );
}

/**
 * 스킬 옵션 하나. 스킬 그림과 옵션 이름을 머리에 두고, 레벨마다의 최저가를 두 단 다섯 줄로 적는다.
 * 한 줄에 한 레벨씩 열 줄이면 아르카나 하나가 화면을 다 채워 여러 아르카나를 견줄 수 없었다. 레벨마다의 수치는
 * 머리의 10레벨 수치를 10으로 나누면 되고, 레벨 글자에 마우스를 올려도 보인다.
 *
 * 가격을 누르면 그 레벨의 거래가 추이 창이 열리고, 경매장으로 가는 길은 창 안 단추에 있다. 레벨이 낮은데 더 높은
 * 레벨보다 비싼 칸은 값을 낮춰 적고 사기 위험 표시를 붙인다(guardLevels).
 */
function OptionCard({
  option,
  lastTrades,
  ideaPrice,
  listedOnly,
  onOpen,
}: {
  option: ArcanaOption;
  /** 이 옵션의 레벨마다 최종 거래. 1레벨부터. 기록이 없으면 undefined. */
  lastTrades: (LastTrade | null)[] | undefined;
  /** 이데아 최저가. 이 값 이상인 가격을 굵게 적는다. 매물이 없으면 null. */
  ideaPrice: number | null;
  /** 매물이 있는 레벨만 적는다. */
  listedOnly: boolean;
  /** 레벨 칸을 눌렀을 때. 그 레벨의 거래가 추이 창을 연다. */
  onOpen: (level: number) => void;
}) {
  const formatGold = useGoldFormatter();
  const { row, skill } = option;
  const { token } = theme.useToken();
  const aboveIdea = (price: number) => ideaPrice !== null && price >= ideaPrice;

  const blocks = LEVEL_BLOCKS.map((block) => ({
    ...block,
    levels: listedOnly ? block.levels.filter((level) => row.levels[level - 1]) : block.levels,
  })).filter((block) => block.levels.length > 0);
  if (blocks.length === 0) return null;

  const levelRow = (level: number) => {
    const cell = row.levels[level - 1];
    // 지금 매물이 없는 레벨은 최종 거래가를 흐리게 적고 옆에 기록 아이콘을 둔다. 언제 팔린 값인지는 아이콘을 누르면 보인다.
    const trade = cell ? null : (lastTrades?.[level - 1] ?? null);
    const open = (kind: string) => ({
      onClick: () => onOpen(level),
      'aria-label': `${row.name} ${level}레벨 ${kind} 거래가 추이 보기`,
    });
    return (
      <div
        key={level}
        role="listitem"
        style={{
          display: 'grid',
          gridTemplateColumns: LEVEL_GRID,
          alignItems: 'center',
          columnGap: 4,
          maxWidth: LEVEL_ROW_MAX,
          paddingBlock: 1,
        }}
      >
        {/* 레벨은 보조 글자색이면 가격 옆에서 묻혔다. 본문색 굵은 글자로 가격과 짝을 이루게 한다. */}
        <Text
          className="tnum"
          title={formatRelicValue(row, relicValueAt(row, level))}
          style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {level}레벨
        </Text>
        <Flex justify="flex-end">
          {cell ? (
            <Button
              type="text"
              size="small"
              className="tnum"
              {...open(formatGold(cell.lowest))}
              style={{ paddingInline: 4, fontWeight: aboveIdea(cell.lowest) ? 700 : undefined, whiteSpace: 'nowrap' }}
            >
              {formatGold(cell.lowest, false)}
            </Button>
          ) : trade ? (
            <Button
              type="text"
              size="small"
              className="tnum"
              {...open(`최종 ${formatGold(trade.price)}`)}
              style={{
                paddingInline: 4,
                whiteSpace: 'nowrap',
                color: token.colorTextTertiary,
                fontWeight: aboveIdea(trade.price) ? 700 : undefined,
              }}
            >
              {formatGold(trade.price, false)}
            </Button>
          ) : (
            // 거래 기록은 모으기 시작한 뒤의 것만 있다. 그 뒤로 팔린 적이 없으면 적을 값이 없다.
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              기록 없음
            </Text>
          )}
        </Flex>
        <Flex justify="flex-end" align="center" gap={2}>
          {cell ? (
            <>
              {cell.risky && cell.actual !== undefined ? (
                <InfoButton
                  label={`${row.name} ${level}레벨 사기 위험 설명`}
                  title={`(사기 위험) 실제 최저가는 ${formatGold(cell.actual)} 입니다. 더 높은 레벨의 최저가보다 비싸서 ${formatGold(cell.lowest)} 로 낮춰 적었습니다.`}
                >
                  <WarningIcon style={{ color: token.colorWarning }} />
                </InfoButton>
              ) : null}
              <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {formatNumber(cell.count)}건
              </Text>
            </>
          ) : trade ? (
            <InfoButton
              label={`${row.name} ${level}레벨 최종 거래가 설명`}
              title={`최종 거래가 ${formatGold(trade.price)}, ${tradeDay(trade.at)}. 지금 판매 중인 매물은 없습니다.`}
            >
              <HistoryIcon style={{ color: token.colorTextTertiary }} />
            </InfoButton>
          ) : null}
        </Flex>
      </div>
    );
  };

  return (
    <Card type="inner" size="small" variant="outlined">
      <Flex vertical gap={8}>
        <Flex gap={8} align="center">
          {skill ? <SkillIcon skillId={skill.id} size={SKILL_ICON} /> : null}
          <Flex vertical gap={0} style={SHRINK}>
            <Link to={muriasAuctionPath(row.name)} style={{ fontWeight: 600, lineHeight: 1.35 }}>
              {row.name}
            </Link>
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {RELIC_MAX_LEVEL}레벨 {formatRelicValue(row, row.max)}
              {row.verb ? ` ${row.verb}` : ''}, 매물 {formatNumber(row.count)}건
            </Text>
          </Flex>
        </Flex>
        {/*
          두 단. 왼쪽이 10~6, 오른쪽이 5~1 이다. 카드가 두 단을 담지 못하는 폭(휴대폰)에서는
          위아래로 쌓인다.
        */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(${LEVEL_COLUMN_MIN}px, 1fr))`,
            columnGap: LEVEL_COLUMN_GAP,
            rowGap: 8,
          }}
        >
          {blocks.map((block) => (
            <div key={block.label} role="list" aria-label={`${row.name} ${block.label} 최저가(골드)`}>
              {block.levels.map(levelRow)}
            </div>
          ))}
        </div>
      </Flex>
    </Card>
  );
}

/**
 * 아르카나 하나의 묶음. 아주 넓은 화면(1600px 이상)에서는 아르카나 그림과 이름을 왼쪽 칸에 두고
 * 옵션 카드를 오른쪽에 나란히 둔다. 이름을 위 머리 줄에 두면 묶음마다 한 줄씩 높아진다.
 * 그보다 좁으면 이름이 위로 올라간다. 왼쪽 칸이 폭을 먹으면 옵션 카드가 레벨 두 단을 담지 못해
 * 한 단 열 줄로 길어졌다. 옵션 카드는 두 단이 드는 폭(OPTION_CARD_MIN)을 지키며 한 줄에 셋까지
 * 놓이고, 폭이 모자라면 둘, 하나로 줄어든다. 휴대폰에서는 한 줄에 하나다.
 */
function ArcanaSection({
  group,
  wide,
  lastTrades,
  ideaPrice,
  listedOnly,
  onOpen,
}: {
  group: ArcanaGroup;
  wide: boolean;
  lastTrades: ReadonlyMap<string, (LastTrade | null)[]>;
  ideaPrice: number | null;
  listedOnly: boolean;
  onOpen: (row: MuriasRow, level: number) => void;
}) {
  const formatGold = useGoldFormatter();
  // 이 아르카나의 옵션을 10레벨로 모두 맞추는 데 드는 값. 10레벨 매물이 없는 옵션은 최종 거래가로 센다.
  // 매물도 거래 기록도 없는 옵션은 값을 몰라 뺀다.
  const top = RELIC_MAX_LEVEL - 1;
  const tenTotal = group.options.reduce((sum, option) => {
    const price = option.row.levels[top]?.lowest ?? lastTrades.get(option.row.key)?.[top]?.price;
    return sum + (price ?? 0);
  }, 0);
  const name = (
    <Text strong style={{ fontSize: 15 }}>
      {group.arcana?.name ?? '아르카나를 찾지 못한 옵션'}
    </Text>
  );
  const counts = (
    <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
      옵션 {formatNumber(group.options.length)}종, 매물 {formatNumber(group.count)}건
    </Text>
  );
  const total =
    tenTotal > 0 ? (
      <Text className="tnum" style={{ fontSize: 12, fontWeight: 600 }}>
        {RELIC_MAX_LEVEL}레벨 합계 {formatGold(tenTotal)}
      </Text>
    ) : null;
  // 이름 왼쪽 칸이 따로 있는 넓은 화면은 세 줄로 쌓아도 옵션 카드보다 키가 커지지 않는다. 그보다 좁으면 옵션 카드 위에
  // 한 줄을 차지하므로, 이름 오른쪽에 개수와 합계를 이어 붙여 아르카나 구획이 그만큼 높아지지 않게 한다.
  const title = wide ? (
    <Flex gap={10} align="center" vertical style={{ textAlign: 'center' }}>
      {group.arcana ? <SkillIcon skillId={group.arcana.awakening} size={ARCANA_ICON} /> : null}
      <Flex vertical gap={0} align="center">
        {name}
        {counts}
        {total}
      </Flex>
    </Flex>
  ) : (
    <Flex gap={10} align="center">
      {group.arcana ? <SkillIcon skillId={group.arcana.awakening} size={ARCANA_ICON} /> : null}
      <Flex align="baseline" wrap style={{ columnGap: 12, rowGap: 0 }}>
        {name}
        {counts}
        {total}
      </Flex>
    </Flex>
  );
  return (
    <Card variant="outlined" size="small">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: wide ? `${ARCANA_COLUMN}px minmax(0, 1fr)` : 'minmax(0, 1fr)',
          gap: 12,
          alignItems: 'center',
        }}
      >
        {title}
        {/* min(100%) 는 휴대폰처럼 카드 최소 폭보다 좁은 화면에서 격자가 밖으로 넘치지 않게 한다. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${OPTION_CARD_MIN}px, calc((100% - 16px) / 3))), 1fr))`,
            gap: 8,
          }}
        >
          {group.options.map((option) => (
            <OptionCard
              key={option.row.key}
              option={option}
              lastTrades={lastTrades.get(option.row.key)}
              ideaPrice={ideaPrice}
              listedOnly={listedOnly}
              onOpen={(level) => onOpen(option.row, level)}
            />
          ))}
        </div>
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
  scroll,
}: {
  groups: ArcanaGroup[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  /** 좁은 화면. 칩이 여러 줄로 넘치지 않고 한 줄에서 가로로 민다. */
  scroll: boolean;
}) {
  const arcanas = groups.flatMap((group) => (group.arcana ? [group.arcana] : []));
  if (arcanas.length === 0) return null;
  const buttonProps = (on: boolean) =>
    ({
      size: 'small',
      style: scroll ? { flex: '0 0 auto' } : undefined,
      color: on ? 'primary' : 'default',
      variant: on ? 'solid' : 'outlined',
      'aria-pressed': on,
    }) as const;
  return (
    <Flex vertical gap={4}>
      <Text strong style={{ fontSize: 13 }} id="relic-arcana-label">
        아르카나
      </Text>
      <Flex
        gap={6}
        wrap={!scroll}
        role="group"
        aria-labelledby="relic-arcana-label"
        style={scroll ? { overflowX: 'auto', paddingBottom: 4 } : undefined}
      >
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

/** "9월 25일". 최종 거래가가 언제 값인지 적는다. 한국 시각 기준이다. */
const tradeDayFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Seoul',
});
const tradeDay = (iso: string) => tradeDayFormat.format(new Date(iso));

/**
 * 본전 확률. 이데아를 열었을 때 이데아 최저가 이상이 나올 확률이다. 옵션과 레벨의 실제 확률이
 * 공개되지 않아 모두 똑같이 나온다고 본다(features/relics/prices.ts 의 ideaOdds).
 */
function IdeaOddsStat({ odds, ideaListed }: { odds: IdeaOdds | null; ideaListed: boolean }) {
  const title = '본전 확률';
  if (!ideaListed)
    return <Statistic title={title} value="이데아 매물 없음" styles={{ content: { fontSize: 16 } }} />;
  if (!odds) return <Statistic title={title} value="-" loading />;
  const percent = odds.known > 0 ? (odds.above / odds.known) * 100 : null;
  return (
    <Statistic
      title={title}
      value={percent === null ? '-' : `${percent.toFixed(1)}%`}
      styles={{ content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}
    />
  );
}

function MuriasView({ items }: { items: AuctionItem[] }) {
  const formatGold = useGoldFormatter();
  const screens = Grid.useBreakpoint();
  // 아르카나 이름을 왼쪽 칸에 두는 폭. 까닭은 ArcanaSection 에 있다.
  const wide = screens.xxl ?? true;
  const narrow = !(screens.md ?? true);
  const summary = useMemo(() => summarizeMurias(items), [items]);
  const arcanaQuery = useArcanaQuery();
  const groups = useMemo(
    () => groupByArcana(summary.rows, arcanaQuery.data?.arcanas ?? []),
    [summary.rows, arcanaQuery.data],
  );
  // 지금 매물이 없는 레벨에 적을 최종 거래가. 기록을 받지 못해도 나머지 화면은 그대로 쓴다.
  const tradesQuery = useOptionTradesQuery(MURIAS_RELIC_NAME, MURIAS_OPTION_TYPE);
  const lastTrades = useMemo(
    () => lastTradesByRow(tradesQuery.data?.trades ?? []),
    [tradesQuery.data],
  );
  const ideaPrice = summary.idea?.lowest ?? null;
  // 최종 거래가를 기다리는 동안 셈하면 값이 한 번 바뀌어 보인다. 받거나 실패한 뒤에 센다.
  const odds =
    ideaPrice !== null && !tradesQuery.isLoading
      ? ideaOdds(summary.rows, lastTrades, ideaPrice)
      : null;

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

  const [query, setQuery] = useQueryTextParam('q');
  const needle = normalizeForSearch(query);
  // 매물 있는 것만 보기. 고른 것은 주소에 남아 새로 고쳐도 그대로다.
  const listedOnly = params.get('listed') === '1';
  const setListedOnly = (on: boolean) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (on) next.set('listed', '1');
        else next.delete('listed');
        return next;
      },
      { replace: true },
    );
  // 레벨 칸을 눌러 연 거래가 추이 창.
  const [trend, setTrend] = useState<{ row: MuriasRow; level: number } | null>(null);
  // 옵션 이름이나 아르카나 이름에 들어 있으면 남긴다. "블래스트" 로 치면 그 아르카나가 통째로 남는다.
  const shown = groups
    .filter((group) => selected === null || group.arcana?.id === selected)
    .map((group) => ({
      ...group,
      options: (needle && !normalizeForSearch(group.arcana?.name ?? '').includes(needle)
        ? group.options.filter((option) => normalizeForSearch(option.row.name).includes(needle))
        : group.options
      ).filter((option) => !listedOnly || option.row.levels.some(Boolean)),
    }))
    .filter((group) => group.options.length > 0);

  return (
    <Flex vertical gap={16} style={SHRINK}>
      <Card variant="outlined">
        {/* 네 칸. 768px 미만에서는 2x2 로 둔다. 한 칸씩 쌓으면 요약만으로 한 화면을 다 차지했다. */}
        <Row gutter={[16, 16]} align="top">
          <Col xs={12} md={6}>
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
          <Col xs={12} md={6}>
            <Statistic
              title="스킬 옵션"
              value={formatNumber(summary.rows.length)}
              suffix="종"
              styles={{ content: { fontVariantNumeric: 'tabular-nums' } }}
            />
          </Col>
          <Col xs={12} md={6}>
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
          <Col xs={12} md={6}>
            <IdeaOddsStat odds={odds} ideaListed={ideaPrice !== null} />
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
          <ArcanaPicker groups={groups} selected={selected} onSelect={select} scroll={narrow} />
          <Flex gap={16} wrap align="flex-end" justify="space-between">
            <NameFilter
              id="relic-option-filter"
              label="스킬 이름으로 좁히기"
              value={query}
              onChange={setQuery}
              placeholder="예: 오버 드라이브"
            />
            <Flex gap={8} align="center">
              <Switch id="relic-listed-only" checked={listedOnly} onChange={setListedOnly} />
              <label htmlFor="relic-listed-only" className="no-select">
                매물 있는 것만 보기
              </label>
            </Flex>
          </Flex>
          {shown.length === 0 ? (
            <EmptyState
              variant="search"
              description={`이름에 "${query.trim()}" 이 들어간 옵션이 없습니다. 스킬 이름 일부만 넣거나 아르카나를 전체로 바꿔 보세요.`}
            />
          ) : (
            shown.map((group) => (
              <ArcanaSection
                key={group.arcana?.id ?? 'unknown'}
                group={group}
                wide={wide}
                lastTrades={lastTrades}
                ideaPrice={ideaPrice}
                listedOnly={listedOnly}
                onOpen={(row, level) => setTrend({ row, level })}
              />
            ))
          )}
        </>
      )}
      {trend ? (
        <RelicTrendModal
          key={trend.row.key}
          row={trend.row}
          level={trend.level}
          lastTrades={lastTrades.get(trend.row.key)}
          onClose={() => setTrend(null)}
        />
      ) : null}
    </Flex>
  );
}

function OthersView({ items }: { items: AuctionItem[] }) {
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const allRows = useMemo(() => summarizeOtherRelics(items), [items]);
  const [query, setQuery] = useQueryTextParam('q');
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
  // 아르카나 파일과 최종 거래가는 매물과 상관없이 받을 수 있다. 무리아스 표가 그려진 뒤에
  // 부르면 매물, 아르카나, 거래가를 차례로 기다리게 되어 화면을 열자마자 함께 부른다.
  // 같은 조회라 표 안에서 다시 불러도 한 번만 나간다.
  useArcanaQuery();
  useOptionTradesQuery(MURIAS_RELIC_NAME, MURIAS_OPTION_TYPE, canQuery);

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
          <Flex gap={6} align="center" wrap style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {snapshotAgeLabel(listings.at)} 받은 판매 중 매물{' '}
              {formatNumber(listings.items.length)}건 기준입니다. 게임 데이터는 평균 10분
              지연됩니다.
            </Text>
            {listings.refreshing ? (
              <Flex gap={4} align="center" role="status">
                <Spin size="small" />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  새 매물을 받는 중입니다.
                </Text>
              </Flex>
            ) : null}
          </Flex>
        ) : null}
      </Flex>

      {body}
    </Flex>
  );
}
