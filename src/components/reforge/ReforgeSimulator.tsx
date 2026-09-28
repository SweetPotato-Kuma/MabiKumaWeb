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
  Collapse,
  Divider,
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
  TreeSelect,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { SERIES_COLORS } from '@/app/theme';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import {
  AddIcon,
  DeleteIcon,
  GemIcon,
  HammerIcon,
  InfoIcon,
  ResetIcon,
  StarFillIcon,
  StarIcon,
} from '@/components/icons';
import { useMarketPrices, type PriceState } from '@/features/crafting/market';
import {
  racesFor,
  tableKey,
  typesFor,
  TYPE_ICONS,
  typeTree,
  useReforgeDataQuery,
  type PoolRow,
  type ReforgeData,
  type ReforgeToolId,
} from '@/features/reforge/data';
import {
  isSameItem,
  levelTier,
  meetsTargets,
  optionEffect,
  parseOption,
  REFORGE_LINES,
  targetChance,
  UNTIL_CAP,
  type LevelTier,
  type ParsedOption,
  type ReforgeDraw,
  type ReforgeLine,
  type ReforgeSetting,
  type ReforgeSimulator as Simulator,
  type ReforgeTarget,
} from '@/features/reforge/simulator';
import { formatGold, formatGoldShort, formatNumber } from '@/lib/format';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import { useResolvedThemeMode } from '@/lib/themePreference';
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

/** 트리 묶음의 값. 타입 번호와 겹치지 않게 문자열로 둔다. */
const groupKey = (name: string) => `group:${name}`;

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

/** 옵션의 일반 구간 끝 레벨. 묶음에 없으면(다른 장비의 기록) 그 레벨을 끝으로 본다. */
const normalMaxOf = (pool: readonly PoolRow[] | undefined, line: ReforgeLine) =>
  pool?.find((row) => row[0] === line.option)?.[2] ?? line.level;

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

/** 장비 타입의 그림. 그 타입의 대표 아이템 그림을 쓴다. 대표가 없으면 그리지 않는다. */
function TypeIcon({ name, size }: { name: string; size: number }) {
  const entry = TYPE_ICONS[name];
  if (!entry) return null;
  return <ItemIcon category={entry[0]} name={entry[1]} size={size} />;
}

/**
 * 레벨 표시. 한계 돌파는 "한계 돌파" 글자 표, 일반 구간의 끝 레벨은 채운 별과 "최대", 끝 레벨의
 * 90% 이상은 빈 별이다. 한계 돌파와 수치 강조가 섞여 보이지 않게 모양과 글자를 다르게 둔다.
 */
function TierMark({ tier }: { tier: LevelTier }) {
  const { token } = theme.useToken();
  const limitBreak = useLimitBreakColor();
  if (tier === 'limitBreak')
    return (
      <Tag
        style={{
          marginInlineEnd: 0,
          color: limitBreak,
          borderColor: limitBreak,
          background: 'transparent',
        }}
      >
        한계 돌파
      </Tag>
    );
  if (tier === 'max')
    return (
      <Flex gap={2} align="center" style={{ color: token.colorPrimary, whiteSpace: 'nowrap' }}>
        <StarFillIcon aria-hidden style={{ fontSize: 13 }} />
        <Text strong style={{ color: token.colorPrimary, fontSize: 12 }}>
          최대
        </Text>
      </Flex>
    );
  if (tier === 'high')
    return (
      <Tooltip title="일반 구간 끝 레벨의 90% 이상">
        <StarIcon
          aria-label="끝 레벨의 90% 이상"
          style={{ color: token.colorPrimary, fontSize: 13 }}
        />
      </Tooltip>
    );
  return null;
}

/**
 * 한계 돌파의 색. 이 사이트의 info 색은 액센트와 같아 수치 강조와 섞이므로, 항목을 가르는 데이터 색의
 * 첫 번째를 쓴다. 글자 표("한계 돌파")가 함께 붙어 색만으로 가르지 않는다.
 */
function useLimitBreakColor(): string {
  return SERIES_COLORS[useResolvedThemeMode()][0];
}

