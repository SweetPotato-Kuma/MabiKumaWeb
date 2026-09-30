import { memo, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react';
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
import { ItemIcon } from '@/components/ItemIcon';
import {
  CalculateIcon,
  CloseIcon,
  ResetIcon,
  StarFillIcon,
  WaterDropIcon,
} from '@/components/icons';
import { TrialCountInput, TrialOdds } from '@/components/simulator/TrialOdds';
import { useMarketPrices, type PriceState } from '@/features/crafting/market';
import {
  effectChance,
  effectMax,
  HOLY_WATER_EFFECTS,
  HOLY_WATER_SCROLLS,
  HOLY_WATER_TIERS,
  tierChance,
  TOP_TIER,
  topShare,
  tierOf,
  type HolyWaterDraw,
  type HolyWaterEffect,
  type HolyWaterScroll,
  type HolyWaterSimulator as Simulator,
  type HolyWaterTier,
} from '@/features/holyWater/simulator';
import { formatChance } from '@/features/simulator/trials';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import './holyWaterFx.css';

const { Text } = Typography;

/** 경매장에 오르는 이름. 한 번 바르는 값을 이 이름의 최저가로 센다. */
const HOLY_WATER_NAME = '무리아스의 성수';
/** 성수 그림을 찾는 경매장 카테고리. */
const HOLY_WATER_CATEGORY = '포션';
/** 기록 표 한 쪽의 줄 수. */
const PAGE_SIZE = 20;

/** 바르기 연출 한 번의 길이와 원판 도는 각도, 물방울, 물결, 빛살, 반짝임, 금빛 빛살 수. */
const FX_DURATION = 1300;
const FX_SPIN = 180;
const DROPS = [-18, 10, -4];
const RIPPLES = 3;
const RAYS = 12;
const SPARKS = 10;
const GOLD_RAYS = 16;
/** 98% 이상 금빛 때문에 결과를 늦게 드러내는 시간. */
const GOLD_EXTRA_MS = 500;
/** "연출 끄기" 를 이 브라우저에 기억해 두는 자리. */
const FX_STORAGE_KEY = 'mabikuma:holyWaterFx';

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

/** 결과 하나를 그릴 때 필요한 것. */
interface ShownDraw extends HolyWaterDraw {
  source: HolyWaterScroll;
  effect: HolyWaterEffect;
  tier: HolyWaterTier | null;
}

const showDraw = (draw: HolyWaterDraw): ShownDraw => {
  const source = HOLY_WATER_SCROLLS[draw.scroll];
  const effect = HOLY_WATER_EFFECTS[source.effect];
  return { ...draw, source, effect, tier: tierOf(effect, draw.value) };
};

/**
 * 최상위(98% 이상) 금빛. 사용자가 최상위 옵션을 노란빛으로 가려 보길 원해, 연출 밖에서도 이 등급만
 * antd 금색 팔레트로 칠한다. 글자는 배경 대비를 지키려고 진한 칸(큰 글자 7, 작은 글자 8)을 쓴다.
 * 다크 모드는 antd 가 팔레트를 밝게 다시 만들어 같은 번호로 읽힌다.
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

/**
 * 등급 표시. 98% 이상은 별과 금빛 바탕, 90%와 95% 이상은 액센트 테두리, 50% 이상은 기본 테두리다.
 */
function TierTag({ tier }: { tier: HolyWaterTier }) {
  const { token } = theme.useToken();
  const gold = useGold();
  const top = tier === TOP_TIER;
  const accent = tier >= 90;
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

/** "+30". 98% 이상은 굵은 금빛이다. 색만으로 가르지 않게 등급 표시가 함께 붙는다. */
function ValueText({ draw, size, strong }: { draw: ShownDraw; size?: number; strong?: boolean }) {
  const gold = useGold();
  const top = draw.tier === TOP_TIER;
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
      +{formatNumber(draw.value)}
    </Text>
  );
}

/**
 * 성수 작업대. 룬 원판 가운데 칸에 성수가 놓이고, 바르면 붙은 효과로 바뀐다.
 * play 가 바뀌면 판을 새로 그려 연출을 처음부터 돌린다.
 */
function HolyWaterBench({
  result,
  play,
  tier,
  iconSize,
  fxStyle,
}: {
  /** 가운데 칸에 놓인 결과. 아직 바르지 않았으면 null 이고 성수가 놓인다. */
  result: ShownDraw | null;
  /** 연출할 결과의 번호. 연출하지 않으면 null. */
  play: number | null;
  /** 연출할 결과의 등급. */
  tier: HolyWaterTier | null;
  iconSize: number;
  fxStyle: CSSProperties;
}) {
  const vial = (
    <div className="hw-vial">
      <ItemIcon category={HOLY_WATER_CATEGORY} name={HOLY_WATER_NAME} size={iconSize} />
      <Text type="secondary" style={{ fontSize: 11 }}>
        성수
      </Text>
    </div>
  );
  const shown = result ? (
    <div className="hw-result">
      <ValueText draw={result} size={20} />
      <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.25 }}>
        {result.effect.name}
      </Text>
    </div>
  ) : null;
  const playing = play !== null;
  const classes = ['hw-stage'];
  if (playing) {
    classes.push('hw-play');
    // 등급은 아래 것을 모두 품는다. 98% 이상이면 번쩍임, 빛살, 반짝임, 금빛이 함께 돈다.
    for (const step of HOLY_WATER_TIERS)
      if (tier !== null && tier >= step) classes.push(`hw-t${step}`);
  }
  const at = (step: HolyWaterTier) => playing && tier !== null && tier >= step;
  return (
    <div key={play ?? 'still'} className={classes.join(' ')} style={fxStyle} aria-hidden>
      <div className="hw-stage-body">
        <div className="hw-ring" />
        <div className="hw-ring hw-ring--inner" />
        <div className="hw-ring hw-ring--core" />
        {at(TOP_TIER) ? (
          <div className="hw-gold-layer">
            <div className="hw-gold-flash" />
            {angles(GOLD_RAYS).map((angle, index) => (
              <span
                key={angle}
                className="hw-gold-ray"
                style={{ '--a': `${angle}deg`, '--i': index } as CSSProperties}
              />
            ))}
          </div>
        ) : null}
        {at(90)
          ? angles(RAYS).map((angle) => (
              <span
                key={`ray-${angle}`}
                className="hw-ray"
                style={{ '--a': `${angle}deg` } as CSSProperties}
              />
            ))
          : null}
        {at(50) ? <div className="hw-flash" /> : null}
        {playing
          ? Array.from({ length: RIPPLES }, (_, index) => (
              <div
                key={`ripple-${index}`}
                className="hw-ripple"
                style={{ '--i': index } as CSSProperties}
              />
            ))
          : null}
        <div className="hw-slot">
          {playing ? (
            <>
              {vial}
              {shown}
            </>
          ) : (
            (shown ?? vial)
          )}
        </div>
        {playing
          ? DROPS.map((x, index) => (
              <WaterDropIcon
                key={`drop-${index}`}
                aria-hidden
                className="hw-drop"
                style={{ '--x': `${x}px`, '--i': index } as CSSProperties}
              />
            ))
          : null}
        {at(95)
          ? angles(SPARKS).map((angle, index) => (
              <StarFillIcon
                key={`spark-${angle}`}
                aria-hidden
                className="hw-spark"
                style={{ '--a': `${angle + 18}deg`, '--i': index } as CSSProperties}
              />
            ))
          : null}
        {at(TOP_TIER) ? <StarFillIcon aria-hidden className="hw-glint" /> : null}
      </div>
    </div>
  );
}

