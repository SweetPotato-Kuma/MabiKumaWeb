import { readPersonal, writePersonal, removePersonal } from '@/lib/personalStorage';
import { memo, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Flex,
  Grid,
  Popover,
  Row,
  Segmented,
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
import { ItemIcon } from '@/components/ItemIcon';
import { CalculateIcon, CloseIcon, ResetIcon, StarFillIcon } from '@/components/icons';
import { TrialCountInput, TrialOdds } from '@/components/simulator/TrialOdds';
import { useMarketPrices, type PriceState } from '@/features/crafting/market';
import {
  COIN_TIERS,
  coinScore,
  coinTargetChance,
  coinTierOf,
  formatCoinValue,
  maxScore,
  meetsCoinTarget,
  optionValues,
  scoreAtLeastChance,
  stepCount,
  stepPoints,
  TOP_COIN_TIER,
  valueAt,
  type CoinDraw,
  type CoinDungeon,
  type CoinOption,
  type CoinSimulator,
  type CoinTier,
  type CoinTotem,
} from '@/features/coins/simulator';
import { formatChance } from '@/features/simulator/trials';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import './coinFx.css';

const { Text } = Typography;

/** 기록 표 한 쪽의 줄 수. */
const PAGE_SIZE = 20;

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

/** 만들기 연출 한 번의 길이와 원판 도는 각도, 잔흔석, 빛살, 반짝임, 금빛 빛살 수. */
const FX_DURATION = 1300;
const FX_SPIN = 180;
const STONES = [0, 120, 240];
const RAYS = 12;
const SPARKS = 10;
const GOLD_RAYS = 16;
/** 95% 이상 금빛 때문에 결과를 늦게 드러내는 시간. */
const GOLD_EXTRA_MS = 500;
/** "연출 끄기" 를 이 브라우저에 기억해 두는 자리. */
const FX_STORAGE_KEY = 'mabikuma:coinFx';

function readFxSetting(): boolean {
  try {
    return readPersonal(FX_STORAGE_KEY) !== 'off';
  } catch {
    // 시크릿 모드 등 localStorage 접근이 막힌 환경
    return true;
  }
}

function writeFxSetting(on: boolean): void {
  try {
    if (on) removePersonal(FX_STORAGE_KEY);
    else writePersonal(FX_STORAGE_KEY, 'off');
  } catch {
    // 저장하지 못해도 이번 방문 동안은 고른 대로 간다.
  }
}

const angles = (count: number) =>
  Array.from({ length: count }, (_, index) => (360 / count) * index);

/** 경매장 최저가. 매물이 없거나 받지 못했으면 null. */
function lowestOf(state: PriceState | undefined): number | null {
  if (state?.status !== 'ok') return null;
  return state.price.offers[0]?.price ?? null;
}

/** "물리 토템" 에서 "토템" 을 뗀 짧은 이름. 토템을 고르는 칸이 휴대폰 폭에 들게 한다. */
const shortTotem = (label: string) => label.replace(/\s*토템$/, '');

/** 주화 하나를 그릴 때 필요한 것. */
interface ShownCoin extends CoinDraw {
  totemInfo: CoinTotem;
  score: number;
  max: number;
  tier: CoinTier | null;
}

const showCoin = (dungeon: CoinDungeon, draw: CoinDraw): ShownCoin => {
  const totemInfo = dungeon.totems[draw.totem];
  const score = coinScore(totemInfo, draw.steps);
  return {
    ...draw,
    totemInfo,
    score,
    max: maxScore(totemInfo),
    tier: coinTierOf(totemInfo, score),
  };
};

/**
 * 최상위(95% 이상) 금빛. 다른 시뮬레이터의 최상위 결과처럼 연출 밖에서도 이 등급만 antd 금색 팔레트로 칠한다.
 * 글자는 배경 대비를 지키려고 진한 칸(큰 글자 7, 작은 글자 8)을 쓴다.
 */
function useGold() {
  const { token } = theme.useToken();
  return {
    line: token.gold,
    bg: token.gold1,
    soft: token.gold3,
    big: token.gold7,
    text: token.gold8,
  };
}

/** 등급 표시. 95% 이상은 별과 금빛 바탕, 75%와 90% 이상은 액센트 테두리, 50% 이상은 기본 테두리다. */
function TierTag({ tier }: { tier: CoinTier }) {
  const { token } = theme.useToken();
  const gold = useGold();
  const top = tier === TOP_COIN_TIER;
  const accent = tier >= 75;
  return (
    <Tag
      icon={top ? <StarFillIcon aria-hidden /> : undefined}
      style={{
        marginInlineEnd: 0,
        whiteSpace: 'nowrap',
        fontWeight: top ? 700 : undefined,
        color: top ? gold.text : accent ? token.colorPrimary : undefined,
        borderColor: top ? gold.line : accent ? token.colorPrimary : undefined,
        background: top ? gold.bg : 'transparent',
      }}
    >
      {tier}% 이상
    </Tag>
  );
}

/** "128점". 95% 이상은 굵은 금빛이다. 색만으로 가르지 않게 등급 표시가 함께 붙는다. */
function ScoreText({ coin, size, strong }: { coin: ShownCoin; size?: number; strong?: boolean }) {
  const gold = useGold();
  const top = coin.tier === TOP_COIN_TIER;
  return (
    <Text
      className="tnum"
      strong={strong || top}
      style={{
        fontSize: size,
        whiteSpace: 'nowrap',
        color: top ? ((size ?? 0) >= 20 ? gold.big : gold.text) : undefined,
      }}
    >
      {formatNumber(coin.score)}점
    </Text>
  );
}

/** 옵션 수치 하나. 최대치에는 "최대" 표시가 붙는다. */
function CoinValue({ option, step, size }: { option: CoinOption; step: number; size?: number }) {
  const max = step === stepCount(option) - 1;
  return (
    <Flex gap={6} align="center" style={{ flex: 'none' }}>
      <Text className="tnum" style={{ fontSize: size, whiteSpace: 'nowrap' }}>
        {formatCoinValue(option, valueAt(option, step))}
      </Text>
      {max ? <Tag style={{ marginInlineEnd: 0 }}>최대</Tag> : null}
    </Flex>
  );
}

/** 주화 한 개의 옵션 세 줄. 크게 그릴 때는 줄마다 점수를 함께 보인다. 점수에 넣지 않는 옵션은 "-" 다. */
function CoinLines({ coin, big }: { coin: ShownCoin; big?: boolean }) {
  return (
    <Flex vertical gap={big ? 10 : 2}>
      {coin.totemInfo.options.map((option, index) => (
        <Flex key={option.name} gap={8} align="center">
          <Text style={{ flex: 1, minWidth: 0, fontSize: big ? 15 : 13 }}>{option.name}</Text>
          <CoinValue option={option} step={coin.steps[index]} size={big ? 20 : undefined} />
          {big ? (
            <Text
              type="secondary"
              className="tnum"
              style={{ fontSize: 13, minWidth: 48, textAlign: 'right' }}
            >
              {option.points > 0 ? `${formatNumber(stepPoints(option, coin.steps[index]))}점` : '-'}
            </Text>
          ) : null}
        </Flex>
      ))}
    </Flex>
  );
}

/**
 * 주화 작업대. 원판 가운데 칸에 주화가 놓이고, 만들면 점수로 바뀐다.
 * play 가 바뀌면 판을 새로 그려 연출을 처음부터 돌린다.
 */
function CoinBench({
  dungeon,
  totem,
  result,
  play,
  tier,
  iconSize,
  fxStyle,
}: {
  dungeon: CoinDungeon;
  totem: CoinTotem;
  /** 가운데 칸에 놓인 결과. 아직 만들지 않았으면 null 이고 주화가 놓인다. */
  result: ShownCoin | null;
  /** 연출할 결과의 번호. 연출하지 않으면 null. */
  play: number | null;
  /** 연출할 결과의 등급. */
  tier: CoinTier | null;
  iconSize: number;
  fxStyle: CSSProperties;
}) {
  const coin = (
    <div className="cn-coin">
      <ItemIcon category={dungeon.coinCategory} name={totem.itemName} size={iconSize} />
      <Text type="secondary" style={{ fontSize: 11 }}>
        {shortTotem(totem.label)}
      </Text>
    </div>
  );
  const shown = result ? (
    <div className="cn-result">
      <ScoreText coin={result} size={20} strong />
      <Text type="secondary" className="tnum" style={{ fontSize: 11, lineHeight: 1.25 }}>
        / {formatNumber(result.max)}
      </Text>
    </div>
  ) : null;
  const playing = play !== null;
  const classes = ['cn-stage'];
  if (playing) {
    classes.push('cn-play');
    // 등급은 아래 것을 모두 품는다. 95% 이상이면 번쩍임, 빛살, 반짝임, 금빛이 함께 돈다.
    for (const step of COIN_TIERS) if (tier !== null && tier >= step) classes.push(`cn-t${step}`);
  }
  const at = (step: CoinTier) => playing && tier !== null && tier >= step;
  return (
    <div key={play ?? 'still'} className={classes.join(' ')} style={fxStyle} aria-hidden>
      <div className="cn-stage-body">
        <div className="cn-ring" />
        <div className="cn-ring cn-ring--inner" />
        <div className="cn-ring cn-ring--core" />
        {at(TOP_COIN_TIER) ? (
          <div className="cn-gold-layer">
            <div className="cn-gold-flash" />
            {angles(GOLD_RAYS).map((angle, index) => (
              <span
                key={angle}
                className="cn-gold-ray"
                style={{ '--a': `${angle}deg`, '--i': index } as CSSProperties}
              />
            ))}
          </div>
        ) : null}
        {at(75)
          ? angles(RAYS).map((angle) => (
              <span
                key={`ray-${angle}`}
                className="cn-ray"
                style={{ '--a': `${angle}deg` } as CSSProperties}
              />
            ))
          : null}
        {at(50) ? <div className="cn-flash" /> : null}
        <div className="cn-slot">
          {playing ? (
            <>
              {coin}
              {shown}
            </>
          ) : (
            (shown ?? coin)
          )}
        </div>
        {playing
          ? STONES.map((angle, index) => (
              <div
                key={`stone-${angle}`}
                className="cn-stone"
                style={{ '--a': `${angle}deg`, '--i': index } as CSSProperties}
              >
                <ItemIcon
                  category={dungeon.material.category}
                  name={dungeon.material.name}
                  size={Math.round(iconSize * 0.55)}
                />
              </div>
            ))
          : null}
        {at(90)
          ? angles(SPARKS).map((angle, index) => (
              <StarFillIcon
                key={`spark-${angle}`}
                aria-hidden
                className="cn-spark"
                style={{ '--a': `${angle + 18}deg`, '--i': index } as CSSProperties}
              />
            ))
          : null}
        {at(TOP_COIN_TIER) ? <StarFillIcon aria-hidden className="cn-glint" /> : null}
      </div>
    </div>
  );
}

/** 방금 만든 주화의 숫자 한 칸. 이름, 큰 숫자, 그 아래 한 줄. */
function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { token } = theme.useToken();
  return (
    <Flex
      vertical
      gap={2}
      style={{
        padding: '10px 12px',
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        background: token.colorBgContainer,
        minWidth: 0,
      }}
    >
      <Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Text>
      <Text strong className="tnum" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
        {value}
      </Text>
      {sub ? (
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          {sub}
        </Text>
      ) : null}
    </Flex>
  );
}