/** 강조할 레벨의 글자색. 한계 돌파는 데이터 색, 수치 강조는 액센트다. */
function useTierColor(tier: LevelTier): string | undefined {
  const { token } = theme.useToken();
  const limitBreak = useLimitBreakColor();
  if (tier === 'limitBreak') return limitBreak;
  if (tier === 'max' || tier === 'high') return token.colorPrimary;
  return undefined;
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
function CompactLine({
  line,
  option,
  normalMax,
}: {
  line: ReforgeLine;
  option: ParsedOption;
  normalMax: number;
}) {
  const tier = levelTier(line, normalMax);
  const color = useTierColor(tier);
  const effect = optionEffect(option, line.level);
  return (
    <Flex gap={6} align="center" wrap style={{ minWidth: 0 }}>
      <Text style={{ fontSize: 13, color }}>{option.name}</Text>
      <Text
        className="tnum"
        strong={tier !== null}
        style={{ fontSize: 13, whiteSpace: 'nowrap', color }}
      >
        {line.level}레벨
      </Text>
      {effect ? (
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {effect}
        </Text>
      ) : null}
      <TierMark tier={tier} />
    </Flex>
  );
}

/** 세공 창의 옵션 한 줄. 게임처럼 이름 아래에 "(7/10 레벨 : 7% 증가)" 를 적는다. */
function WindowLine({
  line,
  option,
  normalMax,
  index,
}: {
  line: ReforgeLine;
  option: ParsedOption;
  normalMax: number;
  index: number;
}) {
  const tier = levelTier(line, normalMax);
  const color = useTierColor(tier);
  const effect = optionEffect(option, line.level);
  return (
    <div className="rf-line" style={{ '--i': index } as CSSProperties}>
      <Flex gap={6} align="center" wrap>
        <Text strong style={{ color }}>
          {option.name}
        </Text>
        <TierMark tier={tier} />
      </Flex>
      <Text type={tier ? undefined : 'secondary'} className="tnum" style={{ fontSize: 13, color }}>
        ({line.level}/{normalMax} 레벨{effect ? ` : ${effect}` : ''})
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
        minHeight: 120,
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
              normalMax={normalMaxOf(pool, line)}
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
  itemName,
  itemLabel,
  gemOn,
  gemUsable,
  onToggleGem,
  play,
  fxStyle,
}: {
  /** 장비 타입 이름. 그림을 찾는 데 쓴다. */
  itemName: string;
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
          <TypeIcon name={itemName} size={44} />
          <Text strong style={{ fontSize: 11, lineHeight: 1.2, position: 'relative' }}>
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

/**
 * 세공 기록 표. 기록이 쌓일수록 그리는 데 오래 걸려, 세공 창보다 한 박자 늦게 그린다
 * (rows 는 useDeferredValue 로 늦춘 값이다). 같은 rows 면 다시 그리지 않는다.
 */
const HistoryTable = memo(function HistoryTable({
  rows,
  data,
  options,
}: {
  rows: ReforgeDraw[];
  data: ReforgeData;
  options: ParsedOption[];
}) {
  const toolName = useMemo(
    () => new Map(data.tools.map((tool) => [tool.id, shortToolName(tool.name)])),
    [data.tools],
  );
  const typeName = useMemo(
    () => new Map(data.types.map((type) => [type.id, type.name])),
    [data.types],
  );
  const poolOf = (draw: ReforgeDraw) =>
    data.pools[data.tables[tableKey(draw.tool, draw.type, draw.race)]];
  const columns: TableColumnsType<ReforgeDraw> = [
    {
      title: '번째',
      dataIndex: 'no',
      width: 64,
      align: 'right',
      render: (no: number) => <span className="tnum">{formatNumber(no)}</span>,
    },
    {
      title: '도구와 장비',
      key: 'setting',
      width: 190,
      render: (_value, draw) => (
        <Flex gap={8} align="center">
          <TypeIcon name={typeName.get(draw.type) ?? ''} size={28} />
          <Flex vertical gap={0}>
            <Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
              {toolName.get(draw.tool)}
              {draw.gem ? ', 기억의 보석' : ''}
            </Text>
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {typeName.get(draw.type)}, {data.races[draw.race]}
            </Text>
          </Flex>
        </Flex>
      ),
    },
    {
      title: '옵션',
      key: 'lines',
      render: (_value, draw) => {
        const pool = poolOf(draw);
        return (
          <Flex vertical gap={2}>
            {draw.lines.map((line) => (
              <CompactLine
                key={line.option}
                line={line}
                option={options[line.option]}
                normalMax={normalMaxOf(pool, line)}
              />
            ))}
          </Flex>
        );
      },
    },
  ];

  return (
    <Table<ReforgeDraw>
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
      locale={{ emptyText: '아직 세공하지 않았습니다.' }}
    />
  );
});

/** 목표 옵션 고르기. 세 줄까지, 옵션마다 바라는 가장 낮은 레벨. 고르지 않으면 단추 하나만 남는다. */
function TargetEditor({
  pool,
  options,
  targets,
  onChange,
  summary,
}: {
  pool: readonly PoolRow[];
  options: ParsedOption[];
  targets: ReforgeTarget[];
  onChange: (targets: ReforgeTarget[]) => void;
  summary: ReactNode;
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
    <Flex vertical gap={6}>
      {targets.map((target, index) => {
        const row = rowOf(target.option);
        if (!row) return null;
        const used = new Set(targets.filter((_, other) => other !== index).map((t) => t.option));
        const highest = row[4] || row[2];
        return (
          <Flex key={`${target.option}-${index}`} gap={8} align="center" wrap>
            <Select<number>
              aria-label={`목표 옵션 ${index + 1}`}
              size="small"
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
              style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 320 }}
            />
            <Tooltip title={rangeText(row)}>
              <InputNumber
                aria-label={`목표 옵션 ${index + 1}의 가장 낮은 레벨`}
                size="small"
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
                style={{ width: 120 }}
              />
            </Tooltip>
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {rangeText(row)}
            </Text>
            <Button
              type="text"
              size="small"
              icon={<DeleteIcon />}
              aria-label={`목표 옵션 ${index + 1} 빼기`}
              onClick={() => replace(index, null)}
            />
          </Flex>
        );
      })}
      <Flex gap={8} align="center" wrap>
        <Button
          size="small"
          icon={<AddIcon />}
          onClick={add}
          disabled={targets.length >= MAX_TARGETS || targets.length >= pool.length}
        >
          목표 옵션 추가
        </Button>
        {summary}
      </Flex>
    </Flex>
  );
}

/** 경매장 최저가. 매물이 없거나 받지 못했으면 null. */
function lowestOf(state: PriceState | undefined): number | null {
  if (state?.status !== 'ok') return null;
  return state.price.offers[0]?.price ?? null;
}

/**
 * 세공 시뮬레이터 본체. 확률표를 받은 뒤에 그린다.
 *
 * 세공 창 위쪽 한 줄에서 도구와 장비를 고르고, 게임의 세공 창처럼 왼쪽 작업대에 장비와 기억의 보석을
 * 올려 세공한다. 기억의 보석을 쓰면 장비의 옵션은 그대로 두고 새 옵션만 보여 주며, "신규 옵션
 * 적용하기" 를 눌러야 붙는다. 쓴 골드는 도구와 보석마다 쓴 개수에 경매장 최저가를 곱해 더한다.
 */
function SimulatorBody({ data, simulator }: { data: ReforgeData; simulator: Simulator }) {
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const { token } = theme.useToken();
  const reducedMotion = usePrefersReducedMotion();

  const [toolId, setToolId] = useState<ReforgeToolId>(data.tools[0].id);
  const tool = data.tools.find((entry) => entry.id === toolId) ?? data.tools[0];
  const types = useMemo(() => typesFor(data, tool.id), [data, tool.id]);

  const tree = useMemo(() => typeTree(types), [types]);
  const [typeChoice, setTypeChoice] = useState<number | null>(null);
  // 고른 타입을 이 도구로 세공할 수 없으면 트리의 첫 타입으로 간다.
  const typeId =
    types.find((type) => type.id === typeChoice)?.id ?? tree[0]?.types[0]?.id ?? types[0].id;

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
  /**
   * 마지막 세공을 연출로 보여 줄지. 세공 단추를 누를 때 정한다. 스위치 상태만 보고 정하면, 끈 채로
   * 세공한 뒤 스위치를 켜는 순간 지난 세공의 연출이 돌았다.
   */
  const [armed, setArmed] = useState(false);
  const reforge = (times: number) => {
    setArmed(animate);
    simulator.draw(setting, times, gemOn);
  };

  // 도구와 보석 값은 경매장 최저가다. 방문자가 넣지 않아도 아래 통계에서 알아서 센다.
  const priceNames = useMemo(
    () => [...data.tools.map((entry) => entry.name), GEM_NAME],
    [data.tools],
  );
  const marketPrices = useMarketPrices(priceNames);
  const priceOf = (name: string): number | null => lowestOf(marketPrices.get(name));
  const pricesLoading = priceNames.some((name) => marketPrices.get(name)?.status === 'loading');
  const gemPrice = priceOf(GEM_NAME);
  const toolPrice = priceOf(tool.name);
  const onePull = toolPrice === null ? null : toolPrice + (gemOn ? (gemPrice ?? 0) : 0);

  const { draws } = simulator;
  const count = draws.length;
  const hitCount = useMemo(
    () => draws.filter((draw) => meetsTargets(draw.lines, targets)).length,
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
  const priceLines: string[] = [];
  for (const [id, used] of usage.tools) {
    const name = data.tools.find((entry) => entry.id === id)?.name ?? '';
    const price = priceOf(name);
    if (price === null) unpriced += used;
    else toolSpent += price * used;
    priceLines.push(`${name} ${price === null ? '시세 없음' : formatGold(price)}`);
  }
  if (usage.gems > 0)
    priceLines.push(`${GEM_NAME} ${gemPrice === null ? '시세 없음' : formatGold(gemPrice)}`);
  const gemSpent = gemPrice === null ? 0 : gemPrice * usage.gems;
  if (gemPrice === null) unpriced += usage.gems;
  const spent = toolSpent + gemSpent;

  // 연출. 한 번 세공했을 때만 돌린다. 여러 번 한 뒤에는 마지막 결과만 바로 보인다.
  const last = draws[count - 1] ?? null;
  const lastIsHere = last !== null && item !== null && simulator.lastBatch > 0;
  const play = armed && animate && lastIsHere && simulator.lastBatch === 1 ? last : null;
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
  const revealKey = armed && animate && lastIsHere ? last.no : null;
  const revealsPending = last?.gem ?? false;

  const history = useMemo(() => [...draws].reverse(), [draws]);
  // 표는 세공 창보다 늦게 그린다. 누르자마자 창에 결과가 먼저 뜬다.
  const settledHistory = useDeferredValue(history);

  // 묶음은 펼치기만 하고 고를 수 없다. 잎마다 그 타입의 그림을 붙인다.
  const treeData = tree.map((group) => ({
    value: groupKey(group.name),
    label: group.name,
    title: group.name,
    selectable: false,
    children: group.types.map((type) => ({
      value: type.id,
      label: type.name,
      title: (
        <Flex gap={8} align="center">
          <TypeIcon name={type.name} size={22} />
          <span>{type.name}</span>
        </Flex>
      ),
    })),
  }));

  const itemLabel = `${typeName.get(typeId)}${data.races[race] === '공용' ? '' : ` (${data.races[race]})`}`;

  const targetSummary =
    targets.length === 0 ? (
      <Text type="secondary" style={{ fontSize: 12 }}>
        고르면 한 번에 붙을 확률과 평균 비용을 셉니다.
      </Text>
    ) : (
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
    );

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined" role="region" aria-label="세공 창">
        {/* 고르는 칸은 한 줄. 좁으면 알아서 다음 줄로 넘어간다. */}
        <Flex gap={8} align="center" wrap>
          <Segmented<ReforgeToolId>
            value={tool.id}
            onChange={setToolId}
            aria-label="세공 도구"
            options={data.tools.map((entry) => ({
              value: entry.id,
              label: shortToolName(entry.name),
            }))}
          />
          <TreeSelect<number>
            aria-label="장비 종류"
            showSearch
            treeNodeFilterProp="label"
            value={typeId}
            onChange={setTypeChoice}
            treeData={treeData}
            // 처음 열면 고른 타입이 든 묶음만 펼친다. 찾으면 맞는 묶음이 알아서 펼쳐진다.
            treeDefaultExpandedKeys={[
              groupKey(
                tree.find((group) => group.types.some((type) => type.id === typeId))?.name ?? '',
              ),
            ]}
            listHeight={360}
            popupMatchSelectWidth={false}
            style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 280 }}
          />
          <Select<number>
            aria-label="착용 종족"
            value={race}
            onChange={setRaceChoice}
            options={races.map((entry) => ({ value: entry, label: data.races[entry] }))}
            popupMatchSelectWidth={false}
            style={{ flex: '0 1 130px', minWidth: 0 }}
          />
        </Flex>
        <div style={{ marginTop: 10 }}>
          <TargetEditor
            pool={pool}
            options={options}
            targets={targets}
            onChange={setTargets}
            summary={targetSummary}
          />
        </div>

        <Divider style={{ marginBlock: 16 }} />

        {/* 작업대와 옵션 두 칸. 768px 미만에서는 위아래로 쌓는다. */}
        <Row gutter={[24, 20]}>
          <Col xs={24} md={10}>
            <Flex vertical gap={12} align="center">
              <Text strong style={{ fontSize: 16 }}>
                {tool.name}
              </Text>
              <Workbench
                itemName={typeName.get(typeId) ?? ''}
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
                onClick={() => reforge(1)}
                style={{ minWidth: 160 }}
              >
                세공하기
              </Button>
              {/* 세공하기 바로 아래에 둔다. 누르기 전에 눈에 들어와야 끌지 말지 고른다. */}
              <Flex gap={8} align="center">
                <Switch
                  checked={fxOn && !reducedMotion}
                  disabled={reducedMotion}
                  onChange={(on) => {
                    setFxOn(on);
                    setArmed(false);
                    writeFxSetting(on);
                  }}
                  aria-label="세공 연출"
                />
                <Text style={{ fontSize: 13 }}>
                  {reducedMotion ? '움직임 줄이기 설정이라 연출을 끕니다' : '세공 연출'}
                </Text>
              </Flex>
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {tool.name} {formatNumber(usage.tools.get(tool.id) ?? 0)}개, 기억의 보석{' '}
                {formatNumber(usage.gems)}개 사용
              </Text>
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
          <Button onClick={() => reforge(10)}>10번 세공</Button>
          <Tooltip
            title={
              targets.length === 0
                ? '목표 옵션을 고르면 쓸 수 있습니다.'
                : `목표를 채울 때까지 세공합니다. 많아야 ${formatNumber(UNTIL_CAP)}번까지입니다.`
            }
          >
            <Button
              onClick={() => {
                setArmed(animate);
                simulator.drawUntil(setting, targets, gemOn);
              }}
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
        {/* 네 칸. 768px 미만에서는 두 칸씩 두 줄로 떨어진다. */}
        <Row gutter={[24, 16]} align="top">
          <Col xs={12} md={6}>
            <Statistic title="세공" value={formatNumber(count)} suffix="번" styles={NUMERIC} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic
              title={
                <StatTitle
                  label="쓴 골드"
                  detail={`도구와 기억의 보석마다 쓴 개수에 경매장 최저가를 곱해 더했습니다. 게임 데이터는 평균 10분 지연됩니다.${
                    priceLines.length ? ` 개당 ${priceLines.join(', ')}.` : ''
                  }`}
                />
              }
              value={formatGoldShort(spent)}
              styles={NUMERIC}
            />
            <Flex gap={6} align="center">
              {pricesLoading ? <Spin size="small" /> : null}
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {pricesLoading
                  ? '경매장 시세를 받는 중입니다.'
                  : unpriced > 0
                    ? `시세가 없는 ${formatNumber(unpriced)}개는 빠졌습니다.`
                    : `도구 ${formatGoldShort(toolSpent)}, 기억의 보석 ${formatGoldShort(gemSpent)}`}
              </Text>
            </Flex>
          </Col>
          <Col xs={12} md={6}>
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
          <Col xs={12} md={6}>
            <Statistic
              title="한계 돌파 줄"
              value={formatNumber(usage.limitBreaks)}
              suffix="줄"
              styles={NUMERIC}
            />
          </Col>
        </Row>
      </Card>

      <Collapse
        items={[
          {
            key: 'history',
            label: (
              <Text strong className="tnum">
                세공 기록 {formatNumber(count)}번
              </Text>
            ),
            styles: { body: { padding: 0 } },
            children:
              count === 0 ? (
                <EmptyState
                  size="small"
                  variant="search"
                  description="세공하기를 누르면 붙은 옵션 세 줄이 여기에 쌓입니다."
                />
              ) : (
                <HistoryTable rows={settledHistory} data={data} options={options} />
              ),
          },
        ]}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        {tool.name}는 {formatTableDate(tool.date)} 이후 확률표를 따릅니다. 확률표는 랭크를 고르게
        되어 있지만 세공은 늘 1랭크 세 줄로 붙습니다. 채운 별과 "최대" 는 일반 구간의 끝 레벨, 빈
        별은 끝 레벨의 90% 이상, "한계 돌파" 는 한계 돌파 구간에서 나온 레벨입니다.
      </Text>
    </Flex>
  );
}

/** 확률표를 받은 뒤 본체를 그린다. 받는 동안은 세공 창 모양의 뼈대를 보인다. */
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
