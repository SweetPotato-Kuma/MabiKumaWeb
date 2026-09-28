import { memo, useDeferredValue, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Flex,
  Grid,
  InputNumber,
  Popover,
  Row,
  Select,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { SkillIcon } from '@/components/crafting/RecipeInfo';
import { ItemIcon } from '@/components/ItemIcon';
import { CalculateIcon, CloseIcon, InfoIcon, ResetIcon, StarFillIcon } from '@/components/icons';
import { TrialCountInput, TrialOdds } from '@/components/simulator/TrialOdds';
import {
  skillOfOption,
  useArcanaQuery,
  type Arcana,
  type ArcanaSkill,
} from '@/features/relics/arcana';
import {
  formatRelicValue,
  muriasAuctionPath,
  RELIC_LEVELS,
  RELIC_MAX_LEVEL,
  relicValueAt,
} from '@/features/relics/murias';
import type { RelicPriceState } from '@/features/relics/priceFile';
import {
  drawPrice,
  meetsRelicTarget,
  MURIAS_RELIC_POOL,
  RELIC_OUTCOMES,
  relicTargetChance,
  type DrawPrice,
  type RelicDraw,
  type RelicPoolEntry,
  type RelicSimulator as Simulator,
  type RelicTarget,
} from '@/features/relics/simulator';
import { snapshotAgeLabel } from '@/features/auction/snapshot';
import { formatEstimatedChance, sumAtLeastChance } from '@/features/simulator/breakEven';
import { formatChance } from '@/features/simulator/trials';
import { formatGold, formatGoldShort, formatNumber } from '@/lib/format';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import './relicFx.css';

const { Text } = Typography;

/** 방금 나온 유물 칸의 스킬 그림. */
const DETAIL_ICON = 64;
/** 기록 표의 스킬 그림. */
const ROW_ICON = 24;
/** 기록 표 한 쪽의 줄 수. */
const PAGE_SIZE = 20;

/** 시세를 받는 중, 받았음, 받을 수 없음. */
type PriceState = RelicPriceState['status'];

/** 결과 하나를 그릴 때 필요한 것. 값은 시세를 받기 전이거나 모르면 null. */
interface PricedDraw extends RelicDraw {
  price: DrawPrice | null;
  found: { arcana: Arcana; skill: ArcanaSkill } | null;
}

/** "490% 증가". 레벨의 수치와 증감 말. */
const valueText = (option: RelicPoolEntry, level: number) =>
  `${formatRelicValue(option, relicValueAt(option, level))}${option.verb ? ` ${option.verb}` : ''}`;

/**
 * 레벨. 10레벨은 액센트 색과 별로 가른다. 색만으로 가르지 않게 별 그림이 함께 붙는다.
 */
function LevelLabel({ level, size = 13 }: { level: number; size?: number }) {
  const { token } = theme.useToken();
  const top = level === RELIC_MAX_LEVEL;
  return (
    <Flex gap={2} align="center" style={{ whiteSpace: 'nowrap' }}>
      {top ? (
        <StarFillIcon aria-hidden style={{ color: token.colorPrimary, fontSize: size }} />
      ) : null}
      <Text
        className="tnum"
        strong={top}
        style={{ fontSize: size, color: top ? token.colorPrimary : undefined }}
      >
        {level}레벨
      </Text>
    </Flex>
  );
}

/** 이데아 최저가 이상인 결과인지. 복원한 값보다 비싼 것이 나온 것이다. */
const isAboveIdea = (price: DrawPrice | null, ideaPrice: number | null) =>
  ideaPrice !== null && price !== null && price.price >= ideaPrice;

/**
 * 값 한 칸. 지금 최저가는 본문색, 매물이 없어 최종 거래가를 쓴 것은 흐리게 "최종" 을 붙인다.
 * 이데아 최저가 이상이면 굵은 빨강으로 적는다. 색만으로 가르지 않게 카드와 표에 글자 표시가 함께 붙는다.
 */
function PriceText({
  price,
  ideaPrice,
  state,
}: {
  price: DrawPrice | null;
  ideaPrice: number | null;
  state: PriceState;
}) {
  const { token } = theme.useToken();
  if (state !== 'ready')
    return (
      <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {state === 'loading' ? '시세 받는 중' : '-'}
      </Text>
    );
  if (!price)
    return (
      <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        기록 없음
      </Text>
    );
  const above = isAboveIdea(price, ideaPrice);
  const trade = price.source === 'trade';
  return (
    <Text
      type={trade && !above ? 'secondary' : undefined}
      className="tnum"
      title={trade ? `최종 거래가 ${formatGold(price.price)}` : formatGold(price.price)}
      style={{
        whiteSpace: 'nowrap',
        fontWeight: above ? 700 : undefined,
        color: above ? token.colorError : undefined,
      }}
    >
      {formatGoldShort(price.price)}
      {trade ? ' 최종' : ''}
    </Text>
  );
}

/** 이데아 최저가 이상 표시. 빨간 색에 더해 글자로도 알린다. */
function IdeaTag() {
  return (
    <Tag color="error" variant="solid" style={{ marginInlineEnd: 0, whiteSpace: 'nowrap' }}>
      이데아 이상
    </Tag>
  );
}

/** 옵션 이름. 누르면 경매장에서 그 옵션 그 레벨의 매물을 본다. */
function OptionName({ draw }: { draw: PricedDraw }) {
  return (
    <Link
      to={muriasAuctionPath(draw.option.name, draw.level)}
      style={{ fontWeight: 600, lineHeight: 1.35 }}
    >
      {draw.option.name}
    </Link>
  );
}

/** 복원 연출 한 번의 길이와 원판 도는 각도, 모여드는 빛 조각과 본전 금빛 빛살 수. */
const FX_DURATION = 1300;
const FX_SPIN = 360;
const MOTES = 10;
const GOLD_RAYS = 16;
/** 본전 금빛 때문에 결과를 늦게 드러내는 시간. */
const GOLD_EXTRA_MS = 500;
/** "연출 끄기" 를 이 브라우저에 기억해 두는 자리. */
const FX_STORAGE_KEY = 'mabikuma:relicFx';
/** 이데아 그림을 찾는 경매장 카테고리와 이름. */
const IDEA_ICON = ['유물', '무리아스의 유물(이데아)'] as const;

function readFxSetting(): boolean {
  try {
    return window.localStorage.getItem(FX_STORAGE_KEY) !== 'off';
  } catch {
    // 시크릿 모드 등 localStorage 접근이 막힌 환경
    return true;
  }
}

function writeFxSetting(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(FX_STORAGE_KEY);
    else window.localStorage.setItem(FX_STORAGE_KEY, 'off');
  } catch {
    // 저장하지 못해도 이번 방문 동안은 고른 대로 간다.
  }
}

