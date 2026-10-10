import { readPersonal, writePersonal, removePersonal } from '@/lib/personalStorage';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Button,
  Card,
  Col,
  Divider,
  Flex,
  Grid,
  Input,
  InputNumber,
  Popover,
  Row,
  Segmented,
  Select,
  Statistic,
  Switch,
  Table,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { ItemIcon } from '@/components/ItemIcon';
import { CalculateIcon, CloseIcon, GemIcon, ResetIcon, StarFillIcon } from '@/components/icons';
import { TrialCountInput, TrialOdds } from '@/components/simulator/TrialOdds';
import { normalizeForSearch } from '@/features/auction/dictionary';
import { useMarketPrices, type PriceState } from '@/features/crafting/market';
import {
  abilityChance,
  abilityPool,
  abilityValueText,
  awakenUntil,
  canReroll,
  ECHO_ABILITIES,
  ECHO_BOOSTERS,
  ECHO_STONES,
  echoStone,
  fxTierOf,
  isHighLevel,
  levelRange,
  MAX_GRADE,
  MIN_GRADE,
  POLISH_STONE,
  rerollChance,
  rerollLevel,
  targetChance,
  type EchoAbility,
  type EchoResult,
  type EchoTarget,
} from '@/features/echostone/simulator';
import { formatChance } from '@/features/simulator/trials';
import { formatNumber } from '@/lib/format';
import { useNarrowScreen } from '@/lib/narrowScreen';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import './echostoneFx.css';

const { Text } = Typography;

/** 목표까지 자동으로 돌리는 횟수 상한. */
const AUTO_LIMITS = [1000, 10000] as const;

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

const BOOSTER_NAMES = ECHO_BOOSTERS.map((booster) => booster.name);
/** 시세를 받을 재료. 각성제 셋과 연마석. */
const PRICE_NAMES = [...BOOSTER_NAMES, POLISH_STONE.name];

/** 각성제 이름을 고르는 단추에 맞게 줄인다. "최고급 에코스톤 각성제" -> "최고급". */
const boosterLabel = (name: string) => name.replace(/\s*에코스톤 각성제$/, '') || '일반';

/** 통계 칸 이름. 각성제는 줄인 이름, 연마석은 "연마석". */
const materialLabel = (name: string) =>
  name === POLISH_STONE.name ? '연마석' : boosterLabel(name);

function lowestOf(state: PriceState | undefined): number | null {
  if (state?.status !== 'ok') return null;
  return state.price.offers[0]?.price ?? null;
}

/** 각성 연출 한 번의 길이, 모여드는 빛 구슬, 빛살, 반짝임, 금빛 빛살 수. */
const FX_DURATION = 1200;
/**
 * 각성제마다 모여드는 빛 구슬. 일반은 셋이 곧게, 고급은 다섯이 돌며, 최고급은 여덟이 돌며 금빛으로 모이고
 * 둘레에 도는 고리가 하나 더 생긴다. 어느 각성제를 썼는지 판만 보고도 알게 한다.
 */
const ORB_COUNTS = [3, 5, 8] as const;
const RAYS = 12;
const SPARKS = 10;
const GOLD_RAYS = 16;
/** 90% 이상은 금빛이 다 퍼질 때까지 결과를 늦게 센다. */
const GOLD_EXTRA_MS = 500;
/** "에코스톤 연출" 끄기를 이 브라우저에 기억해 두는 자리. */
const FX_STORAGE_KEY = 'mabikuma:echostoneFx';
/** 에코스톤 그림을 찾는 경매장 카테고리. */
const STONE_CATEGORY = '에코스톤';

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

/**
 * 각성 판. 가운데에 고른 에코스톤이 놓이고, 각성하면 빛 구슬이 모여 돌이 터지며 각성 능력 카드가 튀어나온다.
 * play 가 바뀌면 판을 새로 그려 연출을 처음부터 돌린다. 연출하지 않을 때는 마지막 각성 능력을 그대로 둔다.
 * 최대 레벨의 90% 이상이면 연출 밖에서도 카드를 금색으로 칠한다.
 */
