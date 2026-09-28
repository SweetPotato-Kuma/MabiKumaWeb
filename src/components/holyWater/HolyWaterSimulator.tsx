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
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { ItemIcon } from '@/components/ItemIcon';
import {
  CalculateIcon,
  CloseIcon,
  InfoIcon,
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
  scrollLabel,
  tierChance,
  tierOf,
  type HolyWaterDraw,
  type HolyWaterEffect,
  type HolyWaterScroll,
  type HolyWaterSimulator as Simulator,
  type HolyWaterTier,
} from '@/features/holyWater/simulator';
import { formatChance } from '@/features/simulator/trials';
import { formatGold, formatGoldShort, formatNumber } from '@/lib/format';
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
/** 99% 이상 금빛 때문에 결과를 늦게 드러내는 시간. */
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

/** "25~30". 폭이 한 칸이면 그 수치만. */
const rangeText = (min: number, max: number) => (min === max ? `${min}` : `${min}~${max}`);

/**
 * 등급 표시. 99% 이상은 별과 굵은 액센트, 90%와 95% 이상은 액센트 테두리, 50% 이상은 기본 테두리다.
 * 바탕은 칠하지 않는다. 유물 복원 창의 "이데아 이상" 표시와 같다.
 */
function TierTag({ tier }: { tier: HolyWaterTier }) {
  const { token } = theme.useToken();
  const accent = tier >= 90;
  return (
    <Tag
      icon={tier === 99 ? <StarFillIcon aria-hidden /> : undefined}
      style={{
        marginInlineEnd: 0,
        whiteSpace: 'nowrap',
        fontWeight: tier === 99 ? 700 : undefined,
        color: accent ? token.colorPrimary : undefined,
        borderColor: accent ? token.colorPrimary : undefined,
        background: 'transparent',
      }}
    >
      {tier}% 이상
    </Tag>
  );
}

/** "+30". 99% 이상은 굵은 액센트 색이다. 색만으로 가르지 않게 등급 표시가 함께 붙는다. */
function ValueText({ draw, size }: { draw: ShownDraw; size?: number }) {
  const { token } = theme.useToken();
  const top = draw.tier === 99;
  return (
    <Text
      className="tnum"
      strong={top}
      style={{
        fontSize: size,
        whiteSpace: 'nowrap',
        color: top ? token.colorPrimary : undefined,
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
    // 등급은 아래 것을 모두 품는다. 99% 이상이면 번쩍임, 빛살, 반짝임, 금빛이 함께 돈다.
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
        {at(99) ? (
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
        {at(99) ? <StarFillIcon aria-hidden className="hw-glint" /> : null}
      </div>
    </div>
  );
}

/** 방금 붙은 효과 하나를 크게. 한 번 발랐을 때 오른쪽 칸을 채운다. */
function ResultDetail({ draw }: { draw: ShownDraw }) {
  return (
    <Flex vertical gap={12}>
      <Flex className="hw-line" vertical gap={2} style={{ '--i': 0 } as CSSProperties}>
        <Text strong style={{ fontSize: 18 }}>
          {draw.effect.name}
        </Text>
        <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
          {scrollLabel(draw.source)} ({rangeText(draw.source.min, draw.source.max)})
        </Text>
      </Flex>
      <Flex
        className={draw.tier === 99 ? 'hw-line hw-line--max' : 'hw-line'}
        gap={10}
        align="baseline"
        wrap
        style={{ '--i': 1 } as CSSProperties}
      >
        <ValueText draw={draw} size={28} />
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          최대 {formatNumber(effectMax(draw.effect))}
        </Text>
        {draw.tier !== null ? <TierTag tier={draw.tier} /> : null}
      </Flex>
    </Flex>
  );
}

/** 여러 번 발랐을 때 방금 나온 것들. 한 줄에 하나, 먼저 나온 것이 아래다. */
function ResultList({ draws }: { draws: ShownDraw[] }) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={2}>
      {draws.map((draw, index) => (
        <Flex
          key={draw.no}
          className={draw.tier === 99 ? 'hw-line hw-line--max' : 'hw-line'}
          gap={8}
          align="center"
          style={
            {
              '--i': index,
              padding: '4px 6px',
              borderRadius: token.borderRadiusSM,
            } as CSSProperties
          }
        >
          <Flex vertical gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text strong style={{ lineHeight: 1.35 }}>
              {draw.effect.name}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {scrollLabel(draw.source)}
            </Text>
          </Flex>
          <Flex vertical gap={2} align="flex-end" style={{ flex: 'none', minWidth: 72 }}>
            <ValueText draw={draw} />
            {draw.tier !== null ? <TierTag tier={draw.tier} /> : null}
          </Flex>
        </Flex>
      ))}
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
      render: (_value, draw) => (
        <Flex vertical gap={0} style={{ minWidth: 0 }}>
          <Text strong>{draw.effect.name}</Text>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {scrollLabel(draw.source)} ({rangeText(draw.source.min, draw.source.max)})
          </Text>
        </Flex>
      ),
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

/** 수치가 하나뿐이라 등급을 매기지 않는 스크롤 수. */
const FIXED_SCROLLS = HOLY_WATER_SCROLLS.filter(
  (scroll) => effectMax(HOLY_WATER_EFFECTS[scroll.effect]) <= 1,
).length;

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
  const goldExtra = playTier === 99 ? GOLD_EXTRA_MS : 0;
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
    // 99% 이상 금빛. 세공의 한계 돌파 빛과 같은 금색 토큰이다.
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
            note={`스크롤 ${formatNumber(HOLY_WATER_SCROLLS.length)}장이 똑같이 나오고 수치는 그 스크롤의 폭 안에서 고르게 나온다고 본 확률입니다. 골드는 성수 최저가 기준입니다.`}
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
                <Tooltip
                  title={`효과 스크롤 ${formatNumber(HOLY_WATER_SCROLLS.length)}장 가운데 한 장이 똑같은 확률(1/${formatNumber(HOLY_WATER_SCROLLS.length)})로 골라지고, 수치는 그 스크롤의 폭 안에서 고르게 정해집니다. 게임 클라이언트 데이터 기준이며 골드나 아이템은 들지 않습니다.`}
                >
                  <InfoIcon aria-label="뽑는 방식" tabIndex={0} style={{ cursor: 'help' }} />
                </Tooltip>
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
                <Text type="secondary" style={{ fontSize: 13 }}>
                  아직 바르지 않았습니다.
                </Text>
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
                  {single ? <ResultDetail draw={last} /> : <ResultList draws={latest} />}
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
                title={
                  <StatTitle
                    label="쓴 골드"
                    detail={
                      price === null
                        ? '성수 매물이 없거나 시세를 받지 못해 셀 수 없습니다.'
                        : `바른 횟수에 성수 최저가 ${formatGold(price)}를 곱했습니다.`
                    }
                  />
                }
                value={price === null ? '-' : formatGoldShort(price * count)}
                loading={priceLoading}
                styles={NUMERIC}
              />
            </Col>
            {HOLY_WATER_TIERS.map((tier) => (
              <Col key={tier} xs={12} sm={8} lg={4}>
                <Statistic
                  title={
                    <StatTitle
                      label={`${tier}% 이상`}
                      detail={`수치가 그 효과 최대치의 ${tier}% 이상인 횟수입니다. 한 번에 ${formatChance(TIER_CHANCES.get(tier) ?? 0)}입니다. 수치가 하나뿐인 스크롤 ${formatNumber(FIXED_SCROLLS)}장(세트 효과, 음악 버프 효과, 피어싱 저항)은 세지 않습니다.`}
                    />
                  }
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