/**
 * 수치가 1부터 최대치 사이 어디쯤인지. 눈금은 등급 경계(50, 90, 95, 98%)다. 채운 막대가 아니라 점 하나로
 * 자리만 짚는다. 수치가 하나뿐인 효과는 그릴 것이 없어 비운다.
 */
function ValueScale({ draw }: { draw: ShownDraw }) {
  const { token } = theme.useToken();
  const gold = useGold();
  const max = effectMax(draw.effect);
  if (max <= 1) return null;
  const at = (draw.value / max) * 100;
  return (
    <div
      role="img"
      aria-label={`최대치 ${formatNumber(max)} 가운데 ${formatNumber(draw.value)}`}
      style={{ paddingBlock: 6 }}
    >
      <div
        style={{
          position: 'relative',
          height: 4,
          borderRadius: 2,
          background: token.colorFillSecondary,
        }}
      >
        {HOLY_WATER_TIERS.map((tier) => (
          <span
            key={tier}
            style={{
              position: 'absolute',
              left: `${tier}%`,
              top: -3,
              width: 1,
              height: 10,
              background: token.colorBorder,
            }}
          />
        ))}
        <span
          style={{
            position: 'absolute',
            left: `${at}%`,
            top: '50%',
            width: 14,
            height: 14,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            background:
              draw.tier === TOP_TIER
                ? gold.line
                : draw.tier !== null && draw.tier >= 90
                  ? token.colorPrimary
                  : token.colorText,
            border: `2px solid ${token.colorBgContainer}`,
          }}
        />
      </div>
      <Flex justify="space-between" style={{ marginTop: 6 }}>
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          1
        </Text>
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          최대 {formatNumber(max)}
        </Text>
      </Flex>
    </div>
  );
}