const angles = (count: number) =>
  Array.from({ length: count }, (_, index) => (360 / count) * index);

/**
 * 복원 작업대. 룬 원판 가운데 칸에 이데아가 놓이고, 복원하면 나온 유물의 스킬 그림으로 바뀐다.
 * play 가 바뀌면 판을 새로 그려 연출을 처음부터 돌린다.
 */
function RestoreBench({
  result,
  play,
  gold,
  iconSize,
  fxStyle,
}: {
  /** 가운데 칸에 놓인 결과. 아직 복원하지 않았으면 null 이고 이데아가 놓인다. */
  result: PricedDraw | null;
  /** 연출할 복원의 번호. 연출하지 않으면 null. */
  play: number | null;
  /** 연출할 복원이 이데아 최저가 이상인지. 맞으면 금빛이 번쩍인다. */
  gold: boolean;
  iconSize: number;
  fxStyle: CSSProperties;
}) {
  const idea = (
    <div className="rl-idea">
      <ItemIcon category={IDEA_ICON[0]} name={IDEA_ICON[1]} size={iconSize} />
      <Text type="secondary" style={{ fontSize: 11 }}>
        이데아
      </Text>
    </div>
  );
  const shown = result ? (
    <div className="rl-result">
      {result.found ? <SkillIcon skillId={result.found.skill.id} size={iconSize} /> : null}
      <LevelLabel level={result.level} size={12} />
    </div>
  ) : null;
  return (
    <div
      key={play ?? 'still'}
      className={`rl-stage${play !== null ? ` rl-play${gold ? ' rl-gold' : ''}` : ''}`}
      style={fxStyle}
      aria-hidden
    >
      <div className="rl-ring" />
      <div className="rl-ring rl-ring--inner" />
      <div className="rl-ring rl-ring--core" />
      {play !== null && gold ? (
        <div className="rl-gold-layer">
          <div className="rl-gold-flash" />
          {angles(GOLD_RAYS).map((angle, index) => (
            <span
              key={angle}
              className="rl-gold-ray"
              style={{ '--a': `${angle}deg`, '--i': index } as CSSProperties}
            />
          ))}
        </div>
      ) : null}
      <div className="rl-flash" />
      <div className="rl-slot">
        {play !== null ? (
          <>
            {idea}
            {shown}
          </>
        ) : (
          (shown ?? idea)
        )}
      </div>
      {play !== null
        ? angles(MOTES).map((angle, index) => (
            <StarFillIcon
              key={angle}
              aria-hidden
              className="rl-mote"
              style={{ '--a': `${angle}deg`, '--i': index } as CSSProperties}
            />
          ))
        : null}
    </div>
  );
}

