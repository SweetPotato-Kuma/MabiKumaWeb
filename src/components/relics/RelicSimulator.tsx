import { memo, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react';
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
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { SkillIcon } from '@/components/crafting/RecipeInfo';
import { ItemIcon } from '@/components/ItemIcon';
import {
  CalculateIcon,
  CloseIcon,
  ResetIcon,
  StarFillIcon,
  TrendingUpIcon,
} from '@/components/icons';
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
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
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
 * 이데아 최저가 이상이면 굵은 액센트 색으로 적는다. 세공의 최대 수치 강조와 같은 색이다. 색만으로
 * 가르지 않게 "이데아 이상" 표시가 함께 붙는다.
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
  const formatGold = useGoldFormatter();
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
        color: above ? token.colorPrimary : undefined,
      }}
    >
      {formatGold(price.price)}
      {/* 작게 붙여 가격 칸이 덜 넓어지게 한다. 좁은 목록에서도 한 줄에 든다. */}
      {trade ? <span style={{ fontSize: 12, marginInlineStart: 4 }}>최종</span> : null}
    </Text>
  );
}

/**
 * 이데아 최저가 이상 표시. 세공 창의 "한계 돌파" 표시처럼 테두리만 있는 태그다. 칸이나 줄의 바탕은
 * 칠하지 않는다. 세공 창도 특별한 결과를 바탕색 없이 글자 표시로만 알린다.
 */
function IdeaTag() {
  const { token } = theme.useToken();
  return (
    <Tag
      style={{
        marginInlineEnd: 0,
        whiteSpace: 'nowrap',
        color: token.colorPrimary,
        borderColor: token.colorPrimary,
        background: 'transparent',
      }}
    >
      이데아 이상
    </Tag>
  );
}

/**
 * 목록 줄의 이데아 최저가 이상 표시. 넓으면 "이데아 이상" 태그, 목록이 좁으면 오르는 화살표만
 * 둔다(relicFx.css 의 .rl-rows). 화살표도 모양과 이름(aria-label)이 있어 색만으로 가르지 않는다.
 */
