import { memo, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Grid,
  InputNumber,
  Row,
  Segmented,
  Select,
  Skeleton,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { AddIcon, DeleteIcon, InfoIcon, ResetIcon } from '@/components/icons';
import { useMarketPrices, type PriceState } from '@/features/crafting/market';
import {
  groupOfType,
  racesFor,
  tableKey,
  typesFor,
  TYPE_GROUPS,
  useReforgeDataQuery,
  type PoolRow,
  type ReforgeData,
  type ReforgeToolId,
  type TypeGroup,
} from '@/features/reforge/data';
import {
  meetsTargets,
  optionEffect,
  parseOption,
  REFORGE_LINES,
  targetChance,
  UNTIL_CAP,
  type ParsedOption,
  type ReforgeDraw,
  type ReforgeLine,
  type ReforgeSetting,
  type ReforgeSimulator as Simulator,
  type ReforgeTarget,
} from '@/features/reforge/simulator';
import { formatGold, formatGoldShort, formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 기록 표 한 쪽의 줄 수. */
const PAGE_SIZE = 20;
/** "방금 나온 것" 에 그리는 카드 수. 목표까지 수천 번 돌린 뒤에도 화면이 가볍게. */
const LATEST_CARDS = 10;
/** 목표는 세 줄까지다. 세공이 세 줄이다. */
const MAX_TARGETS = REFORGE_LINES;

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

/** "정교한 세공 도구" -> "정교한". 좁은 칸에서 쓴다. */
const shortToolName = (name: string) => name.replace(/\s*세공 도구$/, '');

/** 확률을 사람이 읽는 퍼센트로. 아주 작은 값도 0% 로 뭉개지 않는다. */
function formatChance(chance: number): string {
  const percent = chance * 100;
  if (percent >= 1) return `${percent.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`;
  return `${percent.toLocaleString('ko-KR', { maximumSignificantDigits: 3 })}%`;
}

/** "20260723" -> "2026. 7. 23." */
const formatTableDate = (date: string) =>
  `${date.slice(0, 4)}. ${Number(date.slice(4, 6))}. ${Number(date.slice(6))}.`;

/** 옵션 하나의 레벨 폭. "4~10, 한계 돌파 11~13" */
function rangeText(row: PoolRow): string {
  const [, min, max, lbMin = 0, lbMax = 0] = row;
  return `${min}~${max}레벨${lbMax ? `, 한계 돌파 ${lbMin}~${lbMax}` : ''}`;
}

/** 설명 그림. 올리거나 키보드로 닿으면 풀어 쓴 설명이 뜬다. */
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Flex vertical gap={4} style={{ minWidth: 0 }}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {label}
      </Text>
      {children}
    </Flex>
  );
}

/** 세공 한 줄. 옵션 이름, 레벨, 효과. 한계 돌파 레벨이면 글자 표시가 붙는다. */
function LineText({
  line,
  option,
  compact = false,
}: {
  line: ReforgeLine;
  option: ParsedOption;
  compact?: boolean;
}) {
  const effect = optionEffect(option, line.level);
  return (
    <Flex gap={6} align="baseline" wrap style={{ minWidth: 0 }}>
      <Text strong={!compact} style={{ fontSize: compact ? 13 : 15 }}>
        {option.name}
      </Text>
      <Text className="tnum" style={{ fontSize: compact ? 13 : 15, whiteSpace: 'nowrap' }}>
        {line.level}레벨
      </Text>
      {effect ? (
        <Text
          type="secondary"
          className="tnum"
          style={{ fontSize: compact ? 12 : 13, whiteSpace: 'nowrap' }}
        >
          {effect}
        </Text>
      ) : null}
      {line.limitBreak ? (
        <Tag color="processing" style={{ marginInlineEnd: 0 }}>
          한계 돌파
        </Tag>
      ) : null}
    </Flex>
  );
}

/** 목표를 채운 결과 표시. 테두리 색에 더해 글자로도 알린다. */
function HitTag() {
  const { token } = theme.useToken();
  return (
    <Tag
      style={{
        marginInlineEnd: 0,
        whiteSpace: 'nowrap',
        color: token.colorPrimary,
        borderColor: token.colorPrimary,
        background: token.colorPrimaryBg,
      }}
    >
      목표 달성
    </Tag>
  );
}