/** 방금 나온 유물 하나를 크게. 한 번 복원했을 때 오른쪽 칸을 채운다. */
function ResultDetail({
  draw,
  ideaPrice,
  state,
}: {
  draw: PricedDraw;
  ideaPrice: number | null;
  state: PriceState;
}) {
  const above = state === 'ready' && isAboveIdea(draw.price, ideaPrice);
  return (
    <Flex vertical gap={12}>
      <Flex className="rl-line" gap={12} align="center" style={{ '--i': 0 } as CSSProperties}>
        {draw.found ? <SkillIcon skillId={draw.found.skill.id} size={DETAIL_ICON} /> : null}
        <Flex vertical gap={2} style={{ minWidth: 0 }}>
          <span style={{ fontSize: 18 }}>
            <OptionName draw={draw} />
          </span>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {draw.found?.arcana.name ?? '아르카나 정보 없음'}
          </Text>
        </Flex>
      </Flex>
      <Flex
        className="rl-line"
        gap={10}
        align="baseline"
        wrap
        style={{ '--i': 1 } as CSSProperties}
      >
        <LevelLabel level={draw.level} size={22} />
        <Text className="tnum" style={{ fontSize: 20, whiteSpace: 'nowrap' }}>
          {valueText(draw.option, draw.level)}
        </Text>
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          최대 {formatRelicValue(draw.option, draw.option.max)}
        </Text>
      </Flex>
      <Flex className="rl-line" gap={8} align="center" style={{ '--i': 2 } as CSSProperties}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          시세
        </Text>
        <span style={{ fontSize: 18 }}>
          <PriceText price={draw.price} ideaPrice={ideaPrice} state={state} />
        </span>
        {above ? <IdeaTag /> : null}
      </Flex>
    </Flex>
  );
}

/** 여러 번 복원했을 때 방금 나온 것들. 한 줄에 하나, 먼저 나온 것이 아래다. */
function ResultList({
  draws,
  ideaPrice,
  state,
}: {
  draws: PricedDraw[];
  ideaPrice: number | null;
  state: PriceState;
}) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={2}>
      {draws.map((draw, index) => {
        const above = state === 'ready' && isAboveIdea(draw.price, ideaPrice);
        return (
          <Flex
            key={draw.no}
            className="rl-line"
            gap={8}
            align="center"
            style={
              {
                '--i': index,
                padding: '4px 6px',
                borderRadius: token.borderRadiusSM,
                background: above ? token.colorErrorBg : undefined,
              } as CSSProperties
            }
          >
            {draw.found ? <SkillIcon skillId={draw.found.skill.id} size={ROW_ICON} /> : null}
            <div style={{ flex: 1, minWidth: 0 }}>
              <OptionName draw={draw} />
            </div>
            <LevelLabel level={draw.level} />
            <div style={{ width: 96, textAlign: 'right' }}>
              <PriceText price={draw.price} ideaPrice={ideaPrice} state={state} />
            </div>
          </Flex>
        );
      })}
    </Flex>
  );
}

/** 제목 옆 설명 그림. 올리거나 키보드로 닿으면 풀어 쓴 설명이 뜬다. */
function StatTitle({ label, detail }: { label: string; detail: string }) {
  return (
    <Flex gap={4} align="center">
      {label}
      <Tooltip title={detail}>
        <InfoIcon aria-label={detail} tabIndex={0} style={{ cursor: 'help' }} />
      </Tooltip>
    </Flex>
  );
}

