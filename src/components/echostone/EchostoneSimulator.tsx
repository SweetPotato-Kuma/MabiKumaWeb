import { useMemo, useState } from 'react';
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
  Table,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { CalculateIcon, CloseIcon, GemIcon, ResetIcon, StarFillIcon } from '@/components/icons';
import { TrialCountInput, TrialOdds } from '@/components/simulator/TrialOdds';
import { normalizeForSearch } from '@/features/auction/dictionary';
import { useMarketPrices, type PriceState } from '@/features/crafting/market';
import {
  abilityChance,
  abilityPool,
  abilityValueText,
  awakenUntil,
  ECHO_ABILITIES,
  ECHO_BOOSTERS,
  ECHO_STONES,
  echoStone,
  isHighLevel,
  levelRange,
  MAX_GRADE,
  MIN_GRADE,
  targetChance,
  type EchoResult,
  type EchoTarget,
} from '@/features/echostone/simulator';
import { formatChance } from '@/features/simulator/trials';
import { formatNumber } from '@/lib/format';
import { useNarrowScreen } from '@/lib/narrowScreen';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 목표까지 자동으로 돌리는 횟수 상한. */
const AUTO_LIMITS = [1000, 10000] as const;

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

const BOOSTER_NAMES = ECHO_BOOSTERS.map((booster) => booster.name);

/** 각성제 이름을 고르는 단추에 맞게 줄인다. "최고급 에코스톤 각성제" -> "최고급". */
const boosterLabel = (name: string) => name.replace(/\s*에코스톤 각성제$/, '') || '일반';

function lowestOf(state: PriceState | undefined): number | null {
  if (state?.status !== 'ok') return null;
  return state.price.offers[0]?.price ?? null;
}

/** 각성 결과 한 줄. 최대 레벨의 90% 이상이면 금빛으로 칠한다. */
function ResultBox({ result }: { result: EchoResult | null }) {
  const { token } = theme.useToken();
  const ability = result ? ECHO_ABILITIES[result.ability] : null;
  const high = result ? isHighLevel(result) : false;
  return (
    <section
      aria-label="각성 능력"
      style={{
        minHeight: 76,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderRadius: token.borderRadius,
        border: `1px solid ${high ? token.gold6 : token.colorBorderSecondary}`,
        background: high ? token.gold1 : token.colorFillQuaternary,
      }}
    >
      {result && ability ? (
        <>
          {high ? (
            <StarFillIcon style={{ color: token.gold7, fontSize: 18, flex: 'none' }} />
          ) : null}
          <Flex vertical gap={2} style={{ minWidth: 0 }}>
            <Text strong style={high ? { color: token.gold8 } : undefined}>
              {ability.name}
            </Text>
            <Text className="tnum" style={{ fontSize: 13, color: high ? token.gold8 : undefined }}>
              {result.level}레벨
              {abilityValueText(ability, result.level)
                ? ` (${abilityValueText(ability, result.level)})`
                : ''}
              <Text type="secondary" style={{ fontSize: 12 }}>
                {' '}
                / 최대 {ability.maxLevel}레벨
              </Text>
            </Text>
          </Flex>
        </>
      ) : (
        <Text type="secondary">각성 전</Text>
      )}
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

  const stone = echoStone(stoneId);
  const booster = ECHO_BOOSTERS.find((each) => each.name === boosterName) ?? ECHO_BOOSTERS[0];

  const priceStates = useMarketPrices(BOOSTER_NAMES);
  const prices = useMemo(
    () => new Map(BOOSTER_NAMES.map((name) => [name, lowestOf(priceStates.get(name))])),
    [priceStates],
  );
  const pricesLoading = BOOSTER_NAMES.some((name) => priceStates.get(name)?.status === 'loading');
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

  const totalUsed = Object.values(used).reduce((sum, count) => sum + count, 0);
  const spentGold = BOOSTER_NAMES.reduce(
    (sum, name) => sum + (prices.get(name) ?? 0) * (used[name] ?? 0),
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
    setResult(outcome.result);
    setUsed((prev) => ({ ...prev, [booster.name]: (prev[booster.name] ?? 0) + outcome.tries }));
    if (limit === null) setMessage('');
    else
      setMessage(
        outcome.hit
          ? `${formatNumber(outcome.tries)}번 만에 목표 능력이 나왔습니다.`
          : `${formatNumber(limit)}번 동안 목표 능력이 나오지 않았습니다.`,
      );
  };

  const changeStone = (id: number) => {
    setStoneId(id);
    setResult(null);
    setMessage('');
  };

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

              <ResultBox result={result} />

              <Flex gap={8} wrap>
                <Button type="primary" icon={<GemIcon />} onClick={() => run(null)}>
                  각성
                </Button>
                {AUTO_LIMITS.map((limit) => (
                  <Button key={limit} disabled={chance <= 0} onClick={() => run(limit)}>
                    목표까지 최대 {formatNumber(limit)}번
                  </Button>
                ))}
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
            {BOOSTER_NAMES.map((name) => (
              <Col key={name} xs={12} sm={6} lg={4}>
                <Statistic
                  title={boosterLabel(name)}
                  value={formatNumber(used[name] ?? 0)}
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
                setMessage('');
              }}
            >
              처음부터
            </Button>
          </div>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {BOOSTER_NAMES.map((name) => {
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