/** 방금 나온 세공 하나. */
function DrawCard({
  draw,
  hit,
  options,
  caption,
}: {
  draw: ReforgeDraw;
  hit: boolean;
  options: ParsedOption[];
  caption: string;
}) {
  const { token } = theme.useToken();
  return (
    <Card
      type="inner"
      size="small"
      variant="outlined"
      style={
        hit
          ? {
              borderColor: token.colorPrimary,
              // 테두리를 두껍게 보이되 칸 크기는 그대로 둔다.
              boxShadow: `inset 0 0 0 1px ${token.colorPrimary}`,
              background: token.colorPrimaryBg,
            }
          : undefined
      }
    >
      <Flex vertical gap={6}>
        <Flex gap={8} align="center" justify="space-between" wrap>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {formatNumber(draw.no)}번째 · {caption}
          </Text>
          {hit ? <HitTag /> : null}
        </Flex>
        {draw.lines.map((line) => (
          <LineText key={line.option} line={line} option={options[line.option]} />
        ))}
      </Flex>
    </Card>
  );
}

interface HistoryRow {
  draw: ReforgeDraw;
  hit: boolean;
}

/**
 * 세공 기록 표. 기록이 쌓일수록 그리는 데 오래 걸려, 방금 나온 카드보다 한 박자 늦게 그린다
 * (rows 는 useDeferredValue 로 늦춘 값이다). 같은 rows 면 다시 그리지 않는다.
 */
const HistoryTable = memo(function HistoryTable({
  rows,
  data,
  options,
}: {
  rows: HistoryRow[];
  data: ReforgeData;
  options: ParsedOption[];
}) {
  const { token } = theme.useToken();
  const toolName = useMemo(
    () => new Map(data.tools.map((tool) => [tool.id, shortToolName(tool.name)])),
    [data.tools],
  );
  const typeName = useMemo(
    () => new Map(data.types.map((type) => [type.id, type.name])),
    [data.types],
  );
  const columns: TableColumnsType<HistoryRow> = [
    {
      title: '번째',
      key: 'no',
      width: 64,
      align: 'right',
      render: (_value, row) => <span className="tnum">{formatNumber(row.draw.no)}</span>,
    },
    {
      title: '도구와 장비',
      key: 'setting',
      width: 150,
      render: (_value, row) => (
        <Flex vertical gap={0}>
          <Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{toolName.get(row.draw.tool)}</Text>
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {typeName.get(row.draw.type)}, {data.races[row.draw.race]}
          </Text>
        </Flex>
      ),
    },
    {
      title: '옵션',
      key: 'lines',
      render: (_value, row) => (
        <Flex vertical gap={2}>
          {row.draw.lines.map((line) => (
            <LineText key={line.option} line={line} option={options[line.option]} compact />
          ))}
        </Flex>
      ),
    },
    {
      title: '목표',
      key: 'hit',
      width: 96,
      align: 'right',
      render: (_value, row) => (row.hit ? <HitTag /> : null),
    },
  ];

  return (
    <Card variant="outlined" style={{ minWidth: 0 }} styles={{ body: { padding: 0 } }}>
      <Table<HistoryRow>
        columns={columns}
        dataSource={rows}
        rowKey={(row) => row.draw.no}
        size="small"
        onRow={(row) => (row.hit ? { style: { background: token.colorPrimaryBg } } : {})}
        pagination={
          rows.length > PAGE_SIZE
            ? { pageSize: PAGE_SIZE, showSizeChanger: false, size: 'small' }
            : false
        }
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '아직 세공하지 않았습니다.' }}
      />
    </Card>
  );
});