/** "19레벨 (9.5)". 수치가 없는 능력은 레벨만. */
const levelText = (ability: EchoAbility, level: number) => {
  const value = abilityValueText(ability, level);
  return value ? `${level}레벨 (${value})` : `${level}레벨`;
};

function EchoStage({
  stoneName,
  result,
  play,
  mode,
  booster,
  previousLevel,
  fxStyle,
  scale,
}: {
  stoneName: string;
  result: EchoResult | null;
  /** 연출할 각성의 번호. 연출하지 않으면 null. */
  play: number | null;
  /** 각성인지, 연마석으로 레벨만 다시 정한 것인지. */
  mode: 'awaken' | 'polish';
  /** 쓴 각성제의 자리(0 일반, 1 고급, 2 최고급). */
  booster: number;
  /** 연마석으로 다시 정하기 전 레벨. 연출 동안 이 값에서 새 값으로 바뀐다. */
  previousLevel: number | null;
  fxStyle: CSSProperties;
  /** 판 배율(--rf 와 같다). 돌 그림 크기도 같이 키운다. */
  scale: number;
}) {
  const { token } = theme.useToken();
  const ability = result ? ECHO_ABILITIES[result.ability] : null;
  const playing = play !== null && result !== null;
  const polishing = playing && mode === 'polish';
  // 레벨을 다시 정하는 동안에는 이전 레벨로 칠한다. 새 레벨로 먼저 칠하면 연출 전에 결과를 알려 버린다.
  const shownLevel = polishing && previousLevel !== null ? previousLevel : result?.level;
  const high =
    result && shownLevel !== undefined ? isHighLevel({ ...result, level: shownLevel }) : false;
  const awakening = playing && mode === 'awaken';
  const tier = result ? fxTierOf(result) : 0;
  const classes = ['es-stage'];
  if (playing) {
    classes.push('es-play', polishing ? 'es-polish' : `es-b${booster}`);
    // 겹은 아래 것을 모두 품는다. 90% 이상이면 번쩍임, 빛살, 반짝임, 금빛이 함께 돈다.
    for (const step of [1, 2, 3]) if (tier >= step) classes.push(`es-t${step}`);
  }
  const at = (step: number) => playing && tier >= step;
  return (
    <section aria-label="각성 능력">
      <div key={play ?? 'still'} className={classes.join(' ')} style={fxStyle}>
        <div className="es-stage-body">
          <div className="es-ring" aria-hidden />
          <div className="es-ring es-ring--inner" aria-hidden />
          {at(3) ? (
            <div className="es-gold-layer" aria-hidden>
              <div className="es-gold-flash" />
              {angles(GOLD_RAYS).map((angle, index) => (
                <span
                  key={angle}
                  className="es-gold-ray"
                  style={{ '--a': `${angle}deg`, '--i': index } as CSSProperties}
                />
              ))}
            </div>
          ) : null}
          {at(2)
            ? angles(RAYS).map((angle) => (
                <span
                  key={`ray-${angle}`}
                  aria-hidden
                  className="es-ray"
                  style={{ '--a': `${angle}deg` } as CSSProperties}
                />
              ))
            : null}
          {at(1) ? <div className="es-flash" aria-hidden /> : null}
          {awakening ? <div className="es-burst" aria-hidden /> : null}
          {awakening && booster === 2 ? (
            <div className="es-ring es-ring--rune" aria-hidden />
          ) : null}
          {awakening
            ? angles(ORB_COUNTS[booster] ?? ORB_COUNTS[0]).map((angle, index) => (
                <span
                  key={`orb-${angle}`}
                  aria-hidden
                  className="es-orb"
                  style={{ '--a': `${angle}deg`, '--i': index } as CSSProperties}
                />
              ))
            : null}
          {result === null || awakening ? (
            <div className="es-stone" aria-hidden>
              <ItemIcon category={STONE_CATEGORY} name={stoneName} size={Math.round(48 * scale)} />
            </div>
          ) : null}
          {result && ability ? (
            <div className={high ? 'es-result es-result--top' : 'es-result'}>
              {/* 연마석: 카드 위를 빛 줄기가 한 번 훑고 레벨이 다시 정해진다. */}
              {polishing ? <span className="es-polish-shine" aria-hidden /> : null}
              <Text strong style={high ? { color: token.gold8 } : undefined}>
                {high ? (
                  <StarFillIcon
                    style={{
                      color: token.gold7,
                      fontSize: 14,
                      marginInlineEnd: 4,
                      verticalAlign: -2,
                    }}
                  />
                ) : null}
                {ability.name}
              </Text>
              <Text
                className="tnum"
                style={{ fontSize: 13, color: high ? token.gold8 : undefined }}
              >
                {polishing && previousLevel !== null ? (
                  <span className="es-level-swap">
                    <span className="es-level-old" aria-hidden>
                      {levelText(ability, previousLevel)}
                    </span>
                    <span className="es-level">{levelText(ability, result.level)}</span>
                  </span>
                ) : (
                  levelText(ability, result.level)
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {' '}
                  / 최대 {ability.maxLevel}레벨
                </Text>
              </Text>
              {result.rerolled ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  레벨 재부여함
                </Text>
              ) : null}
            </div>
          ) : (
            <Text type="secondary" className="es-idle">
              각성 전
            </Text>
          )}
          {at(3)
            ? angles(SPARKS).map((angle, index) => (
                <StarFillIcon
                  key={`spark-${angle}`}
                  aria-hidden
                  className="es-spark"
                  style={{ '--a': `${angle + 18}deg`, '--i': index } as CSSProperties}
                />
              ))
            : null}
          {at(3) ? <StarFillIcon aria-hidden className="es-glint" /> : null}
        </div>
      </div>
    </section>
  );
}

interface PoolRow {
  ability: number;
  name: string;
  low: number;
  high: number;
  maxLevel: number;
  chance: number;
}

/** 고른 돌과 등급에서 나올 수 있는 능력 전부. 확률 높은 순. */
function PoolTable({ rows, onTarget }: { rows: PoolRow[]; onTarget: (ability: number) => void }) {
  const narrow = useNarrowScreen();
  const [keyword, setKeyword] = useState('');
  const term = normalizeForSearch(keyword);
  const shown = term ? rows.filter((row) => normalizeForSearch(row.name).includes(term)) : rows;

  const levels = (row: PoolRow) =>
    row.low === row.high ? `${row.high}레벨` : `${row.low}~${row.high}레벨`;

  const columns: TableColumnsType<PoolRow> = [
    {
      title: '능력',
      key: 'name',
      render: (_value, row) => (
        <Flex vertical gap={2}>
          <Text>{row.name}</Text>
          {narrow ? (
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {levels(row)}
            </Text>
          ) : null}
        </Flex>
      ),
    },
    ...(narrow
      ? []
      : [
          {
            title: '나오는 레벨',
            key: 'levels',
            width: 120,
            align: 'right' as const,
            render: (_value: unknown, row: PoolRow) => (
              <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
                {levels(row)}
              </Text>
            ),
          },
        ]),
    {
      title: '확률',
      key: 'chance',
      width: 96,
      align: 'right',
      sorter: (a, b) => a.chance - b.chance,
      defaultSortOrder: 'descend',
      render: (_value, row) => (
        <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
          {formatChance(row.chance)}
        </Text>
      ),
    },
    {
      title: '',
      key: 'target',
      width: 72,
      align: 'right',
      render: (_value, row) => (
        <Button
          size="small"
          onClick={() => onTarget(row.ability)}
          aria-label={`${row.name} 목표로`}
        >
          목표로
        </Button>
      ),
    },
  ];

  return (
    <Card title="나오는 능력" size="small">
      <Flex vertical gap={10}>
        <Input
          aria-label="능력 이름으로 찾기"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="예: 컴뱃 마스터리"
          allowClear
          style={{ maxWidth: 320 }}
        />
        <Table<PoolRow>
          columns={columns}
          dataSource={shown}
          rowKey="ability"
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
        />
      </Flex>
    </Card>
  );
}

/**
 * 에코스톤 각성 시뮬레이터. 돌 종류, 등급, 각성제를 고르고 각성한다. 쓴 골드는 각성할 때마다 쓴 각성제의
 * 경매장 최저가를 더한다.
 */
export function EchostoneSimulatorView() {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const formatGold = useGoldFormatter();
  const [stoneId, setStoneId] = useState(ECHO_STONES[0].id);
  const [grade, setGrade] = useState(MAX_GRADE);
  const [boosterName, setBoosterName] = useState(BOOSTER_NAMES[0]);
  const [result, setResult] = useState<EchoResult | null>(null);
  const [target, setTarget] = useState<EchoTarget | null>(null);
  const [message, setMessage] = useState('');
  const [used, setUsed] = useState<Record<string, number>>({});
  const [calcOpen, setCalcOpen] = useState(false);
  const [trials, setTrials] = useState(100);

  // 연출. 누를 때의 스위치 상태로 정한다(끈 채 각성한 뒤 켜도 지난 연출이 돌지 않게).
  const [fxOn, setFxOn] = useState(readFxSetting);
  const [awakened, setAwakened] = useState(0);
  const [play, setPlay] = useState<{
    no: number;
    /** 쓴 재료 이름(각성제나 연마석). */
    item: string;
    mode: 'awaken' | 'polish';
    /** 쓴 각성제 자리. 판의 빛 구슬 모양을 고른다. */
    booster: number;
    /** 연마석으로 다시 정하기 전 레벨. */
    previousLevel: number | null;
  } | null>(null);
  /*
   * 연출이 도는 동안에는 방금 쓴 각성제나 연마석을 횟수와 쓴 골드에 넣지 않는다. 먼저 올라가면 판보다 숫자가
   * 앞서 간다. 연출이 끝나면 넣는다.
   */
  const [settled, setSettled] = useState(0);
  const pending = play !== null && settled < play.no ? play : null;
  const fxTotal = FX_DURATION + (result && fxTierOf(result) === 3 ? GOLD_EXTRA_MS : 0);
  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => setSettled(pending.no), fxTotal);
    return () => window.clearTimeout(timer);
  }, [pending, fxTotal]);

  const stone = echoStone(stoneId);
  const booster = ECHO_BOOSTERS.find((each) => each.name === boosterName) ?? ECHO_BOOSTERS[0];

  const priceStates = useMarketPrices(PRICE_NAMES);
  const prices = useMemo(
    () => new Map(PRICE_NAMES.map((name) => [name, lowestOf(priceStates.get(name))])),
    [priceStates],
  );
  const pricesLoading = PRICE_NAMES.some((name) => priceStates.get(name)?.status === 'loading');
  const perTry = prices.get(booster.name) ?? null;

  const pool = useMemo(() => abilityPool(stone, grade), [stone, grade]);
  const rows: PoolRow[] = useMemo(
    () =>
      pool.map(({ ability }) => {
        const each = ECHO_ABILITIES[ability];
        const { low, high } = levelRange(each, grade, booster);
        return {
          ability,
          name: each.name,
          low,
          high,
          maxLevel: each.maxLevel,
          chance: abilityChance(stone, grade, ability),
        };
      }),
    [pool, stone, grade, booster],
  );

  // 돌이나 등급이 바뀌어 목표가 목록에서 빠지면 목표를 비운다.
  const activeTarget =
    target && pool.some((entry) => entry.ability === target.ability) ? target : null;
  const targetAbility = activeTarget ? ECHO_ABILITIES[activeTarget.ability] : null;
  const targetLevels = targetAbility ? levelRange(targetAbility, grade, booster) : null;
  const chance = activeTarget ? targetChance(stone, grade, booster, activeTarget) : 0;

  const shownUsed = useMemo(
    () => (pending ? { ...used, [pending.item]: (used[pending.item] ?? 1) - 1 } : used),
    [used, pending],
  );
  // 각성 횟수는 각성제를 쓴 횟수다. 연마석은 따로 센다.
  const totalUsed = BOOSTER_NAMES.reduce((sum, name) => sum + (shownUsed[name] ?? 0), 0);
  const spentGold = PRICE_NAMES.reduce(
    (sum, name) => sum + (prices.get(name) ?? 0) * (shownUsed[name] ?? 0),
    0,
  );

  const run = (limit: number | null) => {
    const outcome = awakenUntil(
      stone,
      grade,
      booster,
      limit === null ? null : activeTarget,
      limit ?? 1,
    );
    const next = awakened + 1;
    setAwakened(next);
    setResult(outcome.result);
    setUsed((prev) => ({ ...prev, [booster.name]: (prev[booster.name] ?? 0) + outcome.tries }));
    // 연출은 한 번 각성할 때만 돈다. 목표까지 자동으로 돌리면 마지막 결과를 바로 놓는다.
    setPlay(
      fxOn && limit === null
        ? {
            no: next,
            item: booster.name,
            mode: 'awaken',
            booster: Math.max(0, ECHO_BOOSTERS.indexOf(booster)),
            previousLevel: null,
          }
        : null,
    );
    if (limit === null) setMessage('');
    else
      setMessage(
        outcome.hit
          ? `${formatNumber(outcome.tries)}번 만에 목표 능력이 나왔습니다.`
          : `${formatNumber(limit)}번 동안 목표 능력이 나오지 않았습니다.`,
      );
  };

  /** 연마석으로 지금 각성 능력의 레벨을 한 번 다시 정한다. */
  const polish = () => {
    if (!canReroll(result)) return;
    const next = awakened + 1;
    setAwakened(next);
    setResult(rerollLevel(result, grade));
    setUsed((prev) => ({ ...prev, [POLISH_STONE.name]: (prev[POLISH_STONE.name] ?? 0) + 1 }));
    setPlay(
      fxOn
        ? {
            no: next,
            item: POLISH_STONE.name,
            mode: 'polish',
            booster: 0,
            previousLevel: result.level,
          }
        : null,
    );
    setMessage('');
  };

  const changeStone = (id: number) => {
    setStoneId(id);
    setResult(null);
    setPlay(null);
    setMessage('');
  };

  const stageScale = screens.md ? 1.1 : 1;
  const fxStyle = {
    '--fx-accent': token.colorPrimary,
    '--fx-soft': token.colorPrimaryBg,
    '--fx-line': token.colorBorder,
    '--fx-line-soft': token.colorBorderSecondary,
    '--fx-surface': token.colorFillQuaternary,
    '--fx-card': token.colorBgContainer,
    '--fx-radius': `${token.borderRadius}px`,
    // 90% 이상 금빛. 다른 시뮬레이터의 최상위 결과와 같은 금색 토큰이다.
    '--fx-gold': token.gold,
    '--fx-gold-line': token.gold6,
    '--fx-gold-bg': token.gold1,
    '--fx-dur': `${play !== null ? FX_DURATION : 0}ms`,
    '--rf': stageScale,
  } as CSSProperties;

  const pickTarget = (ability: number) => {
    const each = ECHO_ABILITIES[ability];
    setTarget({ ability, minLevel: levelRange(each, grade, booster).high });
    setMessage('');
  };

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined" role="region" aria-label="에코스톤 각성">
        {/* 각성 칸과 목표 칸. 768px 미만에서는 위아래로 쌓는다. */}
        <Row gutter={[24, 20]} align="stretch">
          <Col xs={24} md={11}>
            <Flex vertical gap={12}>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={14}>
                  <Flex vertical gap={4}>
                    <label htmlFor="echostone-stone">
                      <Text strong style={{ fontSize: 13 }}>
                        에코스톤
                      </Text>
                    </label>
                    <Select<number>
                      id="echostone-stone"
                      value={stoneId}
                      onChange={changeStone}
                      options={ECHO_STONES.map((each) => ({ value: each.id, label: each.name }))}
                    />
                  </Flex>
                </Col>
                <Col xs={24} sm={10}>
                  <Flex vertical gap={4}>
                    <label htmlFor="echostone-grade">
                      <Text strong style={{ fontSize: 13 }}>
                        등급
                      </Text>
                    </label>
                    <InputNumber<number>
                      id="echostone-grade"
                      min={MIN_GRADE}
                      max={MAX_GRADE}
                      value={grade}
                      onChange={(next) => {
                        if (next === null) return;
                        setGrade(Math.min(MAX_GRADE, Math.max(MIN_GRADE, Math.round(next))));
                      }}
                      className="tnum"
                      style={{ width: '100%' }}
                    />
                  </Flex>
                </Col>
              </Row>
              <Flex vertical gap={4}>
                <Text strong style={{ fontSize: 13 }} id="echostone-booster">
                  각성제
                </Text>
                <Segmented<string>
                  aria-labelledby="echostone-booster"
                  block
                  value={boosterName}
                  onChange={setBoosterName}
                  options={BOOSTER_NAMES.map((name) => ({
                    value: name,
                    label: boosterLabel(name),
                  }))}
                />
              </Flex>

              <EchoStage
                stoneName={stone.name}
                result={result}
                play={play?.no ?? null}
                mode={play?.mode ?? 'awaken'}
                booster={play?.booster ?? 0}
                previousLevel={pending?.previousLevel ?? null}
                fxStyle={fxStyle}
                scale={stageScale}
              />

              <Flex gap={8} wrap>
                <Button type="primary" icon={<GemIcon />} onClick={() => run(null)}>
                  각성
                </Button>
                <Button disabled={!canReroll(result) || pending !== null} onClick={polish}>
                  {result?.rerolled ? '레벨 재부여함' : '레벨 재부여'}
                </Button>
                {AUTO_LIMITS.map((limit) => (
                  <Button key={limit} disabled={chance <= 0} onClick={() => run(limit)}>
                    목표까지 최대 {formatNumber(limit)}번
                  </Button>
                ))}
              </Flex>
              <Flex gap={8} align="center">
                <Switch
                  checked={fxOn}
                  onChange={(on) => {
                    setFxOn(on);
                    setPlay(null);
                    writeFxSetting(on);
                  }}
                  aria-label="에코스톤 연출"
                />
                <Text style={{ fontSize: 13 }}>에코스톤 연출</Text>
              </Flex>
              {/* 결과 문구 자리는 비어 있을 때도 잡아 둔다. 문구가 뜨고 질 때 아래가 밀리지 않게 한다. */}
              <Text
                strong
                role="status"
                className="tnum"
                style={{ minHeight: 22, lineHeight: '22px' }}
              >
                {message}
              </Text>
            </Flex>
          </Col>

          <Col xs={24} md={13}>
            <section
              aria-label="목표 능력"
              style={{
                height: '100%',
                padding: 16,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
              }}
            >
              <Flex vertical gap={10}>
                <Text strong>목표 능력</Text>
                <Select<number>
                  aria-label="목표 능력"
                  showSearch
                  allowClear
                  placeholder="능력 고르기"
                  value={activeTarget?.ability}
                  onChange={(ability) =>
                    ability === undefined ? setTarget(null) : pickTarget(ability)
                  }
                  onClear={() => setTarget(null)}
                  optionFilterProp="label"
                  options={[...rows]
                    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
                    .map((row) => ({ value: row.ability, label: row.name }))}
                  style={{ width: '100%' }}
                />
                {activeTarget && targetLevels ? (
                  <Flex gap={8} align="center" wrap>
                    <label htmlFor="echostone-min-level">
                      <Text style={{ fontSize: 13 }}>최소 레벨</Text>
                    </label>
                    <InputNumber<number>
                      id="echostone-min-level"
                      size="small"
                      min={targetLevels.low}
                      max={targetLevels.high}
                      value={Math.min(
                        Math.max(activeTarget.minLevel, targetLevels.low),
                        targetLevels.high,
                      )}
                      onChange={(next) => {
                        if (next === null) return;
                        setTarget({ ...activeTarget, minLevel: Math.round(next) });
                        setMessage('');
                      }}
                      suffix="레벨"
                      className="tnum"
                      style={{ width: 100 }}
                    />
                    <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                      이 등급과 각성제로 {targetLevels.low}~{targetLevels.high}레벨
                    </Text>
                  </Flex>
                ) : null}
                {activeTarget ? (
                  <Flex gap={8} align="center" wrap>
                    <Text className="tnum" style={{ fontSize: 13 }}>
                      한 번에 <Text strong>{formatChance(chance)}</Text>, 평균{' '}
                      <Text strong>{formatNumber(Math.ceil(1 / chance))}번</Text>에 한 번
                    </Text>
                    {/* 지금 붙은 능력이 목표 능력이고 레벨이 모자라면, 연마석으로 레벨만 다시 정했을 때의 확률. */}
                    {canReroll(result) &&
                    result.ability === activeTarget.ability &&
                    result.level < activeTarget.minLevel ? (
                      <Text className="tnum" style={{ fontSize: 13 }}>
                        레벨 재부여로 {activeTarget.minLevel}레벨 이상{' '}
                        <Text strong>
                          {formatChance(rerollChance(result, grade, activeTarget.minLevel))}
                        </Text>
                      </Text>
                    ) : null}
                    <Popover
                      open={calcOpen}
                      trigger={[]}
                      placement={screens.md ? 'bottomLeft' : 'bottom'}
                      title={
                        <Flex justify="space-between" align="center" gap={8}>
                          <span>목표 능력 기댓값</span>
                          <Button
                            type="text"
                            size="small"
                            icon={<CloseIcon />}
                            aria-label="목표 능력 기댓값 닫기"
                            onClick={() => setCalcOpen(false)}
                          />
                        </Flex>
                      }
                      content={
                        <Flex vertical gap={10} style={{ width: 'min(400px, calc(100vw - 88px))' }}>
                          <TrialCountInput value={trials} onChange={setTrials} />
                          <TrialOdds
                            framed={false}
                            trials={trials}
                            chance={chance}
                            verb="각성"
                            costPerTrial={perTry}
                          />
                        </Flex>
                      }
                    >
                      <Button
                        size="small"
                        icon={<CalculateIcon />}
                        aria-expanded={calcOpen}
                        onClick={() => setCalcOpen(!calcOpen)}
                      >
                        목표 능력 기댓값
                      </Button>
                    </Popover>
                  </Flex>
                ) : null}
              </Flex>
            </section>
          </Col>
        </Row>

        <Divider style={{ marginBlock: 16 }} />

        <Flex vertical gap={14}>
          <Row gutter={[24, 16]} align="top">
            <Col xs={12} sm={6} lg={4}>
              <Statistic
                title="각성"
                value={formatNumber(totalUsed)}
                suffix="번"
                styles={NUMERIC}
              />
            </Col>
            <Col xs={24} sm={8} lg={6}>
              <Statistic
                title="쓴 골드"
                value={formatGold(spentGold)}
                loading={pricesLoading}
                styles={NUMERIC}
              />
            </Col>
            {PRICE_NAMES.map((name) => (
              <Col key={name} xs={12} sm={6} lg={3}>
                <Statistic
                  title={materialLabel(name)}
                  value={formatNumber(shownUsed[name] ?? 0)}
                  suffix="개"
                  styles={NUMERIC}
                />
              </Col>
            ))}
          </Row>
          <div>
            <Button
              icon={<ResetIcon />}
              disabled={totalUsed === 0 && result === null}
              onClick={() => {
                setUsed({});
                setResult(null);
                setPlay(null);
                setMessage('');
              }}
            >
              처음부터
            </Button>
          </div>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {PRICE_NAMES.map((name) => {
              const price = prices.get(name);
              return price == null ? `${name} 시세 없음` : `${name} 최저가 ${formatGold(price)}`;
            }).join(', ')}
            . 게임 데이터는 평균 10분 지연됩니다.
          </Text>
        </Flex>
      </Card>

      <PoolTable key={`${stoneId}-${grade}`} rows={rows} onTarget={pickTarget} />
    </Flex>
  );
}