/** 방금 만든 주화 하나를 크게. 한 번 만들었을 때 오른쪽 칸을 채운다. */
function CoinDetail({ dungeon, coin }: { dungeon: CoinDungeon; coin: ShownCoin }) {
  const { token } = theme.useToken();
  const gold = useGold();
  const top = coin.tier === TOP_COIN_TIER;
  const chance = scoreAtLeastChance(coin.totemInfo, coin.score);
  return (
    <Flex
      vertical
      gap={14}
      style={{
        width: '100%',
        maxWidth: 480,
        // 최상위는 금빛 테두리와 옅은 금빛 바탕으로 칸 전체를 강조한다.
        ...(top
          ? {
              padding: 16,
              border: `1px solid ${gold.line}`,
              borderRadius: token.borderRadiusLG,
              background: gold.bg,
            }
          : undefined),
      }}
    >
      <Flex className="cn-line" gap={12} align="center" style={{ '--i': 0 } as CSSProperties}>
        <ItemIcon category={dungeon.coinCategory} name={coin.totemInfo.itemName} size={40} />
        <Text strong style={{ flex: 1, minWidth: 0, fontSize: 18 }}>
          {coin.totemInfo.label}
        </Text>
        {coin.tier !== null ? <TierTag tier={coin.tier} /> : null}
      </Flex>
      <Flex
        className={top ? 'cn-line cn-line--max' : 'cn-line'}
        gap={8}
        align="baseline"
        style={{ '--i': 1 } as CSSProperties}
      >
        <ScoreText coin={coin} size={40} strong />
        <Text type="secondary" className="tnum" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
          / {formatNumber(coin.max)}
        </Text>
      </Flex>
      <div className="cn-line" style={{ '--i': 2 } as CSSProperties}>
        <CoinLines coin={coin} big />
      </div>
      {/* 좁으면 알아서 한 칸으로 떨어진다. */}
      <div
        className="cn-line"
        style={
          {
            '--i': 3,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 8,
          } as CSSProperties
        }
      >
        <Fact label="같은 토템 가운데" value={`상위 ${formatChance(chance)}`} />
        <Fact
          label="이 점수 이상 나올 확률"
          value={formatChance(chance)}
          sub={`평균 ${formatNumber(Math.round(1 / chance))}번에 한 번`}
        />
      </div>
    </Flex>
  );
}