/** 목표 옵션 고르기. 세 줄까지, 옵션마다 바라는 가장 낮은 레벨. */
function TargetEditor({
  pool,
  options,
  targets,
  onChange,
}: {
  pool: readonly PoolRow[];
  options: ParsedOption[];
  targets: ReforgeTarget[];
  onChange: (targets: ReforgeTarget[]) => void;
}) {
  const rowOf = (option: number) => pool.find((row) => row[0] === option);
  const add = () => {
    const used = new Set(targets.map((target) => target.option));
    const first = pool.find((row) => !used.has(row[0]));
    if (first) onChange([...targets, { option: first[0], minLevel: first[2] }]);
  };
  const replace = (index: number, target: ReforgeTarget | null) => {
    const next = [...targets];
    if (target) next[index] = target;
    else next.splice(index, 1);
    onChange(next);
  };

  return (
    <Flex vertical gap={8}>
      {targets.map((target, index) => {
        const row = rowOf(target.option);
        if (!row) return null;
        const used = new Set(targets.filter((_, other) => other !== index).map((t) => t.option));
        const highest = row[4] || row[2];
        return (
          <Flex key={`${target.option}-${index}`} gap={8} align="center" wrap>
            <Select<number>
              aria-label={`목표 옵션 ${index + 1}`}
              showSearch
              optionFilterProp="label"
              value={target.option}
              onChange={(option) => {
                const next = rowOf(option);
                if (next) replace(index, { option, minLevel: next[2] });
              }}
              options={pool
                .filter((entry) => !used.has(entry[0]))
                .map((entry) => ({ value: entry[0], label: options[entry[0]].name }))}
              popupMatchSelectWidth={false}
              style={{ flex: '1 1 220px', minWidth: 0, maxWidth: 360 }}
            />
            <Tooltip title={rangeText(row)}>
              <InputNumber
                aria-label={`목표 옵션 ${index + 1}의 가장 낮은 레벨`}
                min={row[1]}
                max={highest}
                value={target.minLevel}
                onChange={(level) => {
                  if (level === null) return;
                  const clamped = Math.min(Math.max(Math.round(level), row[1]), highest);
                  replace(index, { ...target, minLevel: clamped });
                }}
                suffix="레벨 이상"
                className="tnum"
                style={{ width: 132 }}
              />
            </Tooltip>
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {rangeText(row)}
            </Text>
            <Button
              type="text"
              icon={<DeleteIcon />}
              aria-label={`목표 옵션 ${index + 1} 빼기`}
              onClick={() => replace(index, null)}
            />
          </Flex>
        );
      })}
      <div>
        <Button
          icon={<AddIcon />}
          onClick={add}
          disabled={targets.length >= MAX_TARGETS || targets.length >= pool.length}
        >
          목표 옵션 추가
        </Button>
      </div>
    </Flex>
  );
}

/** 도구 한 개의 경매장 최저가. 매물이 없거나 받지 못했으면 null. */
function lowestOf(state: PriceState | undefined): number | null {
  if (state?.status !== 'ok') return null;
  return state.price.offers[0]?.price ?? null;
}

/**
 * 세공 시뮬레이터 본체. 확률표를 받은 뒤에 그린다.
 *
 * 도구, 장비 종류, 종족을 고르고 단추를 누르면 세 줄을 뽑아 쌓는다. 쓴 골드는 도구마다 쓴 개수에
 * 그 도구의 값을 곱해 더한다. 값은 경매장 최저가가 기본이고 직접 고쳐 넣을 수 있다.
 */