function IdeaMark() {
  const { token } = theme.useToken();
  return (
    <>
      <span className="rl-mark-full">
        <IdeaTag />
      </span>
      <TrendingUpIcon
        className="rl-mark-icon"
        aria-label="이데아 이상"
        title="이데아 이상"
        style={{ color: token.colorPrimary, fontSize: 16 }}
      />
    </>
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
/** 이데아 최저가 이상일 때의 빛살과 둘레 반짝임 수. 찬란한 세공 도구와 같다. */
const BIG_RAYS = 12;
const BIG_SPARKS = 10;
/** 10레벨 금빛 때문에 결과를 늦게 드러내는 시간. */
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
  big,
  max,
  iconSize,
  fxStyle,
}: {
  /** 가운데 칸에 놓인 결과. 아직 복원하지 않았으면 null 이고 이데아가 놓인다. */
  result: PricedDraw | null;
  /** 연출할 복원의 번호. 연출하지 않으면 null. */
  play: number | null;
  /** 연출할 복원이 이데아 최저가 이상인지. 맞으면 찬란한 세공 도구처럼 빛살이 퍼지고 판이 흔들린다. */
  big: boolean;
  /** 연출할 복원이 10레벨인지. 맞으면 세공의 한계 돌파처럼 금빛이 번쩍인다. */
  max: boolean;
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
  const playing = play !== null;
  const classes = ['rl-stage'];
  if (playing) classes.push('rl-play');
  if (playing && big) classes.push('rl-big');
  if (playing && max) classes.push('rl-max');
  return (
    <div key={play ?? 'still'} className={classes.join(' ')} style={fxStyle} aria-hidden>
      <div className="rl-stage-body">
        <div className="rl-ring" />
        <div className="rl-ring rl-ring--inner" />
        <div className="rl-ring rl-ring--core" />
        {playing && max ? (
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
        {playing && big
          ? angles(BIG_RAYS).map((angle) => (
              <span
                key={`ray-${angle}`}
                className="rl-ray"
                style={{ '--a': `${angle}deg` } as CSSProperties}
              />
            ))
          : null}
        <div className="rl-flash" />
        <div className="rl-slot">
          {playing ? (
            <>
              {idea}
              {shown}
            </>
          ) : (
            (shown ?? idea)
          )}
        </div>
        {playing
          ? angles(MOTES).map((angle, index) => (
              <StarFillIcon
                key={`mote-${angle}`}
                aria-hidden
                className="rl-mote"
                style={{ '--a': `${angle}deg`, '--i': index } as CSSProperties}
              />
            ))
          : null}
        {playing && big
          ? angles(BIG_SPARKS).map((angle, index) => (
              <StarFillIcon
                key={`spark-${angle}`}
                aria-hidden
                className="rl-spark"
                style={{ '--a': `${angle + 18}deg`, '--i': index } as CSSProperties}
              />
            ))
          : null}
        {playing && max ? <StarFillIcon aria-hidden className="rl-glint" /> : null}
      </div>
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
        className={draw.level === RELIC_MAX_LEVEL ? 'rl-line rl-line--max' : 'rl-line'}
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
      <Flex className="rl-line" gap={8} align="center" wrap style={{ '--i': 2 } as CSSProperties}>
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

/**
 * 여러 번 복원했을 때 방금 나온 것들. 한 줄에 하나, 먼저 나온 것이 아래다.
 *
 * 줄마다 따로 칸을 나누면 "최종" 이나 "이데아 이상" 이 붙은 줄만 가격 칸이 넓어지거나 두 줄이 되어
 * 레벨과 가격이 줄마다 어긋났다. 목록 전체가 한 격자를 쓰고 줄은 그 칸을 나눠 받는다(subgrid).
 * 칸 폭은 가장 긴 줄에 맞춰지고, 옵션 이름이 남는 폭을 쓰며 넘치면 말줄임으로 자른다. 휴대폰처럼
 * 목록이 좁으면 이름을 윗줄에 두고 레벨과 가격을 아랫줄 오른쪽에 모은다(relicFx.css).
 */
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
    <div className="rl-rows">
      {draws.map((draw, index) => {
        const above = state === 'ready' && isAboveIdea(draw.price, ideaPrice);
        return (
          <div
            key={draw.no}
            className="rl-line rl-row"
            style={
              {
                '--i': index,
                padding: '4px 6px',
                borderRadius: token.borderRadiusSM,
              } as CSSProperties
            }
          >
            <span className="rl-cell-icon">
              {draw.found ? <SkillIcon skillId={draw.found.skill.id} size={ROW_ICON} /> : null}
            </span>
            <div
              className="rl-cell-name"
              title={draw.option.name}
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <OptionName draw={draw} />
            </div>
            <Flex className="rl-cell-level" justify="flex-end">
              <LevelLabel level={draw.level} />
            </Flex>
            <Flex className="rl-cell-price" justify="flex-end">
              <PriceText price={draw.price} ideaPrice={ideaPrice} state={state} />
            </Flex>
            <Flex className="rl-cell-mark" align="center">
              {above ? <IdeaMark /> : null}
            </Flex>
          </div>
        );
      })}
    </div>
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
  const formatGold = useGoldFormatter();
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
  const latest = priced.slice(priced.length - simulator.lastBatch).reverse();
  const last = priced[priced.length - 1] ?? null;
  // 연출. 한 번 복원했을 때만 돌리고, 누를 때 걸어 둔다(끈 채 복원한 뒤 켜도 지난 연출이 돌지 않게).
  const [fxOn, setFxOn] = useState(readFxSetting);
  const animate = fxOn && !reducedMotion;
  const [armed, setArmed] = useState(false);
  const restore = (times: number) => {
    setArmed(animate);
    simulator.draw(times);
  };
  const play = armed && animate && simulator.lastBatch === 1 && last ? last.no : null;
  // 10레벨이면 한계 돌파 같은 금빛, 아니고 이데아 최저가 이상이면 찬란한 세공 도구 같은 빛살. 둘 중 하나만.
  const playMax = play !== null && last !== null && last.level === RELIC_MAX_LEVEL;
  const playBig =
    play !== null &&
    !playMax &&
    last !== null &&
    state === 'ready' &&
    isAboveIdea(last.price, ideaPrice);
  const reveal = armed && animate && simulator.lastBatch > 0 && last ? last.no : null;

  /*
   * 연출이 도는 동안에는 통계와 기록에 방금 복원한 것을 넣지 않는다. 먼저 올라가면 연출이 끝나기 전에
   * 10레벨인지, 본전인지 알려 버린다. 연출이 끝나면 넣는다.
   */
  const [settledNo, setSettledNo] = useState(0);
  const pending = play !== null && settledNo < play ? play : null;
  const fxTotal = FX_DURATION + (playMax ? GOLD_EXTRA_MS : 0);
  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => setSettledNo(pending), fxTotal);
    return () => window.clearTimeout(timer);
  }, [pending, fxTotal]);
  const counted = useMemo(
    () => (pending === null ? priced : priced.filter((draw) => draw.no !== pending)),
    [priced, pending],
  );

  const count = counted.length;
  const history = useMemo(() => [...counted].reverse(), [counted]);
  // 표는 복원 창보다 늦게 그린다. 누르자마자 창에 결과와 시세가 먼저 뜬다.
  const settledHistory = useDeferredValue(history);

  const stats = useMemo(() => {
    let top = 0;
    let known = 0;
    let total = 0;
    let above = 0;
    for (const draw of counted) {
      if (draw.level === RELIC_MAX_LEVEL) top += 1;
      if (!draw.price) continue;
      known += 1;
      total += draw.price.price;
      if (ideaPrice !== null && draw.price.price >= ideaPrice) above += 1;
    }
    return { top, known, total, above };
  }, [counted, ideaPrice]);
  // 복원한 만큼의 이데아를 지금 최저가에 샀다고 친 값과, 나온 유물 시세 합계와의 차이.
  // 실제로 골드가 드는 것은 아니다. 복원해 판 것이 이데아로 판 것보다 나았는지를 본다.
  const ideaSpent = ready && ideaPrice !== null ? ideaPrice * count : null;
  const balance = ideaSpent === null ? null : stats.total - ideaSpent;

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

  // 작업대 배율. 휴대폰 폭에서는 원래 크기이고 넓을수록 키운다. 연출도 같은 배율로 커진다.
  const stageScale = screens.xl ? 1.45 : screens.lg ? 1.3 : screens.md ? 1.15 : 1;
  const fxStyle = {
    '--fx-accent': token.colorPrimary,
    '--fx-soft': token.colorPrimaryBg,
    '--fx-line': token.colorBorder,
    '--fx-surface': token.colorFillQuaternary,
    // 10레벨 금빛. 세공의 한계 돌파 빛과 같은 금색 토큰이다.
    '--fx-gold': token.gold,
    '--fx-dur': `${play !== null ? FX_DURATION : 0}ms`,
    '--fx-spin': `${FX_SPIN}deg`,
    '--fx-extra': playMax ? `${GOLD_EXTRA_MS}ms` : '0ms',
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
    () => (target ? counted.filter((draw) => meetsRelicTarget(draw, target)).length : 0),
    [counted, target],
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
              금액 <Text strong>{formatGold(ideaChance.mean * trials)}</Text> (이데아{' '}
              {formatGold(ideaPrice * trials)})
            </Text>
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
          />
        </>
      ) : null}
    </Flex>
  );

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
              </Flex>
              <RestoreBench
                result={last}
                play={play}
                big={playBig}
                max={playMax}
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
                <Button
                  icon={<ResetIcon />}
                  onClick={() => {
                    setSettledNo(0);
                    simulator.reset();
                  }}
                  disabled={priced.length === 0}
                >
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
              <Text strong id="relic-sim-latest" style={{ display: 'block', marginBottom: 12 }}>
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
            </Flex>
          ) : null}
          {/*
            여섯 칸. 윗줄은 나온 것, 아랫줄은 쓴 이데아 값과 나온 유물 값의 견줌이다.
            768px 미만에서는 두 칸씩 세 줄로 떨어진다.
          */}
          <Row gutter={[24, 16]} align="top">
            <Col xs={12} md={8}>
              <Statistic title="복원" value={formatNumber(count)} suffix="번" styles={NUMERIC} />
            </Col>
            <Col xs={12} md={8}>
              <Statistic
                title={`${RELIC_MAX_LEVEL}레벨`}
                value={formatNumber(stats.top)}
                suffix="번"
                styles={NUMERIC}
              />
            </Col>
            <Col xs={12} md={8}>
              <Statistic
                title="이데아 최저가 이상"
                value={ideaPrice === null ? '-' : formatNumber(stats.above)}
                suffix={ideaPrice === null ? undefined : '번'}
                loading={loading}
                styles={NUMERIC}
              />
            </Col>
            <Col xs={12} md={8}>
              <Statistic
                title="쓴 이데아 값"
                value={ideaSpent === null ? '-' : formatGold(ideaSpent)}
                loading={loading}
                styles={NUMERIC}
              />
            </Col>
            <Col xs={12} md={8}>
              <Statistic
                title="나온 유물 시세 합계"
                value={ready ? formatGold(stats.total) : '-'}
                loading={loading}
                styles={NUMERIC}
              />
            </Col>
            <Col xs={12} md={8}>
              <Statistic
                // 휴대폰 두 칸 폭에서는 값 뒤에 이득, 손해를 붙이면 잘려 제목에 둔다.
                title={
                  balance === null || balance === 0
                    ? '차이'
                    : balance > 0
                      ? '차이 (이득)'
                      : '차이 (손해)'
                }
                value={
                  balance === null
                    ? '-'
                    : `${balance > 0 ? '+' : balance < 0 ? '-' : ''}${formatGold(Math.abs(balance))}`
                }
                loading={loading}
                styles={{
                  content: {
                    ...NUMERIC.content,
                    color: balance !== null && balance > 0 ? token.colorPrimary : undefined,
                  },
                }}
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