/** 시세가 언제 것인지, 받는 중인지. 게임 데이터 지연 고지를 함께 적는다. */
function PriceFreshness({ prices }: { prices: RelicPriceState }) {
  const note = (text: string) => (
    <Text type="secondary" style={{ fontSize: 12 }}>
      {text}
    </Text>
  );
  if (prices.status === 'loading')
    return (
      <Flex gap={6} align="center" role="status">
        <Spin size="small" />
        {note('시세를 받는 중입니다. 뽑기는 기다리지 않고 됩니다.')}
      </Flex>
    );
  if (prices.status === 'off')
    return note(
      prices.error
        ? '시세를 받지 못했습니다. 뽑기는 그대로 되고, 시세 칸만 비어 있습니다.'
        : '지금은 시세를 받을 수 없습니다. 뽑기는 그대로 되고, 시세 칸만 비어 있습니다.',
    );
  return (
    <Flex gap={6} align="center" wrap>
      {note(
        `${snapshotAgeLabel(prices.prices.at)} 모은 경매장 시세입니다. 게임 데이터는 평균 10분 지연됩니다.`,
      )}
      {prices.refreshing ? (
        <Flex gap={4} align="center" role="status">
          <Spin size="small" />
          {note('새 시세를 받는 중입니다.')}
        </Flex>
      ) : null}
    </Flex>
  );
}

/**
 * 복원 기록 표. 기록이 쌓일수록 그리는 데 오래 걸려, 방금 나온 유물 카드보다 한 박자 늦게 그린다
 * (rows 는 useDeferredValue 로 늦춘 값이다). 같은 rows 면 다시 그리지 않는다.
 */
const HistoryTable = memo(function HistoryTable({
  rows,
  ideaPrice,
  state,
}: {
  rows: PricedDraw[];
  ideaPrice: number | null;
  state: PriceState;
}) {
  const { token } = theme.useToken();
  const columns: TableColumnsType<PricedDraw> = [
    {
      title: '번째',
      dataIndex: 'no',
      width: 64,
      align: 'right',
      render: (no: number) => <span className="tnum">{formatNumber(no)}</span>,
    },
    {
      title: '옵션',
      key: 'option',
      render: (_value, draw) => (
        <Flex gap={8} align="center">
          {draw.found ? <SkillIcon skillId={draw.found.skill.id} size={ROW_ICON} /> : null}
          <Flex vertical gap={0} style={{ minWidth: 0 }}>
            <OptionName draw={draw} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {draw.found?.arcana.name ?? '아르카나 정보 없음'}
            </Text>
          </Flex>
        </Flex>
      ),
    },
    {
      title: '레벨',
      dataIndex: 'level',
      width: 88,
      align: 'right',
      sorter: (a, b) => a.level - b.level,
      render: (level: number) => (
        <Flex justify="flex-end">
          <LevelLabel level={level} />
        </Flex>
      ),
    },
    {
      title: '수치',
      key: 'value',
      width: 120,
      align: 'right',
      render: (_value, draw) => (
        <Flex vertical gap={0} align="flex-end">
          <span className="tnum" style={{ whiteSpace: 'nowrap' }}>
            {valueText(draw.option, draw.level)}
          </span>
          <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            최대 {formatRelicValue(draw.option, draw.option.max)}
          </Text>
        </Flex>
      ),
    },
    {
      title: '시세',
      key: 'price',
      width: 128,
      align: 'right',
      sorter: (a, b) => (a.price?.price ?? -1) - (b.price?.price ?? -1),
      render: (_value, draw) => (
        <Flex vertical gap={2} align="flex-end">
          <PriceText price={draw.price} ideaPrice={ideaPrice} state={state} />
          {state === 'ready' && isAboveIdea(draw.price, ideaPrice) ? <IdeaTag /> : null}
        </Flex>
      ),
    },
  ];

  return (
    <Table<PricedDraw>
      columns={columns}
      dataSource={rows}
      rowKey="no"
      size="small"
      // 이데아 최저가 이상인 줄은 빨갛게 깐다. 시세 칸에 글자 표시도 함께 붙는다.
      onRow={(draw) =>
        state === 'ready' && isAboveIdea(draw.price, ideaPrice)
          ? { style: { background: token.colorErrorBg } }
          : {}
      }
      pagination={
        rows.length > PAGE_SIZE
          ? { pageSize: PAGE_SIZE, showSizeChanger: false, size: 'small' }
          : false
      }
      scroll={{ x: 'max-content' }}
      locale={{ emptyText: '아직 복원하지 않았습니다.' }}
    />
  );
});

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

/**
 * 무리아스의 유물(이데아) 복원 시뮬레이터. 세공 창처럼 왼쪽 작업대에서 이데아를 복원하고 오른쪽에
 * 방금 나온 유물을 크게 보인다. 옵션과 레벨은 고르게 뽑고, 골드도 아이템도 들지 않는다. 나온 유물에는
 * 지금 시세를 붙인다. 시세는 워커가 모아 둔 작은 파일에서 오고(priceFile.ts), 받지 못해도 복원은 된다.
 */