/** 방금 붙은 효과 칸의 숫자 한 칸. 이름, 큰 숫자, 그 아래 한 줄. */
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

/** 그 효과가 지금까지 몇 번째로 붙었는지와, 이번 것을 빼고 가장 높았던 수치. */
interface EffectRecord {
  nth: number;
  best: number | null;
}

/** 방금 붙은 효과 하나를 크게. 한 번 발랐을 때 오른쪽 칸을 채운다. */
function ResultDetail({ draw, record }: { draw: ShownDraw; record: EffectRecord }) {
  const fixed = effectMax(draw.effect) <= 1;
  const chance = effectChance(draw.source.effect, draw.value);
  const recordSub =
    record.best === null
      ? '처음 붙음'
      : fixed
        ? undefined
        : draw.value > record.best
          ? `새 최고, 이전 +${formatNumber(record.best)}`
          : `최고 +${formatNumber(record.best)}`;
  const { token } = theme.useToken();
  const gold = useGold();
  const top = draw.tier === TOP_TIER;
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
      <Flex className="hw-line" gap={12} align="center" style={{ '--i': 0 } as CSSProperties}>
        <ItemIcon category={HOLY_WATER_CATEGORY} name={HOLY_WATER_NAME} size={40} />
        <Text strong style={{ flex: 1, minWidth: 0, fontSize: 18, lineHeight: 1.3 }}>
          {draw.effect.name}
        </Text>
        {draw.tier !== null ? <TierTag tier={draw.tier} /> : null}
      </Flex>
      <div
        className={draw.tier === TOP_TIER ? 'hw-line hw-line--max' : 'hw-line'}
        style={{ '--i': 1 } as CSSProperties}
      >
        <Flex gap={8} align="baseline">
          <ValueText draw={draw} size={40} strong />
          <Text type="secondary" className="tnum" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
            / {formatNumber(effectMax(draw.effect))}
          </Text>
        </Flex>
        <ValueScale draw={draw} />
      </div>
      {/* 좁으면 알아서 두 칸, 한 칸으로 떨어진다. */}
      <div
        className="hw-line"
        style={
          {
            '--i': 2,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
            gap: 8,
          } as CSSProperties
        }
      >
        {fixed ? null : (
          <Fact
            label="같은 효과 가운데"
            value={`상위 ${formatChance(topShare(draw.source.effect, draw.value))}`}
          />
        )}
        <Fact
          label={fixed ? '이 효과가 붙을 확률' : '이 수치 이상 붙을 확률'}
          value={formatChance(chance)}
          sub={`평균 ${formatNumber(Math.round(1 / chance))}번에 한 번`}
        />
        <Fact label="이 효과 기록" value={`${formatNumber(record.nth)}번째`} sub={recordSub} />
      </div>
    </Flex>
  );
}