function SimulatorBody({ data, simulator }: { data: ReforgeData; simulator: Simulator }) {
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;

  const [toolId, setToolId] = useState<ReforgeToolId>(data.tools[0].id);
  const tool = data.tools.find((entry) => entry.id === toolId) ?? data.tools[0];
  const types = useMemo(() => typesFor(data, tool.id), [data, tool.id]);

  const [group, setGroup] = useState<TypeGroup>('무기');
  const groupTypes = types.filter((type) => groupOfType(type.name) === group);
  const [typeChoice, setTypeChoice] = useState<number | null>(null);
  // 고른 타입이 이 도구, 이 갈래에 없으면 갈래의 첫 타입으로 간다.
  const typeId =
    groupTypes.find((type) => type.id === typeChoice)?.id ?? groupTypes[0]?.id ?? types[0].id;

  const races = racesFor(data, tool.id, typeId);
  const [raceChoice, setRaceChoice] = useState(0);
  const race = races.includes(raceChoice) ? raceChoice : races[0];

  const pool = data.pools[data.tables[tableKey(tool.id, typeId, race)]];
  const options = useMemo(() => data.options.map(parseOption), [data.options]);

  const [targetChoice, setTargets] = useState<ReforgeTarget[]>([]);
  // 장비를 바꾸면 거기 붙지 않는 목표는 빠진다.
  const targets = useMemo(
    () => targetChoice.filter((target) => pool.some((row) => row[0] === target.option)),
    [targetChoice, pool],
  );
  const chance = targetChance(pool, targets, tool.limitBreakRate);

  // 도구 값. 경매장 최저가가 기본이고, 고쳐 넣은 값이 있으면 그것을 쓴다.
  const toolNames = useMemo(() => data.tools.map((entry) => entry.name), [data.tools]);
  const marketPrices = useMarketPrices(toolNames);
  const [priceEdits, setPriceEdits] = useState<Partial<Record<ReforgeToolId, number>>>({});
  const priceOf = (id: ReforgeToolId): number | null => {
    const name = data.tools.find((entry) => entry.id === id)?.name;
    return priceEdits[id] ?? lowestOf(name ? marketPrices.get(name) : undefined);
  };
  const marketState = marketPrices.get(tool.name);
  const marketLowest = lowestOf(marketState);
  const toolPrice = priceOf(tool.id);

  const setting: ReforgeSetting = {
    tool: tool.id,
    type: typeId,
    race,
    pool,
    limitBreakRate: tool.limitBreakRate,
  };

  const { draws } = simulator;
  const count = draws.length;
  const hits = useMemo(
    () => draws.map((draw) => meetsTargets(draw.lines, targets)),
    [draws, targets],
  );

  // 도구마다 쓴 개수. 쓴 골드는 개수에 지금 값을 곱해 더한다.
  const usedByTool = useMemo(() => {
    const used = new Map<ReforgeToolId, number>();
    for (const draw of draws) used.set(draw.tool, (used.get(draw.tool) ?? 0) + 1);
    return used;
  }, [draws]);
  let spent = 0;
  let unpriced = 0;
  for (const [id, used] of usedByTool) {
    const price = priceOf(id);
    if (price === null) unpriced += used;
    else spent += price * used;
  }
  const hitCount = hits.filter(Boolean).length;
  const limitBreaks = useMemo(
    () => draws.reduce((sum, draw) => sum + draw.lines.filter((line) => line.limitBreak).length, 0),
    [draws],
  );

  const typeName = new Map(data.types.map((type) => [type.id, type.name]));
  const toolShort = new Map(data.tools.map((entry) => [entry.id, shortToolName(entry.name)]));
  const captionOf = (draw: ReforgeDraw) =>
    `${toolShort.get(draw.tool)}, ${typeName.get(draw.type)} ${data.races[draw.race]}`;

  const batch = Math.min(simulator.lastBatch, LATEST_CARDS);
  const latest = draws.slice(count - batch).reverse();
  const history = useMemo(
    () => draws.map((draw, index) => ({ draw, hit: hits[index] })).reverse(),
    [draws, hits],
  );
  // 표는 카드보다 늦게 그린다. 누르자마자 카드에 결과가 먼저 뜬다.
  const settledHistory = useDeferredValue(history);

  const priceNote = (() => {
    if (priceEdits[tool.id] !== undefined)
      return marketLowest !== null
        ? `직접 넣은 값입니다. 경매장 최저가는 ${formatGold(marketLowest)}입니다.`
        : '직접 넣은 값입니다.';
    if (!marketState || marketState.status === 'loading') return '경매장 최저가를 받는 중입니다.';
    if (marketState.status === 'error')
      return '경매장 시세를 받지 못했습니다. 값을 넣으면 쓴 골드를 셉니다.';
    return marketLowest === null
      ? '경매장에 매물이 없습니다. 값을 넣으면 쓴 골드를 셉니다.'
      : '경매장 최저가입니다. 게임 데이터는 평균 10분 지연됩니다.';
  })();

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined">
        <Flex vertical gap={16}>
          {/* 두 칸. 768px 미만에서는 한 칸으로 떨어진다. */}
          <Row gutter={[24, 16]}>
            <Col xs={24} md={12}>
              <Field label="세공 도구">
                <Segmented<ReforgeToolId>
                  block
                  value={tool.id}
                  onChange={setToolId}
                  options={data.tools.map((entry) => ({
                    value: entry.id,
                    label: shortToolName(entry.name),
                  }))}
                />
              </Field>
            </Col>
            <Col xs={24} md={12}>
              <Field label={`${tool.name} 한 개 값`}>
                <Flex gap={8} align="center" wrap>
                  <InputNumber<number>
                    aria-label={`${tool.name} 한 개 값`}
                    min={0}
                    step={100_000}
                    value={toolPrice}
                    onChange={(value) =>
                      setPriceEdits((prev) => {
                        const next = { ...prev };
                        if (value === null) delete next[tool.id];
                        else next[tool.id] = value;
                        return next;
                      })
                    }
                    formatter={(value) => (value ? formatNumber(Number(value)) : '')}
                    parser={(value) => Number((value ?? '').replace(/[^\d]/g, ''))}
                    suffix="G"
                    className="tnum"
                    style={{ width: 180 }}
                  />
                  {priceEdits[tool.id] !== undefined ? (
                    <Button
                      onClick={() =>
                        setPriceEdits((prev) => {
                          const next = { ...prev };
                          delete next[tool.id];
                          return next;
                        })
                      }
                    >
                      최저가로 되돌리기
                    </Button>
                  ) : null}
                  {marketState?.status === 'loading' ? <Spin size="small" /> : null}
                </Flex>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {priceNote}
                </Text>
              </Field>
            </Col>
            <Col xs={24} md={12}>
              <Field label="장비 종류">
                <Flex vertical gap={8}>
                  <Segmented<TypeGroup>
                    block
                    value={group}
                    onChange={setGroup}
                    options={TYPE_GROUPS.filter((entry) =>
                      types.some((type) => groupOfType(type.name) === entry),
                    ).map((entry) => ({ value: entry, label: entry }))}
                  />
                  <Select<number>
                    aria-label="아이템 타입"
                    showSearch
                    optionFilterProp="label"
                    value={typeId}
                    onChange={setTypeChoice}
                    options={groupTypes.map((type) => ({ value: type.id, label: type.name }))}
                  />
                </Flex>
              </Field>
            </Col>
            <Col xs={24} md={12}>
              <Field label="착용 종족">
                <Select<number>
                  aria-label="착용 종족"
                  value={race}
                  onChange={setRaceChoice}
                  options={races.map((entry) => ({ value: entry, label: data.races[entry] }))}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  이 장비에 붙을 수 있는 옵션 {formatNumber(pool.length)}종. 줄마다 남은 옵션 중
                  하나가 똑같은 확률로 나오고, 한계 돌파가 되는 옵션은{' '}
                  {formatChance(tool.limitBreakRate)} 확률로 한계 돌파 레벨이 나옵니다.
                </Text>
              </Field>
            </Col>
          </Row>

          <Field label="목표 옵션 (고르지 않아도 됩니다)">
            <TargetEditor pool={pool} options={options} targets={targets} onChange={setTargets} />
            {targets.length > 0 ? (
              <Text className="tnum" style={{ fontSize: 13 }}>
                {chance > 0 ? (
                  <>
                    한 번에 모두 붙을 확률 <Text strong>{formatChance(chance)}</Text>, 평균{' '}
                    <Text strong>{formatNumber(Math.ceil(1 / chance))}번</Text>에 한 번
                    {toolPrice !== null ? (
                      <>
                        , 도구값으로 평균 <Text strong>{formatGoldShort(toolPrice / chance)}</Text>
                      </>
                    ) : null}
                  </>
                ) : (
                  '이 목표는 이 장비에서 나올 수 없습니다.'
                )}
              </Text>
            ) : null}
          </Field>

          <Flex gap={8} wrap align="center">
            <Button type="primary" onClick={() => simulator.draw(setting, 1)}>
              1번 세공
            </Button>
            <Button onClick={() => simulator.draw(setting, 10)}>10번 세공</Button>
            <Tooltip
              title={
                targets.length === 0
                  ? '목표 옵션을 고르면 쓸 수 있습니다.'
                  : `목표를 채울 때까지 세공합니다. 많아야 ${formatNumber(UNTIL_CAP)}번까지입니다.`
              }
            >
              <Button
                onClick={() => simulator.drawUntil(setting, targets)}
                disabled={targets.length === 0 || chance === 0}
              >
                목표 나올 때까지
              </Button>
            </Tooltip>
            <Button
              icon={<ResetIcon />}
              onClick={simulator.reset}
              disabled={count === 0}
              style={{ marginLeft: wide ? 'auto' : undefined }}
            >
              처음부터
            </Button>
          </Flex>
        </Flex>
      </Card>

      <Card variant="outlined">
        {/* 네 칸. 768px 미만에서는 두 칸, 576px 미만에서는 한 칸으로 떨어진다. */}
        <Row gutter={[24, 16]} align="top">
          <Col xs={24} sm={12} md={6}>
            <Statistic title="세공" value={formatNumber(count)} suffix="번" styles={NUMERIC} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title={
                <StatTitle
                  label="쓴 골드"
                  detail="도구마다 쓴 개수에 그 도구 한 개 값을 곱해 더했습니다. 도구 값을 고치면 다시 셉니다."
                />
              }
              value={formatGoldShort(spent)}
              styles={NUMERIC}
            />
            {unpriced > 0 ? (
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                값을 모르는 도구 {formatNumber(unpriced)}개는 빠졌습니다.
              </Text>
            ) : spent >= 10_000 ? (
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {formatGold(spent)}
              </Text>
            ) : null}
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title={
                <StatTitle
                  label="목표 달성"
                  detail="지금 고른 목표를 모두 채운 세공 횟수입니다. 목표를 바꾸면 지난 기록도 새 목표로 다시 셉니다."
                />
              }
              value={targets.length === 0 ? '-' : formatNumber(hitCount)}
              suffix={targets.length === 0 ? undefined : '번'}
              styles={NUMERIC}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="한계 돌파 줄"
              value={formatNumber(limitBreaks)}
              suffix="줄"
              styles={NUMERIC}
            />
          </Col>
        </Row>
      </Card>

      <Flex vertical gap={8} role="region" aria-labelledby="reforge-sim-latest">
        <Text strong style={{ fontSize: 16 }} id="reforge-sim-latest">
          방금 나온 세공
        </Text>
        {/* 넓은 화면에서는 두 칸, 768px 미만에서는 한 칸. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              wide && latest.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
            gap: 8,
          }}
        >
          {latest.map((draw) => (
            <DrawCard
              key={draw.no}
              draw={draw}
              hit={hits[draw.no - 1]}
              options={options}
              caption={captionOf(draw)}
            />
          ))}
        </div>
        {simulator.lastBatch > LATEST_CARDS ? (
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            방금 {formatNumber(simulator.lastBatch)}번 세공했습니다. 마지막 {LATEST_CARDS}번만
            보이고, 나머지는 아래 기록에 있습니다.
          </Text>
        ) : null}
        {count === 0 ? (
          <EmptyState
            size="small"
            variant="search"
            description="세공 단추를 누르면 붙은 옵션 세 줄이 여기에 쌓입니다."
          />
        ) : null}
      </Flex>

      <Flex
        vertical
        gap={8}
        role="region"
        aria-labelledby="reforge-sim-history"
        style={{ minWidth: 0 }}
      >
        <Text strong style={{ fontSize: 16 }} id="reforge-sim-history">
          세공 기록
        </Text>
        <HistoryTable rows={settledHistory} data={data} options={options} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {tool.name}는 {formatTableDate(tool.date)} 이후 확률표를 따릅니다. 확률표는 랭크를 고르게
          되어 있지만 세공은 늘 1랭크 세 줄로 붙습니다. 쓴 골드는 도구값만 셉니다.
        </Text>
      </Flex>
    </Flex>
  );
}

/** 확률표를 받은 뒤 본체를 그린다. 받는 동안은 설정 칸 모양의 뼈대를 보인다. */
export function ReforgeSimulatorView({ simulator }: { simulator: Simulator }) {
  const query = useReforgeDataQuery();
  const { data } = query;
  if (query.isPending)
    return (
      <Card variant="outlined">
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  if (query.isError || !data)
    return (
      <Alert
        type="error"
        showIcon
        message="세공 확률표를 받지 못했습니다."
        description="잠시 뒤 새로 고쳐 주세요."
      />
    );
  return <SimulatorBody data={data} simulator={simulator} />;
}