/** 여러 번 만들었을 때 등급마다 몇 개 나왔는지. 목록 위에 한 줄로 둔다. */
function BatchSummary({ coins }: { coins: ShownCoin[] }) {
  return (
    <Flex gap={6} align="center" wrap style={{ marginBottom: 10 }}>
      {COIN_TIERS.map((tier) => {
        const hits = coins.filter((coin) => coin.tier !== null && coin.tier >= tier).length;
        return (
          <Flex key={tier} gap={4} align="center">
            <TierTag tier={tier} />
            <Text strong className="tnum" style={{ fontSize: 13 }}>
              {formatNumber(hits)}개
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
}

/** 여러 번 만들었을 때 방금 나온 것들. 최상위 줄은 금빛 바탕이다. */
function CoinList({ coins }: { coins: ShownCoin[] }) {
  const { token } = theme.useToken();
  const gold = useGold();
  return (
    <Flex vertical gap={8}>
      {coins.map((coin, index) => {
        const top = coin.tier === TOP_COIN_TIER;
        return (
          <Flex
            key={coin.no}
            className={top ? 'cn-line cn-line--max' : 'cn-line'}
            vertical
            gap={4}
            style={
              {
                '--i': index,
                padding: '8px 10px',
                borderRadius: token.borderRadiusSM,
                // 테두리 폭은 모든 줄이 같게 두어 최상위 줄만 높이가 달라지지 않게 한다.
                border: `1px solid ${top ? gold.soft : 'transparent'}`,
                background: top ? gold.bg : token.colorBgContainer,
              } as CSSProperties
            }
          >
            <Flex gap={8} align="center">
              <Text strong style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                {coin.totemInfo.label}
              </Text>
              {coin.tier !== null ? <TierTag tier={coin.tier} /> : null}
              <span style={{ flex: 'none', minWidth: 52, textAlign: 'right' }}>
                <ScoreText coin={coin} strong />
              </span>
            </Flex>
            <CoinLines coin={coin} />
          </Flex>
        );
      })}
    </Flex>
  );
}

const HistoryTable = memo(function HistoryTable({ rows }: { rows: ShownCoin[] }) {
  const columns: TableColumnsType<ShownCoin> = [
    {
      title: '번째',
      dataIndex: 'no',
      width: 64,
      align: 'right',
      render: (no: number) => <span className="tnum">{formatNumber(no)}</span>,
    },
    {
      title: '토템',
      key: 'totem',
      width: 96,
      render: (_value, coin) => <Text strong>{coin.totemInfo.label}</Text>,
    },
    {
      title: '옵션',
      key: 'options',
      render: (_value, coin) => <CoinLines coin={coin} />,
    },
    {
      title: '점수',
      key: 'score',
      width: 112,
      align: 'right',
      // 토템마다 만점이 달라, 만점에 견준 비율로 줄 세운다.
      sorter: (a, b) => a.score / a.max - b.score / b.max,
      render: (_value, coin) => (
        <Flex vertical gap={2} align="flex-end">
          <ScoreText coin={coin} />
          {coin.tier !== null ? <TierTag tier={coin.tier} /> : null}
        </Flex>
      ),
    },
  ];
  return (
    <Table<ShownCoin>
      columns={columns}
      dataSource={rows}
      rowKey="no"
      size="small"
      pagination={
        rows.length > PAGE_SIZE
          ? { pageSize: PAGE_SIZE, showSizeChanger: false, size: 'small' }
          : false
      }
      locale={{ emptyText: '아직 만들지 않았습니다.' }}
    />
  );
});

/**
 * 주화 만들기 창. 토템을 고르고 만들면 옵션 세 줄이 붙고, 옵션마다 매긴 점수의 합이 그 토템 만점의 몇 %
 * 인지로 등급을 가른다. 쓴 골드는 만든 수에 재료 개수와 재료의 경매장 최저가를 곱한다.
 */
export function CoinSimulatorView({
  dungeon,
  simulator,
}: {
  dungeon: CoinDungeon;
  simulator: CoinSimulator;
}) {
  const formatGold = useGoldFormatter();
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();
  const [totem, setTotem] = useState(0);
  const selected = dungeon.totems[totem];

  const priceNames = useMemo(
    () => [dungeon.material.name, ...dungeon.totems.map((each) => each.itemName)],
    [dungeon],
  );
  const prices = useMarketPrices(priceNames);
  const materialState = prices.get(dungeon.material.name);
  const materialPrice = lowestOf(materialState);
  const coinPrice = lowestOf(prices.get(selected.itemName));
  const priceLoading = materialState?.status === 'loading';
  const perCoin = materialPrice === null ? null : materialPrice * dungeon.material.count;

  const shown = useMemo(
    () => simulator.draws.map((draw) => showCoin(dungeon, draw)),
    [simulator.draws, dungeon],
  );
  const latest = shown.slice(shown.length - simulator.lastBatch).reverse();
  const last = shown[shown.length - 1] ?? null;

  // 연출. 한 번 만들었을 때만 돌리고, 누를 때 걸어 둔다(끈 채 만든 뒤 켜도 지난 연출이 돌지 않게).
  const [fxOn, setFxOn] = useState(readFxSetting);
  const [armed, setArmed] = useState(false);
  const make = (times: number) => {
    setArmed(fxOn);
    simulator.draw(totem, times);
  };
  const play = armed && fxOn && simulator.lastBatch === 1 && last ? last.no : null;
  const playTier = play !== null && last ? last.tier : null;
  const reveal = armed && fxOn && simulator.lastBatch > 0 && last ? last.no : null;

  /*
   * 연출이 도는 동안에는 통계와 기록에 방금 만든 것을 넣지 않는다. 먼저 올라가면 연출이 끝나기 전에
   * 어느 등급인지 알려 버린다. 연출이 끝나면 넣는다.
   */
  const [settledNo, setSettledNo] = useState(0);
  const pending = play !== null && settledNo < play ? play : null;
  const goldExtra = playTier === TOP_COIN_TIER ? GOLD_EXTRA_MS : 0;
  const fxTotal = FX_DURATION + goldExtra;
  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => setSettledNo(pending), fxTotal);
    return () => window.clearTimeout(timer);
  }, [pending, fxTotal]);
  const counted = useMemo(
    () => (pending === null ? shown : shown.filter((coin) => coin.no !== pending)),
    [shown, pending],
  );
  const count = counted.length;
  const history = useMemo(() => [...counted].reverse(), [counted]);
  // 표는 주화 창보다 늦게 그린다. 누르자마자 창에 결과가 먼저 뜬다.
  const settledHistory = useDeferredValue(history);

  // 등급마다 그 등급 이상이 나온 개수.
  const tierCounts = useMemo(() => {
    const counts = new Map<CoinTier, number>(COIN_TIERS.map((tier) => [tier, 0]));
    for (const coin of counted) {
      if (coin.tier === null) continue;
      for (const tier of COIN_TIERS)
        if (coin.tier >= tier) counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    return counts;
  }, [counted]);

  // 특정 주화 기댓값. 토템마다 옵션별 최솟값을 따로 기억한다.
  const [calcOpen, setCalcOpen] = useState(false);
  const [trials, setTrials] = useState(10);
  const [minValues, setMinValues] = useState<Record<number, number[]>>({});
  const targetMins = useMemo(
    () => minValues[totem] ?? selected.options.map((option) => option.min),
    [minValues, totem, selected],
  );
  const chance = coinTargetChance(selected, targetMins);
  const targetHits = useMemo(
    () =>
      counted.filter((coin) => coin.totem === totem && meetsCoinTarget(dungeon, coin, targetMins))
        .length,
    [counted, totem, dungeon, targetMins],
  );

  const calculator = (
    <Flex vertical gap={10} style={{ width: 'min(440px, calc(100vw - 88px))' }}>
      <TrialCountInput value={trials} onChange={setTrials} />
      <Divider style={{ margin: 0 }} />
      <Text strong>{selected.label}</Text>
      {selected.options.map((option, index) => (
        <Flex key={option.name} gap={8} align="center">
          <Text style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{option.name}</Text>
          <Select<number>
            aria-label={`${option.name} 가장 낮은 수치`}
            size="small"
            value={targetMins[index]}
            onChange={(value) => {
              const next = [...targetMins];
              next[index] = value;
              setMinValues({ ...minValues, [totem]: next });
            }}
            options={optionValues(option).map((value) => ({
              value,
              label: value === option.min ? '상관없음' : `${formatCoinValue(option, value)} 이상`,
            }))}
            popupMatchSelectWidth={false}
            className="tnum"
            style={{ width: 120 }}
          />
        </Flex>
      ))}
      <Text className="tnum" style={{ fontSize: 13 }}>
        한 번에 <Text strong>{formatChance(chance)}</Text>, 평균{' '}
        <Text strong>{formatNumber(Math.ceil(1 / chance))}번</Text>에 한 번
        {count > 0 ? `, 지금까지 ${formatNumber(targetHits)}번` : ''}
      </Text>
      {chance < 1 ? (
        <TrialOdds
          framed={false}
          trials={trials}
          chance={chance}
          verb="만들기"
          costPerTrial={perCoin}
        />
      ) : null}
    </Flex>
  );

  // 작업대 배율. 휴대폰 폭에서는 원래 크기이고 넓을수록 키운다. 연출도 같은 배율로 커진다.
  const stageScale = screens.xl ? 1.45 : screens.lg ? 1.3 : screens.md ? 1.15 : 1;
  const fxStyle = {
    '--fx-accent': token.colorPrimary,
    '--fx-soft': token.colorPrimaryBg,
    '--fx-line': token.colorBorder,
    '--fx-surface': token.colorFillQuaternary,
    // 95% 이상 금빛. 다른 시뮬레이터의 최상위 결과와 같은 금색 토큰이다.
    '--fx-gold': token.gold,
    '--fx-dur': `${play !== null ? FX_DURATION : 0}ms`,
    '--fx-spin': `${FX_SPIN}deg`,
    '--fx-extra': `${goldExtra}ms`,
    '--rf': stageScale,
  } as CSSProperties;

  const single = simulator.lastBatch <= 1;

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined" role="region" aria-label="주화 만들기">
        {/*
          작업대와 방금 만든 주화 두 칸. 768px 미만에서는 위아래로 쌓는다. 오른쪽 칸은 높이를 정해 두어
          한 번과 10번을 오가도 창이 늘고 줄지 않는다.
        */}
        <Row gutter={[24, 20]} align="stretch">
          <Col xs={24} md={10} xl={9}>
            <Flex vertical gap={12} align="center">
              <Text strong style={{ fontSize: 16 }}>
                {dungeon.title}
              </Text>
              <CoinBench
                dungeon={dungeon}
                totem={selected}
                result={last}
                play={play}
                tier={playTier}
                iconSize={Math.round(48 * stageScale)}
                fxStyle={fxStyle}
              />
              <Segmented<number>
                aria-label="토템"
                block
                value={totem}
                onChange={setTotem}
                options={dungeon.totems.map((each, index) => ({
                  value: index,
                  label: shortTotem(each.label),
                }))}
                style={{ width: '100%', maxWidth: 320 }}
              />
              <Flex
                vertical
                gap={4}
                style={{
                  width: '100%',
                  maxWidth: 320,
                  padding: '10px 12px',
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: token.borderRadius,
                }}
              >
                {selected.options.map((option) => (
                  <Flex key={option.name} gap={8} justify="space-between">
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {option.name}
                    </Text>
                    <Text className="tnum" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatCoinValue(option, option.min)} ~ {formatCoinValue(option, option.max)}
                    </Text>
                  </Flex>
                ))}
              </Flex>
              <Button type="primary" size="large" onClick={() => make(1)} style={{ minWidth: 200 }}>
                만들기
              </Button>
              <Flex gap={8} align="center">
                <Switch
                  checked={fxOn}
                  onChange={(on) => {
                    setFxOn(on);
                    setArmed(false);
                    writeFxSetting(on);
                  }}
                  aria-label="주화 연출"
                />
                <Text style={{ fontSize: 13 }}>주화 연출</Text>
              </Flex>
              <Flex gap={8} wrap justify="center">
                <Button onClick={() => make(10)}>10번 만들기</Button>
                <Popover
                  open={calcOpen}
                  trigger={[]}
                  placement={screens.md ? 'bottomLeft' : 'bottom'}
                  title={
                    <Flex justify="space-between" align="center" gap={8}>
                      <span>특정 주화 기댓값</span>
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseIcon />}
                        aria-label="특정 주화 기댓값 닫기"
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
                    특정 주화 기댓값
                  </Button>
                </Popover>
                <Button
                  icon={<ResetIcon />}
                  onClick={() => {
                    setSettledNo(0);
                    simulator.reset();
                  }}
                  disabled={shown.length === 0}
                >
                  처음부터
                </Button>
              </Flex>
            </Flex>
          </Col>
          <Col xs={24} md={14} xl={15}>
            <section
              aria-labelledby="coin-latest"
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 320,
                maxHeight: 560,
                overflowY: 'auto',
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                background: token.colorFillQuaternary,
                padding: 16,
              }}
            >
              <Text strong id="coin-latest" style={{ display: 'block', marginBottom: 12 }}>
                방금 만든 주화
                {simulator.lastBatch > 1 ? ` ${formatNumber(simulator.lastBatch)}개` : ''}
              </Text>
              {last === null ? (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  아직 만들지 않았습니다.
                </Text>
              ) : (
                <div
                  key={reveal ?? 'still'}
                  className={reveal !== null ? 'cn-reveal' : undefined}
                  style={
                    {
                      ...fxStyle,
                      position: 'relative',
                      // 한 번 만든 결과는 칸 가운데에 크게 둔다.
                      flex: single ? 1 : undefined,
                      display: single ? 'flex' : undefined,
                      alignItems: single ? 'center' : undefined,
                      justifyContent: single ? 'center' : undefined,
                    } as CSSProperties
                  }
                >
                  {single ? (
                    <CoinDetail dungeon={dungeon} coin={last} />
                  ) : (
                    <>
                      <BatchSummary coins={latest} />
                      <CoinList coins={latest} />
                    </>
                  )}
                </div>
              )}
            </section>
          </Col>
        </Row>

        <Divider style={{ marginBlock: 16 }} />

        <Flex vertical gap={14}>
          {/* 골드 칸은 열 자리를 넘기도 해서 다른 칸의 두 배 폭이고, 576px 미만에서는 한 줄을 다 쓴다. */}
          <Row gutter={[24, 16]} align="top">
            <Col xs={12} sm={6} lg={3}>
              <Statistic
                title="만든 주화"
                value={formatNumber(count)}
                suffix="개"
                styles={NUMERIC}
              />
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Statistic
                title="쓴 잔흔석"
                value={formatNumber(count * dungeon.material.count)}
                suffix="개"
                styles={NUMERIC}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Statistic
                title="쓴 골드"
                value={perCoin === null ? '-' : formatGold(perCoin * count)}
                loading={priceLoading}
                styles={NUMERIC}
              />
            </Col>
            {COIN_TIERS.map((tier) => (
              <Col key={tier} xs={12} sm={6} lg={3}>
                <Statistic
                  title={`${tier}% 이상`}
                  value={formatNumber(tierCounts.get(tier) ?? 0)}
                  suffix="개"
                  styles={NUMERIC}
                />
              </Col>
            ))}
          </Row>
          <Flex gap={6} align="center" wrap>
            {priceLoading ? <Spin size="small" /> : null}
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {priceLoading
                ? '잔흔석 시세를 받는 중입니다.'
                : materialPrice === null
                  ? '잔흔석 시세가 없습니다.'
                  : `${dungeon.material.name} 최저가 ${formatGold(materialPrice)}, 주화 하나에 ${formatNumber(dungeon.material.count)}개. ${selected.label} 최저가 ${coinPrice === null ? '없음' : formatGold(coinPrice)}. 게임 데이터는 평균 10분 지연됩니다.`}
            </Text>
          </Flex>
        </Flex>
      </Card>

      <Collapse
        items={[
          {
            key: 'history',
            label: (
              <Text strong className="tnum">
                만든 기록 {formatNumber(count)}개
              </Text>
            ),
            styles: { body: { padding: 0 } },
            children: <HistoryTable rows={settledHistory} />,
          },
        ]}
      />
    </Flex>
  );
}