/** 여러 번 발랐을 때 등급마다 몇 개 나왔는지. 목록 위에 한 줄로 둔다. */
function BatchSummary({ draws }: { draws: ShownDraw[] }) {
  return (
    <Flex gap={6} align="center" wrap style={{ marginBottom: 10 }}>
      {HOLY_WATER_TIERS.map((tier) => {
        const hits = draws.filter((draw) => draw.tier !== null && draw.tier >= tier).length;
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

/** 아직 바르지 않았을 때. 한 번 바를 때 등급마다 나올 확률을 둔다. */
function TierOdds() {
  return (
    <Flex vertical gap={8}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        아직 바르지 않았습니다.
      </Text>
      {HOLY_WATER_TIERS.map((tier) => {
        const chance = TIER_CHANCES.get(tier) ?? 0;
        return (
          <Flex key={tier} gap={8} align="center">
            <span style={{ width: 88 }}>
              <TierTag tier={tier} />
            </span>
            <Text strong className="tnum">
              {formatChance(chance)}
            </Text>
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              평균 {formatNumber(Math.round(1 / chance))}번에 한 번
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
}

/** 여러 번 발랐을 때 방금 나온 것들. 한 줄에 하나, 먼저 나온 것이 아래다. */
function ResultList({ draws }: { draws: ShownDraw[] }) {
  const { token } = theme.useToken();
  const gold = useGold();
  return (
    <Flex vertical gap={2}>
      {draws.map((draw, index) => (
        <Flex
          key={draw.no}
          className={draw.tier === TOP_TIER ? 'hw-line hw-line--max' : 'hw-line'}
          gap={8}
          align="center"
          style={
            {
              '--i': index,
              padding: '4px 6px',
              borderRadius: token.borderRadiusSM,
              // 테두리 폭은 모든 줄이 같게 두어 최상위 줄만 높이가 달라지지 않게 한다.
              border: `1px solid ${draw.tier === TOP_TIER ? gold.soft : 'transparent'}`,
              background: draw.tier === TOP_TIER ? gold.bg : undefined,
            } as CSSProperties
          }
        >
          {/* 등급 표시는 수치 앞에 한 줄로 둔다. 수치 아래로 내리면 줄 높이가 들쭉날쭉해진다. */}
          <Text strong style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
            {draw.effect.name}
          </Text>
          {draw.tier !== null ? <TierTag tier={draw.tier} /> : null}
          <span style={{ flex: 'none', minWidth: 52, textAlign: 'right' }}>
            <ValueText draw={draw} strong />
          </span>
        </Flex>
      ))}
    </Flex>
  );
}

/**
 * 바른 기록 표. 기록이 쌓일수록 그리는 데 오래 걸려, 방금 나온 효과 칸보다 한 박자 늦게 그린다
 * (rows 는 useDeferredValue 로 늦춘 값이다). 같은 rows 면 다시 그리지 않는다.
 */
const HistoryTable = memo(function HistoryTable({ rows }: { rows: ShownDraw[] }) {
  const columns: TableColumnsType<ShownDraw> = [
    {
      title: '번째',
      dataIndex: 'no',
      width: 64,
      align: 'right',
      render: (no: number) => <span className="tnum">{formatNumber(no)}</span>,
    },
    {
      title: '효과',
      key: 'effect',
      render: (_value, draw) => <Text strong>{draw.effect.name}</Text>,
    },
    {
      title: '수치',
      key: 'value',
      width: 112,
      align: 'right',
      // 효과마다 최대치가 달라, 최대치에 견준 비율로 줄 세운다.
      sorter: (a, b) => a.value / effectMax(a.effect) - b.value / effectMax(b.effect),
      render: (_value, draw) => (
        <Flex vertical gap={2} align="flex-end">
          <ValueText draw={draw} />
          {draw.tier !== null ? (
            <TierTag tier={draw.tier} />
          ) : (
            <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              최대 {formatNumber(effectMax(draw.effect))}
            </Text>
          )}
        </Flex>
      ),
    },
  ];

  return (
    <Table<ShownDraw>
      columns={columns}
      dataSource={rows}
      rowKey="no"
      size="small"
      pagination={
        rows.length > PAGE_SIZE
          ? { pageSize: PAGE_SIZE, showSizeChanger: false, size: 'small' }
          : false
      }
      locale={{ emptyText: '아직 바르지 않았습니다.' }}
    />
  );
});

/** 경매장 최저가. 매물이 없거나 받지 못했으면 null. */
function lowestOf(state: PriceState | undefined): number | null {
  if (state?.status !== 'ok') return null;
  return state.price.offers[0]?.price ?? null;
}

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

/** 효과 고르기 목록. 수치가 하나뿐인 효과도 넣는다(음악 버프 효과를 노리는 사람이 있다). */
const EFFECT_OPTIONS = HOLY_WATER_EFFECTS.map((effect, index) => ({
  value: index,
  label: effect.name,
}));

/** 등급마다 한 번 발라 그 등급 이상이 나올 확률. 늘 같아 한 번만 센다. */
const TIER_CHANCES = new Map(HOLY_WATER_TIERS.map((tier) => [tier, tierChance(tier)]));

/** 노리는 효과. 이 효과가 이 수치 이상으로 붙기를 바란다. effect 는 HOLY_WATER_EFFECTS 의 순번이다. */
interface EffectTarget {
  effect: number;
  minValue: number;
}

/**
 * 무리아스의 성수 시뮬레이터. 유물 복원 창처럼 왼쪽 작업대에서 성수를 바르고 오른쪽에 방금 붙은 효과를
 * 크게 보인다. 스크롤 102장을 고르게 고르고 그 폭 안에서 수치를 고르게 고른다. 쓴 골드는 바른 횟수에
 * 성수의 경매장 최저가를 곱한다.
 */
export function HolyWaterSimulatorView({ simulator }: { simulator: Simulator }) {
  const formatGold = useGoldFormatter();
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();
  const reducedMotion = usePrefersReducedMotion();

  const priceNames = useMemo(() => [HOLY_WATER_NAME], []);
  const priceState = useMarketPrices(priceNames).get(HOLY_WATER_NAME);
  const price = lowestOf(priceState);
  const priceLoading = priceState?.status === 'loading';

  const shown = useMemo(() => simulator.draws.map(showDraw), [simulator.draws]);
  const latest = shown.slice(shown.length - simulator.lastBatch).reverse();
  const last = shown[shown.length - 1] ?? null;
  // 방금 붙은 효과가 몇 번째로 붙었는지와 그 앞까지의 최고 수치.
  const lastRecord = useMemo((): EffectRecord => {
    if (!last) return { nth: 0, best: null };
    let nth = 1;
    let best: number | null = null;
    for (const draw of shown) {
      if (draw === last || draw.source.effect !== last.source.effect) continue;
      nth += 1;
      best = Math.max(best ?? 0, draw.value);
    }
    return { nth, best };
  }, [shown, last]);

  // 연출. 한 번 발랐을 때만 돌리고, 누를 때 걸어 둔다(끈 채 바른 뒤 켜도 지난 연출이 돌지 않게).
  const [fxOn, setFxOn] = useState(readFxSetting);
  const animate = fxOn && !reducedMotion;
  const [armed, setArmed] = useState(false);
  const apply = (times: number) => {
    setArmed(animate);
    simulator.draw(times);
  };
  const play = armed && animate && simulator.lastBatch === 1 && last ? last.no : null;
  const playTier = play !== null && last ? last.tier : null;
  const reveal = armed && animate && simulator.lastBatch > 0 && last ? last.no : null;

  /*
   * 연출이 도는 동안에는 통계와 기록에 방금 바른 것을 넣지 않는다. 먼저 올라가면 연출이 끝나기 전에
   * 어느 등급인지 알려 버린다. 연출이 끝나면 넣는다.
   */
  const [settledNo, setSettledNo] = useState(0);
  const pending = play !== null && settledNo < play ? play : null;
  const goldExtra = playTier === TOP_TIER ? GOLD_EXTRA_MS : 0;
  const fxTotal = FX_DURATION + goldExtra;
  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => setSettledNo(pending), fxTotal);
    return () => window.clearTimeout(timer);
  }, [pending, fxTotal]);
  const counted = useMemo(
    () => (pending === null ? shown : shown.filter((draw) => draw.no !== pending)),
    [shown, pending],
  );

  const count = counted.length;
  const history = useMemo(() => [...counted].reverse(), [counted]);
  // 표는 성수 창보다 늦게 그린다. 누르자마자 창에 결과가 먼저 뜬다.
  const settledHistory = useDeferredValue(history);

  // 등급마다 그 등급 이상이 나온 횟수.
  const tierCounts = useMemo(() => {
    const counts = new Map<HolyWaterTier, number>(HOLY_WATER_TIERS.map((tier) => [tier, 0]));
    for (const draw of counted) {
      if (draw.tier === null) continue;
      for (const tier of HOLY_WATER_TIERS)
        if (draw.tier >= tier) counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    return counts;
  }, [counted]);

  // 작업대 배율. 휴대폰 폭에서는 원래 크기이고 넓을수록 키운다. 연출도 같은 배율로 커진다.
  const stageScale = screens.xl ? 1.45 : screens.lg ? 1.3 : screens.md ? 1.15 : 1;
  const fxStyle = {
    '--fx-accent': token.colorPrimary,
    '--fx-soft': token.colorPrimaryBg,
    '--fx-line': token.colorBorder,
    '--fx-surface': token.colorFillQuaternary,
    // 98% 이상 금빛. 세공의 한계 돌파 빛과 같은 금색 토큰이다.
    '--fx-gold': token.gold,
    '--fx-dur': `${play !== null ? FX_DURATION : 0}ms`,
    '--fx-spin': `${FX_SPIN}deg`,
    '--fx-extra': `${goldExtra}ms`,
    '--rf': stageScale,
  } as CSSProperties;

  /**
   * 특정 효과 기댓값 계산기. 떠 있는 창에 둔다. 창 밖을 눌러도 닫히지 않아, 열어 둔 채 바르기를
   * 이어 하며 그 효과가 몇 번 나왔는지 본다. 단추를 다시 누르거나 닫기를 누르면 닫힌다.
   */
  const [calcOpen, setCalcOpen] = useState(false);
  const [trials, setTrials] = useState(10);
  const [target, setTarget] = useState<EffectTarget | null>(null);
  const targetEffect = target ? HOLY_WATER_EFFECTS[target.effect] : null;
  const targetChance = target ? effectChance(target.effect, target.minValue) : 0;
  const targetHits = useMemo(
    () =>
      target
        ? counted.filter(
            (draw) => draw.source.effect === target.effect && draw.value >= target.minValue,
          ).length
        : 0,
    [counted, target],
  );

  const calculator = (
    <Flex vertical gap={10} style={{ width: 'min(440px, calc(100vw - 88px))' }}>
      <TrialCountInput value={trials} onChange={setTrials} />
      <Divider style={{ margin: 0 }} />
      <Flex gap={8} align="center" wrap>
        <Select<number>
          aria-label="특정 효과"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="예: 최대 대미지"
          value={target?.effect ?? null}
          onChange={(effect) =>
            setTarget(
              effect === undefined || effect === null
                ? null
                : { effect, minValue: effectMax(HOLY_WATER_EFFECTS[effect]) },
            )
          }
          options={EFFECT_OPTIONS}
          popupMatchSelectWidth={false}
          style={{ flex: '1 1 200px', minWidth: 0 }}
        />
        <InputNumber<number>
          aria-label="특정 효과의 가장 낮은 수치"
          min={1}
          max={targetEffect ? effectMax(targetEffect) : 1}
          value={target?.minValue ?? null}
          disabled={!target}
          onChange={(value) => {
            if (value === null || !target || !targetEffect) return;
            setTarget({
              ...target,
              minValue: Math.min(Math.max(Math.round(value), 1), effectMax(targetEffect)),
            });
          }}
          suffix="이상"
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
            verb="바르기"
            costPerTrial={price}
          />
        </>
      ) : null}
    </Flex>
  );

  const single = simulator.lastBatch <= 1;

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined" role="region" aria-label="성수 창">
        {/*
          작업대와 방금 붙은 효과 두 칸. 768px 미만에서는 위아래로 쌓는다. 오른쪽 칸은 높이를 정해 두어
          한 번과 10번을 오가도 창이 늘고 줄지 않는다.
        */}
        <Row gutter={[24, 20]} align="stretch">
          <Col xs={24} md={10} xl={9}>
            <Flex vertical gap={12} align="center">
              <Flex gap={4} align="center">
                <Text strong style={{ fontSize: 16 }}>
                  {HOLY_WATER_NAME}
                </Text>
              </Flex>
              <HolyWaterBench
                result={last}
                play={play}
                tier={playTier}
                iconSize={Math.round(48 * stageScale)}
                fxStyle={fxStyle}
              />
              <Button
                type="primary"
                size="large"
                onClick={() => apply(1)}
                style={{ minWidth: 200 }}
              >
                바르기
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
                  aria-label="성수 연출"
                />
                <Text style={{ fontSize: 13 }}>성수 연출</Text>
              </Flex>
              <Flex gap={8} wrap justify="center">
                <Button onClick={() => apply(10)}>10번 바르기</Button>
                <Popover
                  open={calcOpen}
                  trigger={[]}
                  placement="bottomLeft"
                  title={
                    <Flex justify="space-between" align="center" gap={8}>
                      <span>특정 효과 기댓값</span>
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseIcon />}
                        aria-label="특정 효과 기댓값 닫기"
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
                    특정 효과 기댓값
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
              aria-labelledby="holy-water-latest"
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
              <Text strong id="holy-water-latest" style={{ display: 'block', marginBottom: 12 }}>
                방금 붙은 효과
                {simulator.lastBatch > 1 ? ` ${formatNumber(simulator.lastBatch)}개` : ''}
              </Text>
              {last === null ? (
                <TierOdds />
              ) : (
                <div
                  key={reveal ?? 'still'}
                  className={reveal !== null ? 'hw-reveal' : undefined}
                  style={
                    {
                      ...fxStyle,
                      position: 'relative',
                      // 한 번 바른 결과는 칸 가운데에 크게 둔다.
                      flex: single ? 1 : undefined,
                      display: single ? 'flex' : undefined,
                      alignItems: single ? 'center' : undefined,
                      justifyContent: single ? 'center' : undefined,
                    } as CSSProperties
                  }
                >
                  {single ? (
                    <ResultDetail draw={last} record={lastRecord} />
                  ) : (
                    <>
                      <BatchSummary draws={latest} />
                      <ResultList draws={latest} />
                    </>
                  )}
                </div>
              )}
            </section>
          </Col>
        </Row>

        <Divider style={{ marginBlock: 16 }} />

        <Flex vertical gap={14}>
          {/* 여섯 칸. 넓으면 한 줄, 576px 이상은 세 칸씩, 그 아래는 두 칸씩 떨어진다. */}
          <Row gutter={[24, 16]} align="top">
            <Col xs={12} sm={8} lg={4}>
              <Statistic title="바르기" value={formatNumber(count)} suffix="번" styles={NUMERIC} />
            </Col>
            <Col xs={12} sm={8} lg={4}>
              <Statistic
                title="쓴 골드"
                value={price === null ? '-' : formatGold(price * count)}
                loading={priceLoading}
                styles={NUMERIC}
              />
            </Col>
            {HOLY_WATER_TIERS.map((tier) => (
              <Col key={tier} xs={12} sm={8} lg={4}>
                <Statistic
                  title={`${tier}% 이상`}
                  value={formatNumber(tierCounts.get(tier) ?? 0)}
                  suffix="번"
                  styles={NUMERIC}
                />
              </Col>
            ))}
          </Row>
          <Flex gap={6} align="center" wrap>
            {priceLoading ? <Spin size="small" /> : null}
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {priceLoading
                ? '성수 시세를 받는 중입니다.'
                : price === null
                  ? '성수 시세가 없습니다.'
                  : `성수 최저가 ${formatGold(price)}. 게임 데이터는 평균 10분 지연됩니다.`}
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
                바른 기록 {formatNumber(count)}번
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
