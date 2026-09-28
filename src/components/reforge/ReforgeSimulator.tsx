import {
  memo,
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
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
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { EmptyState } from '@/components/EmptyState';
import {
  AddIcon,
  DeleteIcon,
  GemIcon,
  HammerIcon,
  InfoIcon,
  ResetIcon,
  StarFillIcon,
} from '@/components/icons';
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
  isSameItem,
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
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import './reforgeFx.css';

const { Text } = Typography;

/** 기록 표 한 쪽의 줄 수. */
const PAGE_SIZE = 20;
/** 목표는 세 줄까지다. 세공이 세 줄이다. */
const MAX_TARGETS = REFORGE_LINES;
/** 경매장에 오르는 기억의 보석 이름. 시세를 이 이름으로 묻는다. */
const GEM_NAME = '기억의 보석';
/** "연출 끄기" 를 이 브라우저에 기억해 두는 자리. */
const FX_STORAGE_KEY = 'mabikuma:reforgeFx';

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

/**
 * 도구마다 연출. 오래 걸릴수록 화려하다. 정교한은 원판이 한 바퀴 돌고 망치질 한 번, 영롱한은
 * 장비 위로 빛줄기가 지나가고 둘레가 반짝이고, 찬란한은 두 번 내리친 뒤 빛살이 퍼지며 판이 흔들린다.
 */
const TOOL_FX: Record<
  ReforgeToolId,
  { duration: number; spin: number; sparks: number; rays: number }
> = {
  fine: { duration: 900, spin: 360, sparks: 0, rays: 0 },
  radiant: { duration: 1200, spin: 180, sparks: 8, rays: 0 },
  brilliant: { duration: 1500, spin: 540, sparks: 10, rays: 12 },
};

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

function LimitBreakTag() {
  return (
    <Tag color="processing" style={{ marginInlineEnd: 0 }}>
      한계 돌파
    </Tag>
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

/** 기록 표의 한 줄. 옵션 이름, 레벨, 효과. */
function CompactLine({ line, option }: { line: ReforgeLine; option: ParsedOption }) {
  const effect = optionEffect(option, line.level);
  return (
    <Flex gap={6} align="baseline" wrap style={{ minWidth: 0 }}>
      <Text style={{ fontSize: 13 }}>{option.name}</Text>
      <Text className="tnum" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        {line.level}레벨
      </Text>
      {effect ? (
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {effect}
        </Text>
      ) : null}
      {line.limitBreak ? <LimitBreakTag /> : null}
    </Flex>
  );
}

/**
 * 세공 창의 옵션 한 줄. 게임처럼 이름 아래에 "(7/10 레벨 : 7% 증가)" 를 적는다. 일반 구간의 끝
 * 레벨 이상이면 액센트 색과 별로 가른다. 색만으로 가르지 않게 별 그림이 함께 붙는다.
 */
function WindowLine({
  line,
  option,
  row,
  index,
}: {
  line: ReforgeLine;
  option: ParsedOption;
  row: PoolRow | undefined;
  index: number;
}) {
  const { token } = theme.useToken();
  const max = row?.[2] ?? line.level;
  const top = line.level >= max;
  const effect = optionEffect(option, line.level);
  return (
    <div className="rf-line" style={{ '--i': index } as CSSProperties}>
      <Flex gap={6} align="center" wrap>
        {top ? (
          <StarFillIcon aria-hidden style={{ color: token.colorPrimary, fontSize: 13 }} />
        ) : null}
        <Text strong style={{ color: top ? token.colorPrimary : undefined }}>
          {option.name}
        </Text>
        {line.limitBreak ? <LimitBreakTag /> : null}
      </Flex>
      <Text
        type={top ? undefined : 'secondary'}
        className="tnum"
        style={{ fontSize: 13, color: top ? token.colorPrimary : undefined }}
      >
        ({line.level}/{max} 레벨{effect ? ` : ${effect}` : ''})
      </Text>
    </div>
  );
}

/** 세공 창 오른쪽의 옵션 칸 하나. "기억된 옵션" 이나 "새 옵션". */
function OptionBox({
  title,
  lines,
  pool,
  options,
  hit,
  reveal,
  empty,
  fxStyle,
}: {
  title: string;
  lines: ReforgeLine[] | null;
  pool: readonly PoolRow[];
  options: ParsedOption[];
  hit: boolean;
  /** 방금 나온 옵션이라 한 줄씩 드러낼지. 값이 바뀌면 칸을 새로 그려 다시 드러낸다. */
  reveal: number | null;
  empty: string;
  fxStyle: CSSProperties;
}) {
  const { token } = theme.useToken();
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      style={{
        border: `1px solid ${hit ? token.colorPrimary : token.colorBorderSecondary}`,
        boxShadow: hit ? `inset 0 0 0 1px ${token.colorPrimary}` : undefined,
        borderRadius: token.borderRadius,
        background: hit ? token.colorPrimaryBg : token.colorFillQuaternary,
        padding: 12,
        minHeight: 132,
      }}
    >
      <Flex justify="space-between" align="center" gap={8} style={{ marginBottom: 8 }}>
        <Text strong id={id}>
          {title}
        </Text>
        {hit ? <HitTag /> : null}
      </Flex>
      {lines ? (
        <Flex
          key={reveal ?? 'still'}
          vertical
          gap={8}
          className={reveal !== null ? 'rf-reveal' : undefined}
          style={fxStyle}
        >
          {lines.map((line, index) => (
            <WindowLine
              key={line.option}
              line={line}
              option={options[line.option]}
              row={pool.find((entry) => entry[0] === line.option)}
              index={index}
            />
          ))}
        </Flex>
      ) : (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {empty}
        </Text>
      )}
    </section>
  );
}

/**
 * 세공 창 왼쪽의 작업대. 원판 가운데 장비가 놓이고 위에 기억의 보석 칸이 있다. play 가 바뀌면 판을
 * 새로 그려 그 도구의 연출을 처음부터 돌린다.
 */
function Workbench({
  itemLabel,
  gemOn,
  gemUsable,
  onToggleGem,
  play,
  fxStyle,
}: {
  itemLabel: string;
  gemOn: boolean;
  gemUsable: boolean;
  onToggleGem: () => void;
  /** 연출할 세공. 연출하지 않으면 null. */
  play: { no: number; tool: ReforgeToolId } | null;
  fxStyle: CSSProperties;
}) {
  const fx = play ? TOOL_FX[play.tool] : null;
  const angles = (count: number) =>
    Array.from({ length: count }, (_, index) => (360 / count) * index);
  return (
    <div
      key={play?.no ?? 'still'}
      className={`rf-stage${play ? ` rf-play rf--${play.tool}` : ''}`}
      style={fxStyle}
    >
      <div className="rf-stage-body">
        <div className="rf-ring" />
        <div className="rf-ring rf-ring--inner" />
        <div className="rf-ring rf-ring--core" />
        {fx
          ? angles(fx.rays).map((angle) => (
              <span
                key={`ray-${angle}`}
                className="rf-ray"
                style={{ '--a': `${angle}deg` } as CSSProperties}
              />
            ))
          : null}
        <div className="rf-flash" />
        <div className="rf-item">
          <div className="rf-sheen" />
          <Text strong style={{ fontSize: 13, lineHeight: 1.3, position: 'relative' }}>
            {itemLabel}
          </Text>
        </div>
        {fx
          ? angles(fx.sparks).map((angle, index) => (
              <StarFillIcon
                key={`spark-${angle}`}
                aria-hidden
                className="rf-spark"
                style={{ '--a': `${angle + 18}deg`, '--i': index } as CSSProperties}
              />
            ))
          : null}
        <HammerIcon aria-hidden className="rf-hammer" />
        <Tooltip
          title={
            gemUsable
              ? gemOn
                ? '기억의 보석을 씁니다. 누르면 뺍니다.'
                : '기억의 보석을 올리면 지금 옵션을 둔 채 새 옵션을 보고 고를 수 있습니다.'
              : '세공 옵션이 없는 장비에는 기억의 보석을 쓸 수 없습니다. 한 번 세공한 뒤 올려 주세요.'
          }
        >
          <button
            type="button"
            className="rf-gem"
            aria-pressed={gemOn}
            aria-label="기억의 보석 사용"
            disabled={!gemUsable}
            onClick={onToggleGem}
          >
            <span className="rf-gem-shape" />
            <span className="rf-gem-icon">
              <GemIcon aria-hidden />
            </span>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

interface HistoryRow {
  draw: ReforgeDraw;
  hit: boolean;
}

/**
 * 세공 기록 표. 기록이 쌓일수록 그리는 데 오래 걸려, 세공 창보다 한 박자 늦게 그린다
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
          <Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
            {toolName.get(row.draw.tool)}
            {row.draw.gem ? ', 기억의 보석' : ''}
          </Text>
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
            <CompactLine key={line.option} line={line} option={options[line.option]} />
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

/** 경매장 최저가. 매물이 없거나 받지 못했으면 null. */
function lowestOf(state: PriceState | undefined): number | null {
  if (state?.status !== 'ok') return null;
  return state.price.offers[0]?.price ?? null;
}

/** 한 개 값 입력칸. 경매장 최저가가 기본이고, 고쳐 넣으면 그 값을 쓴다. */
function PriceField({
  name,
  market,
  edited,
  value,
  onChange,
}: {
  name: string;
  market: PriceState | undefined;
  edited: boolean;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const lowest = lowestOf(market);
  const note = (() => {
    if (edited)
      return lowest !== null
        ? `직접 넣은 값입니다. 경매장 최저가는 ${formatGold(lowest)}입니다.`
        : '직접 넣은 값입니다.';
    if (!market || market.status === 'loading') return '경매장 최저가를 받는 중입니다.';
    if (market.status === 'error') return '경매장 시세를 받지 못했습니다. 값을 넣으면 셉니다.';
    return lowest === null
      ? '경매장에 매물이 없습니다. 값을 넣으면 셉니다.'
      : '경매장 최저가입니다. 게임 데이터는 평균 10분 지연됩니다.';
  })();
  return (
    <Field label={`${name} 한 개 값`}>
      <Flex gap={8} align="center" wrap>
        <InputNumber<number>
          aria-label={`${name} 한 개 값`}
          min={0}
          step={100_000}
          value={value}
          onChange={onChange}
          formatter={(input) => (input ? formatNumber(Number(input)) : '')}
          parser={(input) => Number((input ?? '').replace(/[^\d]/g, ''))}
          suffix="G"
          className="tnum"
          style={{ width: 180 }}
        />
        {edited ? <Button onClick={() => onChange(null)}>최저가로 되돌리기</Button> : null}
        {market?.status === 'loading' ? <Spin size="small" /> : null}
      </Flex>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {note}
      </Text>
    </Field>
  );
}

/**
 * 세공 시뮬레이터 본체. 확률표를 받은 뒤에 그린다.
 *
 * 게임의 세공 창처럼 왼쪽 작업대에 장비와 기억의 보석을 올리고 세공한다. 기억의 보석을 쓰면 장비의
 * 옵션은 그대로 두고 새 옵션만 보여 주며, "신규 옵션 적용하기" 를 눌러야 붙는다. 쓴 골드는 도구와
 * 보석마다 쓴 개수에 한 개 값을 곱해 더한다.
 */
function SimulatorBody({ data, simulator }: { data: ReforgeData; simulator: Simulator }) {
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const { token } = theme.useToken();
  const reducedMotion = usePrefersReducedMotion();

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
  const typeName = new Map(data.types.map((type) => [type.id, type.name]));

  const [targetChoice, setTargets] = useState<ReforgeTarget[]>([]);
  // 장비를 바꾸면 거기 붙지 않는 목표는 빠진다.
  const targets = useMemo(
    () => targetChoice.filter((target) => pool.some((row) => row[0] === target.option)),
    [targetChoice, pool],
  );
  const chance = targetChance(pool, targets, tool.limitBreakRate);

  // 세공 창의 장비. 장비 종류나 종족을 바꾸면 빈 새 장비가 올라온다.
  const setting: ReforgeSetting = {
    tool: tool.id,
    type: typeId,
    race,
    pool,
    limitBreakRate: tool.limitBreakRate,
  };
  const item = isSameItem(simulator.item, setting) ? simulator.item : null;
  const itemLines = item?.lines ?? null;
  const pending = item?.pending ?? null;

  const [gemChoice, setGemChoice] = useState(false);
  const gemUsable = itemLines !== null;
  const gemOn = gemChoice && gemUsable;

  const [fxOn, setFxOn] = useState(readFxSetting);
  const animate = fxOn && !reducedMotion;

  // 도구와 보석 값. 경매장 최저가가 기본이고, 고쳐 넣은 값이 있으면 그것을 쓴다.
  const priceNames = useMemo(
    () => [...data.tools.map((entry) => entry.name), GEM_NAME],
    [data.tools],
  );
  const marketPrices = useMarketPrices(priceNames);
  const [priceEdits, setPriceEdits] = useState<Record<string, number>>({});
  const priceOf = (name: string): number | null =>
    priceEdits[name] ?? lowestOf(marketPrices.get(name));
  const editPrice = (name: string) => (value: number | null) =>
    setPriceEdits((prev) => {
      const next = { ...prev };
      if (value === null) delete next[name];
      else next[name] = value;
      return next;
    });
  const toolPrice = priceOf(tool.name);
  const gemPrice = priceOf(GEM_NAME);
  const onePull = toolPrice === null ? null : toolPrice + (gemOn ? (gemPrice ?? 0) : 0);

  const { draws } = simulator;
  const count = draws.length;
  const hits = useMemo(
    () => draws.map((draw) => meetsTargets(draw.lines, targets)),
    [draws, targets],
  );

  // 도구마다, 보석마다 쓴 개수. 쓴 골드는 개수에 지금 값을 곱해 더한다.
  const usage = useMemo(() => {
    const tools = new Map<ReforgeToolId, number>();
    let gems = 0;
    let limitBreaks = 0;
    for (const draw of draws) {
      tools.set(draw.tool, (tools.get(draw.tool) ?? 0) + 1);
      if (draw.gem) gems += 1;
      limitBreaks += draw.lines.filter((line) => line.limitBreak).length;
    }
    return { tools, gems, limitBreaks };
  }, [draws]);
  let toolSpent = 0;
  let unpriced = 0;
  for (const [id, used] of usage.tools) {
    const price = priceOf(data.tools.find((entry) => entry.id === id)?.name ?? '');
    if (price === null) unpriced += used;
    else toolSpent += price * used;
  }
  const gemSpent = gemPrice === null ? 0 : gemPrice * usage.gems;
  if (gemPrice === null) unpriced += usage.gems;
  const spent = toolSpent + gemSpent;
  const hitCount = hits.filter(Boolean).length;

  // 연출. 한 번 세공했을 때만 돌린다. 여러 번 한 뒤에는 마지막 결과만 바로 보인다.
  const last = draws[count - 1] ?? null;
  const lastIsHere = last !== null && item !== null && simulator.lastBatch > 0;
  const play = animate && lastIsHere && simulator.lastBatch === 1 ? last : null;
  const fx = TOOL_FX[play?.tool ?? tool.id];
  const fxStyle = {
    '--fx-accent': token.colorPrimary,
    '--fx-soft': token.colorPrimaryBg,
    '--fx-line': token.colorBorder,
    '--fx-muted': token.colorTextTertiary,
    '--fx-bg': token.colorBgContainer,
    '--fx-surface': token.colorFillQuaternary,
    '--fx-dur': `${play ? fx.duration : 0}ms`,
    '--fx-spin': `${fx.spin}deg`,
  } as CSSProperties;
  // 방금 나온 옵션이 들어간 칸만 한 줄씩 드러낸다.
  const revealKey = animate && lastIsHere ? last.no : null;
  const revealsPending = last?.gem ?? false;

  const history = useMemo(
    () => draws.map((draw, index) => ({ draw, hit: hits[index] })).reverse(),
    [draws, hits],
  );
  // 표는 세공 창보다 늦게 그린다. 누르자마자 창에 결과가 먼저 뜬다.
  const settledHistory = useDeferredValue(history);

  const itemLabel = `${typeName.get(typeId)}${data.races[race] === '공용' ? '' : ` (${data.races[race]})`}`;
  const pullNote =
    onePull === null
      ? '도구 값을 모릅니다.'
      : `한 번에 ${formatGoldShort(onePull)}${gemOn ? ' (도구와 기억의 보석)' : ''}`;

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
                  <Flex gap={8} wrap>
                    <Select<number>
                      aria-label="아이템 타입"
                      showSearch
                      optionFilterProp="label"
                      value={typeId}
                      onChange={setTypeChoice}
                      options={groupTypes.map((type) => ({ value: type.id, label: type.name }))}
                      style={{ flex: '1 1 160px', minWidth: 0 }}
                    />
                    <Select<number>
                      aria-label="착용 종족"
                      value={race}
                      onChange={setRaceChoice}
                      options={races.map((entry) => ({ value: entry, label: data.races[entry] }))}
                      style={{ flex: '1 1 120px', minWidth: 0 }}
                    />
                  </Flex>
                </Flex>
              </Field>
            </Col>
            <Col xs={24} md={12}>
              <PriceField
                name={tool.name}
                market={marketPrices.get(tool.name)}
                edited={priceEdits[tool.name] !== undefined}
                value={toolPrice}
                onChange={editPrice(tool.name)}
              />
            </Col>
            <Col xs={24} md={12}>
              <PriceField
                name={GEM_NAME}
                market={marketPrices.get(GEM_NAME)}
                edited={priceEdits[GEM_NAME] !== undefined}
                value={gemPrice}
                onChange={editPrice(GEM_NAME)}
              />
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
                    {onePull !== null ? (
                      <>
                        , 평균 <Text strong>{formatGoldShort(onePull / chance)}</Text>
                      </>
                    ) : null}
                  </>
                ) : (
                  '이 목표는 이 장비에서 나올 수 없습니다.'
                )}
              </Text>
            ) : null}
          </Field>
        </Flex>
      </Card>

      <Card variant="outlined" role="region" aria-label="세공 창">
        {/* 작업대와 옵션 두 칸. 768px 미만에서는 위아래로 쌓는다. */}
        <Row gutter={[24, 20]}>
          <Col xs={24} md={10}>
            <Flex vertical gap={12} align="center">
              <Text strong style={{ fontSize: 16 }}>
                {tool.name}
              </Text>
              <Workbench
                itemLabel={itemLabel}
                gemOn={gemOn}
                gemUsable={gemUsable}
                onToggleGem={() => setGemChoice(!gemOn)}
                play={play}
                fxStyle={fxStyle}
              />
              <Button
                type="primary"
                size="large"
                onClick={() => simulator.draw(setting, 1, gemOn)}
                style={{ minWidth: 160 }}
              >
                세공하기
              </Button>
              <Flex vertical gap={0} align="center">
                <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
                  {tool.name} {formatNumber(usage.tools.get(tool.id) ?? 0)}개 사용
                </Text>
                <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
                  기억의 보석 {formatNumber(usage.gems)}개 사용
                </Text>
                <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                  {pullNote}
                </Text>
              </Flex>
            </Flex>
          </Col>
          <Col xs={24} md={14}>
            <Flex vertical gap={10}>
              <OptionBox
                title={gemOn || pending ? '기억된 옵션' : '세공 옵션'}
                lines={itemLines}
                pool={pool}
                options={options}
                hit={itemLines !== null && meetsTargets(itemLines, targets)}
                reveal={revealsPending ? null : revealKey}
                empty="아직 세공하지 않았습니다. 세공하기를 누르면 옵션 세 줄이 붙습니다."
                fxStyle={fxStyle}
              />
              {gemOn || pending ? (
                <>
                  <Button type="primary" block disabled={!pending} onClick={simulator.applyPending}>
                    신규 옵션 적용하기
                  </Button>
                  <OptionBox
                    title="새 옵션"
                    lines={pending}
                    pool={pool}
                    options={options}
                    hit={pending !== null && meetsTargets(pending, targets)}
                    reveal={revealsPending ? revealKey : null}
                    empty="기억의 보석을 올리고 세공하면 새 옵션이 여기에 나옵니다. 적용하지 않으면 기억된 옵션이 그대로 남습니다."
                    fxStyle={fxStyle}
                  />
                </>
              ) : null}
            </Flex>
          </Col>
        </Row>
        <Flex gap={8} wrap align="center" style={{ marginTop: 20 }}>
          <Button onClick={() => simulator.draw(setting, 10, gemOn)}>10번 세공</Button>
          <Tooltip
            title={
              targets.length === 0
                ? '목표 옵션을 고르면 쓸 수 있습니다.'
                : `목표를 채울 때까지 세공합니다. 많아야 ${formatNumber(UNTIL_CAP)}번까지입니다.`
            }
          >
            <Button
              onClick={() => simulator.drawUntil(setting, targets, gemOn)}
              disabled={targets.length === 0 || chance === 0}
            >
              목표 나올 때까지
            </Button>
          </Tooltip>
          <Button icon={<ResetIcon />} onClick={simulator.reset} disabled={count === 0}>
            처음부터
          </Button>
          <Flex gap={8} align="center" style={{ marginLeft: wide ? 'auto' : undefined }}>
            <Switch
              size="small"
              checked={fxOn && !reducedMotion}
              disabled={reducedMotion}
              onChange={(on) => {
                setFxOn(on);
                writeFxSetting(on);
              }}
              aria-label="세공 연출"
            />
            <Text type="secondary" style={{ fontSize: 13 }}>
              {reducedMotion ? '움직임 줄이기 설정이라 연출을 끕니다' : '세공 연출'}
            </Text>
          </Flex>
        </Flex>
        {simulator.lastBatch > 1 && lastIsHere ? (
          <Text
            type="secondary"
            className="tnum"
            style={{ display: 'block', fontSize: 12, marginTop: 8 }}
          >
            방금 {formatNumber(simulator.lastBatch)}번 세공했습니다. 세공 창에는 마지막 결과가
            보이고, 나머지는 아래 기록에 있습니다.
          </Text>
        ) : null}
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
                  detail="도구와 기억의 보석마다 쓴 개수에 한 개 값을 곱해 더했습니다. 값을 고치면 다시 셉니다."
                />
              }
              value={formatGoldShort(spent)}
              styles={NUMERIC}
            />
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {unpriced > 0
                ? `값을 모르는 ${formatNumber(unpriced)}개는 빠졌습니다.`
                : `도구 ${formatGoldShort(toolSpent)}, 기억의 보석 ${formatGoldShort(gemSpent)}`}
            </Text>
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
              value={formatNumber(usage.limitBreaks)}
              suffix="줄"
              styles={NUMERIC}
            />
          </Col>
        </Row>
      </Card>

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
        {count === 0 ? (
          <EmptyState
            size="small"
            variant="search"
            description="세공하기를 누르면 붙은 옵션 세 줄이 여기에 쌓입니다."
          />
        ) : null}
        <Text type="secondary" style={{ fontSize: 12 }}>
          {tool.name}는 {formatTableDate(tool.date)} 이후 확률표를 따릅니다. 확률표는 랭크를 고르게
          되어 있지만 세공은 늘 1랭크 세 줄로 붙습니다. 쓴 골드는 도구와 기억의 보석 값만 셉니다.
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