export function RelicSimulatorView({
  simulator,
  prices,
}: {
  simulator: Simulator;
  /** 시세. 받지 못해도 뽑기는 된다. */
  prices: RelicPriceState;
}) {
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();
  const reducedMotion = usePrefersReducedMotion();
  const arcanaQuery = useArcanaQuery();
  const arcanas = arcanaQuery.data?.arcanas;

  // 옵션마다 스킬과 아르카나. 옵션은 30가지뿐이라 한 번에 찾아 둔다.
  const foundByName = useMemo(
    () =>
      new Map(
        MURIAS_RELIC_POOL.map((option) => [option.name, skillOfOption(option.name, arcanas ?? [])]),
      ),
    [arcanas],
  );
  const ready = prices.status === 'ready' ? prices.prices : null;
  const priced = useMemo(
    () =>
      simulator.draws.map((draw): PricedDraw => ({
        ...draw,
        price: ready ? drawPrice(draw, ready) : null,
        found: foundByName.get(draw.option.name) ?? null,
      })),
    [simulator.draws, ready, foundByName],
  );

  const state = prices.status;
  const loading = state === 'loading';
  const ideaPrice = ready?.ideaPrice ?? null;
  const count = priced.length;
  const latest = priced.slice(count - simulator.lastBatch).reverse();
  const last = priced[count - 1] ?? null;
  const history = useMemo(() => [...priced].reverse(), [priced]);
  // 표는 복원 창보다 늦게 그린다. 누르자마자 창에 결과와 시세가 먼저 뜬다.
  const settledHistory = useDeferredValue(history);

  const stats = useMemo(() => {
    let top = 0;
    let known = 0;
    let total = 0;
    let above = 0;
    for (const draw of priced) {
      if (draw.level === RELIC_MAX_LEVEL) top += 1;
      if (!draw.price) continue;
      known += 1;
      total += draw.price.price;
      if (ideaPrice !== null && draw.price.price >= ideaPrice) above += 1;
    }
    return { top, known, total, above };
  }, [priced, ideaPrice]);

  /**
   * 본전 확률. 한 번 복원해 이데아 최저가 이상이 나올 확률이다. 모든 옵션과 레벨이 똑같이 나온다는
   * 이 화면의 가정 아래에서, 시세를 아는 결과 가운데 이데아 최저가 이상인 결과의 비율이다. values 는
   * 시세를 아는 결과 하나하나의 값으로, n 번 복원한 합을 셀 때 쓴다.
   */
  const ideaChance = useMemo(() => {
    if (!ready || ideaPrice === null) return null;
    const values: number[] = [];
    let above = 0;
    for (const option of MURIAS_RELIC_POOL) {
      for (const level of RELIC_LEVELS) {
        const price = drawPrice({ option, level }, ready);
        if (!price) continue;
        values.push(price.price);
        if (price.price >= ideaPrice) above += 1;
      }
    }
    if (values.length === 0) return null;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { chance: above / values.length, above, known: values.length, values, mean };
  }, [ready, ideaPrice]);

  // 연출. 한 번 복원했을 때만 돌리고, 누를 때 걸어 둔다(끈 채 복원한 뒤 켜도 지난 연출이 돌지 않게).
  const [fxOn, setFxOn] = useState(readFxSetting);
  const animate = fxOn && !reducedMotion;
  const [armed, setArmed] = useState(false);
  const restore = (times: number) => {
    setArmed(animate);
    simulator.draw(times);
  };
  const play = armed && animate && simulator.lastBatch === 1 && last ? last.no : null;
  const playGold =
    play !== null && last !== null && state === 'ready' && isAboveIdea(last.price, ideaPrice);
  const reveal = armed && animate && simulator.lastBatch > 0 && last ? last.no : null;

  // 작업대 배율. 휴대폰 폭에서는 원래 크기이고 넓을수록 키운다. 연출도 같은 배율로 커진다.
  const stageScale = screens.xl ? 1.45 : screens.lg ? 1.3 : screens.md ? 1.15 : 1;
  const fxStyle = {
    '--fx-accent': token.colorPrimary,
    '--fx-soft': token.colorPrimaryBg,
    '--fx-line': token.colorBorder,
    '--fx-surface': token.colorFillQuaternary,
    // 본전 금빛. 세공의 한계 돌파 빛과 같은 금색 토큰이다.
    '--fx-gold': token.gold,
    '--fx-dur': `${play !== null ? FX_DURATION : 0}ms`,
    '--fx-spin': `${FX_SPIN}deg`,
    '--fx-extra': playGold ? `${GOLD_EXTRA_MS}ms` : '0ms',
    '--rf': stageScale,
  } as CSSProperties;

  /**
   * 특정 유물 기댓값 계산기. 떠 있는 창에 둔다. 창 밖을 눌러도 닫히지 않아, 열어 둔 채 복원을
   * 이어 하며 그 유물이 몇 번 나왔는지 본다. 단추를 다시 누르거나 닫기를 누르면 닫힌다.
   * 맨 위 시행 횟수 하나를 본전과 특정 유물이 같이 쓴다.
   */
  const [calcOpen, setCalcOpen] = useState(false);
  const [trials, setTrials] = useState(10);
  const [target, setTarget] = useState<RelicTarget | null>(null);
  const targetChance = target ? relicTargetChance(target) : 0;
  const targetHits = useMemo(
    () => (target ? simulator.draws.filter((draw) => meetsRelicTarget(draw, target)).length : 0),
    [simulator.draws, target],
  );
  // n 번 복원한 유물의 시세 합이 이데아 n 개 최저가 이상일 확률. 창을 열었을 때만 센다.
  const breakEven = useMemo(
    () =>
      calcOpen && ideaChance && ideaPrice !== null
        ? sumAtLeastChance(ideaChance.values, trials, ideaPrice)
        : null,
    [calcOpen, ideaChance, ideaPrice, trials],
  );

  const calculator = (
    <Flex vertical gap={10} style={{ width: 'min(440px, calc(100vw - 88px))' }}>
      <TrialCountInput value={trials} onChange={setTrials} />
      {breakEven !== null && ideaChance && ideaPrice !== null ? (
        <section aria-label="본전">
          <Flex gap={8} align="center" wrap>
            <Text strong>본전</Text>
            <Text className="tnum" style={{ fontSize: 13 }}>
              본전 이상 얻을 확률 <Text strong>{formatEstimatedChance(breakEven)}</Text>, 평균 얻는
              금액 <Text strong>{formatGoldShort(ideaChance.mean * trials)}</Text> (이데아{' '}
              {formatGoldShort(ideaPrice * trials)})
            </Text>
            <Tooltip
              title={`복원한 유물 ${formatNumber(trials)}개의 시세 합이 이데아 ${formatNumber(trials)}개 최저가 합 이상일 확률입니다. 옵션과 레벨이 모두 똑같이 나온다고 보고, 시세를 아는 결과 ${formatNumber(ideaChance.known)}개로 셉니다. 2,000번까지는 여러 번 뽑아 보고, 그보다 많으면 정규분포로 어림합니다.`}
            >
              <InfoIcon aria-label="본전 계산 방법" tabIndex={0} style={{ cursor: 'help' }} />
            </Tooltip>
          </Flex>
        </section>
      ) : null}
      <Divider style={{ margin: 0 }} />
      <Flex gap={8} align="center" wrap>
        <Select<number>
          aria-label="특정 유물 옵션"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="예: 오버 드라이브 폭발 공격 대미지"
          value={target?.option ?? null}
          onChange={(option) =>
            setTarget(
              option === undefined || option === null
                ? null
                : { option, minLevel: target?.minLevel ?? RELIC_MAX_LEVEL },
            )
          }
          options={MURIAS_RELIC_POOL.map((option, index) => ({ value: index, label: option.name }))}
          popupMatchSelectWidth={false}
          style={{ flex: '1 1 220px', minWidth: 0 }}
        />
        <InputNumber<number>
          aria-label="특정 유물의 가장 낮은 레벨"
          min={1}
          max={RELIC_MAX_LEVEL}
          value={target?.minLevel ?? RELIC_MAX_LEVEL}
          disabled={!target}
          onChange={(level) => {
            if (level === null || !target) return;
            setTarget({
              ...target,
              minLevel: Math.min(Math.max(Math.round(level), 1), RELIC_MAX_LEVEL),
            });
          }}
          suffix="레벨 이상"
          className="tnum"
          style={{ width: 120 }}
        />
      </Flex>
      {target ? (
        <>
          <Text className="tnum" style={{ fontSize: 13 }}>
            한 번에 <Text strong>{formatChance(targetChance)}</Text>, 평균{' '}
            <Text strong>{formatNumber(Math.ceil(1 / targetChance))}번</Text>에 한 번
            {count > 0 ? `, 지금까지 ${formatNumber(targetHits)}번` : ''}
          </Text>
          <TrialOdds
            framed={false}
            trials={trials}
            chance={targetChance}
            verb="복원"
            costPerTrial={ideaPrice}
            note="옵션과 레벨이 모두 똑같이 나온다고 본 확률입니다. 골드는 이데아 최저가 기준입니다."
          />
        </>
      ) : null}
    </Flex>
  );

  const lastAbove = last !== null && state === 'ready' && isAboveIdea(last.price, ideaPrice);
  const single = simulator.lastBatch <= 1;

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined" role="region" aria-label="복원 창">
        {/*
          작업대와 방금 나온 유물 두 칸. 768px 미만에서는 위아래로 쌓는다. 오른쪽 칸은 높이를 정해 두어
          한 번과 10번을 오가도 창이 늘고 줄지 않는다.
        */}
        <Row gutter={[24, 20]} align="stretch">
          <Col xs={24} md={10} xl={9}>
            <Flex vertical gap={12} align="center">
              <Flex gap={4} align="center">
                <Text strong style={{ fontSize: 16 }}>
                  무리아스의 유물(이데아)
                </Text>
                <Tooltip
                  title={`옵션 ${formatNumber(MURIAS_RELIC_POOL.length)}종과 1~${RELIC_MAX_LEVEL}레벨이 모두 똑같이 나온다고 보고 뽑습니다(결과 하나 1/${formatNumber(RELIC_OUTCOMES)}). 실제 확률은 공개되지 않았고, 골드나 아이템은 들지 않습니다.`}
                >
                  <InfoIcon aria-label="뽑는 방식" tabIndex={0} style={{ cursor: 'help' }} />
                </Tooltip>
              </Flex>
              <RestoreBench
                result={last}
                play={play}
                gold={playGold}
                iconSize={Math.round(48 * stageScale)}
                fxStyle={fxStyle}
              />
              <Button
                type="primary"
                size="large"
                onClick={() => restore(1)}
                style={{ minWidth: 200 }}
              >
                복원하기
              </Button>
              <Flex gap={8} align="center">
                <Switch
                  checked={fxOn && !reducedMotion}
                  disabled={reducedMotion}
                  onChange={(on) => {
                    setFxOn(on);
                    setArmed(false);
                    writeFxSetting(on);
                  }}
                  aria-label="복원 연출"
                />
                <Text style={{ fontSize: 13 }}>복원 연출</Text>
              </Flex>
              <Flex gap={8} wrap justify="center">
                <Button onClick={() => restore(10)}>10번 복원</Button>
                <Popover
                  open={calcOpen}
                  trigger={[]}
                  placement="bottomLeft"
                  title={
                    <Flex justify="space-between" align="center" gap={8}>
                      <span>특정 유물 기댓값</span>
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseIcon />}
                        aria-label="특정 유물 기댓값 닫기"
                        onClick={() => setCalcOpen(false)}
                      />
                    </Flex>
                  }
                  content={calculator}
                >
                  <Button
                    icon={<CalculateIcon />}
                    aria-expanded={calcOpen}
                    onClick={() => setCalcOpen(!calcOpen)}
                  >
                    특정 유물 기댓값
                  </Button>
                </Popover>
                <Button icon={<ResetIcon />} onClick={simulator.reset} disabled={count === 0}>
                  처음부터
                </Button>
              </Flex>
            </Flex>
          </Col>
          <Col xs={24} md={14} xl={15}>
            <section
              aria-labelledby="relic-sim-latest"
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 320,
                maxHeight: 520,
                overflowY: 'auto',
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                background: token.colorFillQuaternary,
                padding: 16,
              }}
            >
              {/*
                이데아 이상이면 칸을 빨갛게 깐다. 결과가 드러나는 순간에 켜야 한다. 누르자마자 켜면
                연출이 끝나기 전에 결과를 알려 버린다.
              */}
              {single && lastAbove ? (
                <div
                  key={reveal ?? 'still'}
                  aria-hidden
                  className={reveal !== null ? 'rl-hit rl-hit--delay' : 'rl-hit'}
                  style={
                    {
                      ...fxStyle,
                      border: `2px solid ${token.colorError}`,
                      background: token.colorErrorBg,
                      borderRadius: token.borderRadius,
                    } as CSSProperties
                  }
                />
              ) : null}
              <Text
                strong
                id="relic-sim-latest"
                style={{ display: 'block', marginBottom: 12, position: 'relative' }}
              >
                방금 나온 유물
                {simulator.lastBatch > 1 ? ` ${formatNumber(simulator.lastBatch)}개` : ''}
              </Text>
              {last === null ? (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  아직 복원하지 않았습니다.
                </Text>
              ) : (
                <div
                  key={reveal ?? 'still'}
                  className={reveal !== null ? 'rl-reveal' : undefined}
                  style={
                    {
                      ...fxStyle,
                      position: 'relative',
                      // 한 번 복원한 결과는 칸 가운데에 크게 둔다.
                      flex: single ? 1 : undefined,
                      display: single ? 'flex' : undefined,
                      alignItems: single ? 'center' : undefined,
                      justifyContent: single ? 'center' : undefined,
                    } as CSSProperties
                  }
                >
                  {single ? (
                    <ResultDetail draw={last} ideaPrice={ideaPrice} state={state} />
                  ) : (
                    <ResultList draws={latest} ideaPrice={ideaPrice} state={state} />
                  )}
                </div>
              )}
            </section>
          </Col>
        </Row>

        <Divider style={{ marginBlock: 16 }} />

        <Flex vertical gap={14}>
          {ideaChance ? (
            <Flex gap={6} align="center">
              <Text strong>본전 확률</Text>
              <Text strong className="tnum" style={{ fontSize: 16 }}>
                {formatChance(ideaChance.chance)}
              </Text>
              <Tooltip
                title={`본전은 이데아 최저가 이상이 나오는 것입니다. 시세를 아는 결과 ${formatNumber(ideaChance.known)}개 가운데 ${formatNumber(ideaChance.above)}개입니다.`}
              >
                <InfoIcon aria-label="본전 확률 기준" tabIndex={0} style={{ cursor: 'help' }} />
              </Tooltip>
            </Flex>
          ) : null}
          {/* 네 칸. 768px 미만에서는 두 칸씩 두 줄로 떨어진다. */}
          <Row gutter={[24, 16]} align="top">
            <Col xs={12} md={6}>
              <Statistic title="복원" value={formatNumber(count)} suffix="번" styles={NUMERIC} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={`${RELIC_MAX_LEVEL}레벨`}
                value={formatNumber(stats.top)}
                suffix="번"
                styles={NUMERIC}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={
                  <StatTitle
                    label="이데아 최저가 이상"
                    detail={
                      ideaPrice === null
                        ? '이데아 매물이 없거나 시세를 아직 받지 못해 견줄 수 없습니다.'
                        : `나온 유물의 시세가 이데아 최저가 ${formatGold(ideaPrice)} 이상인 횟수입니다. 시세를 아는 ${formatNumber(stats.known)}번 가운데서 셉니다.`
                    }
                  />
                }
                value={ideaPrice === null ? '-' : formatNumber(stats.above)}
                suffix={ideaPrice === null ? undefined : '번'}
                loading={loading}
                styles={NUMERIC}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={
                  <StatTitle
                    label="나온 유물 시세 합계"
                    detail={`그 옵션 그 레벨의 지금 최저가, 매물이 없으면 최종 거래가로 더했습니다. 매물도 거래 기록도 없는 ${formatNumber(count - stats.known)}번은 뺐습니다.${ideaPrice !== null && count > 0 ? ` 이데아 ${formatNumber(count)}개 최저가로는 ${formatGold(ideaPrice * count)}입니다.` : ''}`}
                  />
                }
                value={ready ? formatGoldShort(stats.total) : '-'}
                loading={loading}
                styles={NUMERIC}
              />
            </Col>
          </Row>
          <PriceFreshness prices={prices} />
        </Flex>
      </Card>

      <Collapse
        items={[
          {
            key: 'history',
            label: (
              <Flex gap={4} align="center">
                <Text strong className="tnum">
                  복원 기록 {formatNumber(count)}번
                </Text>
                <Tooltip title='빨간 줄과 "이데아 이상" 은 시세가 이데아 최저가 이상인 결과, "최종" 이 붙은 흐린 시세는 매물이 없어 최종 거래가를 적은 것입니다. 옵션 이름을 누르면 경매장에서 그 레벨의 매물을 봅니다.'>
                  <InfoIcon aria-label="기록 표 읽는 법" tabIndex={0} style={{ cursor: 'help' }} />
                </Tooltip>
              </Flex>
            ),
            styles: { body: { padding: 0 } },
            children: <HistoryTable rows={settledHistory} ideaPrice={ideaPrice} state={state} />,
          },
        ]}
      />
    </Flex>
  );
}
