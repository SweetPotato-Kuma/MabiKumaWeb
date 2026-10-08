import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Flex,
  Grid,
  Input,
  Popover,
  Row,
  Select,
  Skeleton,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { QueryState } from '@/components/QueryState';
import { CalculateIcon, CloseIcon, GiftIcon, ResetIcon, StarFillIcon } from '@/components/icons';
import { TrialCountInput, TrialOdds } from '@/components/simulator/TrialOdds';
import { normalizeForSearch } from '@/features/auction/dictionary';
import {
  addCounts,
  countByGrade,
  fxTierOf,
  isOnSale,
  isTopGrade,
  openKit,
  RECENT_LIMIT,
  kitIconOf,
  useKitIndexQuery,
  useKitQuery,
  type Kit,
  type KitIndex,
  type KitSummary,
} from '@/features/kits/kits';
import { formatChance } from '@/features/simulator/trials';
import { formatNumber } from '@/lib/format';
import { useNarrowScreen } from '@/lib/narrowScreen';
import './kitFx.css';

const { Text } = Typography;

/** 한 번에 여는 횟수 단추. */
const OPEN_COUNTS = [1, 10, 100] as const;
/** 목표까지 자동으로 여는 횟수 상한. */
const AUTO_LIMITS = [1000, 10000] as const;

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

/** 한 번 열기 연출의 길이, 빛살, 반짝임, 금빛 빛살 수. */
const FX_DURATION = 1200;
const RAYS = 12;
const SPARKS = 10;
const GOLD_RAYS = 16;
/** 가장 높은 등급은 금빛이 다 퍼질 때까지 결과를 늦게 센다. */
const GOLD_EXTRA_MS = 500;
/** "키트 연출" 끄기를 이 브라우저에 기억해 두는 자리. */
const FX_STORAGE_KEY = 'mabikuma:kitFx';

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

const kitLabel = (kit: Pick<KitSummary, 'name' | 'start' | 'firstSeen'>) =>
  `${kit.name} (${kit.start ?? kit.firstSeen ?? '날짜 모름'})`;

/** 지정 색상 상품의 색 견본. 색은 상품의 데이터라 토큰이 아니라 그 값으로 칠한다. */
function ColorChips({ colors }: { colors: readonly string[] }) {
  const { token } = theme.useToken();
  return (
    <Flex gap={4} align="center" wrap>
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          title={`#${color}`}
          aria-label={`색 #${color}`}
          style={{
            display: 'inline-block',
            width: 14,
            height: 14,
            borderRadius: 3,
            background: `#${color}`,
            border: `1px solid ${token.colorBorder}`,
          }}
        />
      ))}
    </Flex>
  );
}

/**
 * 아이템 이름. 가장 높은 등급이면 금빛, 지정 색상이면 견본을 붙인다. iconSize 를 주면 앞에 그림을 둔다.
 * 게임 데이터에서 찾지 못한 이름은 그림 자리를 비워 두어 줄마다 이름 시작이 어긋나지 않게 한다.
 */
function ItemName({ kit, item, iconSize }: { kit: Kit; item: number; iconSize?: number }) {
  const { token } = theme.useToken();
  const each = kit.items[item];
  const top = isTopGrade(kit, item);
  const icon = kitIconOf(kit, each.name);
  return (
    <Flex gap={6} align="center" wrap={iconSize === undefined} style={{ minWidth: 0 }}>
      {iconSize !== undefined ? (
        icon ? (
          <ItemIcon file={icon} size={iconSize} />
        ) : (
          <span aria-hidden style={{ width: iconSize, flex: `0 0 ${iconSize}px` }} />
        )
      ) : null}
      {/* 별은 글자 안에 둔다. 따로 두면 좁은 칸에서 별만 윗줄에 남는다. */}
      <Text strong={top} style={top ? { color: token.gold8 } : undefined}>
        {top ? (
          <StarFillIcon
            style={{ color: token.gold7, fontSize: 14, marginInlineEnd: 4, verticalAlign: -2 }}
          />
        ) : null}
        {each.name}
        {each.count && each.count > 1 ? ` ${formatNumber(each.count)}개` : ''}
      </Text>
      {each.colors?.length ? <ColorChips colors={each.colors} /> : null}
    </Flex>
  );
}

const gradeName = (kit: Kit, item: number) => {
  const grade = kit.items[item]?.grade;
  return grade === undefined ? null : (kit.grades[grade]?.name ?? null);
};

interface ItemRow {
  item: number;
  name: string;
  grade: string | null;
  chance: number;
  count: number;
}

/** 지금까지 얻은 아이템. 드문 것부터. */
function TallyTable({ kit, counts }: { kit: Kit; counts: ReadonlyMap<number, number> }) {
  const narrow = useNarrowScreen();
  const rows: ItemRow[] = [...counts]
    .map(([item, count]) => ({
      item,
      name: kit.items[item].name,
      grade: gradeName(kit, item),
      chance: kit.items[item].chance,
      count,
    }))
    .sort((a, b) => a.chance - b.chance || a.item - b.item);
  const columns: TableColumnsType<ItemRow> = [
    {
      title: '얻은 아이템',
      key: 'name',
      render: (_value, row) => (
        <Flex vertical gap={2}>
          <ItemName kit={kit} item={row.item} iconSize={32} />
          {narrow && row.grade ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.grade}
            </Text>
          ) : null}
        </Flex>
      ),
    },
    ...(narrow || kit.grades.length === 0
      ? []
      : [
          {
            title: '등급',
            key: 'grade',
            width: 90,
            render: (_value: unknown, row: ItemRow) => <Text>{row.grade ?? '-'}</Text>,
          },
        ]),
    {
      title: '개수',
      key: 'count',
      width: 80,
      align: 'right',
      render: (_value, row) => <Text className="tnum">{formatNumber(row.count)}</Text>,
    },
  ];
  return (
    <Table<ItemRow>
      columns={columns}
      dataSource={rows}
      rowKey="item"
      size="small"
      pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
      locale={{
        emptyText: <EmptyState size="small" description="열면 얻은 아이템이 여기에 쌓입니다." />,
      }}
    />
  );
}

/** 키트의 구성품과 확률. */
function ItemTable({ kit, onTarget }: { kit: Kit; onTarget: (item: number) => void }) {
  const narrow = useNarrowScreen();
  const [keyword, setKeyword] = useState('');
  const term = normalizeForSearch(keyword);
  const rows: ItemRow[] = kit.items
    .map((item, index) => ({
      item: index,
      name: item.name,
      grade: gradeName(kit, index),
      chance: item.chance,
      count: 0,
    }))
    .filter((row) => !term || normalizeForSearch(row.name).includes(term));
  const hasGrades = kit.grades.length > 0;

  const columns: TableColumnsType<ItemRow> = [
    ...(hasGrades && !narrow
      ? [
          {
            title: '등급',
            key: 'grade',
            width: 90,
            filters: kit.grades.map((grade) => ({ text: grade.name, value: grade.name })),
            onFilter: (value: unknown, row: ItemRow) => row.grade === value,
            render: (_value: unknown, row: ItemRow) => <Text>{row.grade ?? '-'}</Text>,
          },
        ]
      : []),
    {
      title: '아이템',
      key: 'name',
      render: (_value, row) => (
        <Flex vertical gap={2}>
          <ItemName kit={kit} item={row.item} iconSize={32} />
          {narrow && row.grade ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.grade}
            </Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: '확률',
      key: 'chance',
      width: 96,
      align: 'right',
      sorter: (a, b) => a.chance - b.chance,
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
        <Button size="small" onClick={() => onTarget(row.item)} aria-label={`${row.name} 목표로`}>
          목표로
        </Button>
      ),
    },
  ];

  return (
    // 표가 길어 처음에는 접어 둔다. 열 때 처음 그린다.
    <Collapse
      items={[
        {
          key: 'items',
          label: (
            <Text strong className="tnum">
              구성품 확률 {formatNumber(kit.items.length)}종
            </Text>
          ),
          children: (
            <Flex vertical gap={10}>
              {hasGrades ? (
                <Flex gap={8} wrap>
                  {kit.grades.map((grade) => (
                    <Tag key={grade.name} style={{ marginInlineEnd: 0 }}>
                      <span className="tnum">
                        {grade.name} {grade.chance === null ? '' : formatChance(grade.chance)}
                      </span>
                    </Tag>
                  ))}
                </Flex>
              ) : null}
              <Input
                aria-label="구성품 이름으로 찾기"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="예: 헤일로"
                allowClear
                style={{ maxWidth: 320 }}
              />
              <Table<ItemRow>
                columns={columns}
                dataSource={rows}
                rowKey="item"
                size="small"
                pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
              />
            </Flex>
          ),
        },
      ]}
    />
  );
}

/**
 * 키트 상자 판. 가운데에 상자가 놓이고, 한 번 열면 상자가 터지며 나온 아이템 카드가 튀어나온다.
 * play 가 바뀌면 판을 새로 그려 연출을 처음부터 돌린다. 연출하지 않을 때는 마지막에 나온 아이템을 그대로 둔다.
 */
function KitStage({
  kit,
  item,
  play,
  fxStyle,
  scale,
}: {
  kit: Kit;
  /** 마지막에 나온 아이템. 아직 열지 않았으면 null 이고 상자가 놓인다. */
  item: number | null;
  /** 연출할 열기의 번호. 연출하지 않으면 null. */
  play: number | null;
  fxStyle: CSSProperties;
  /** 판 배율(--rf 와 같다). 그림 크기도 같이 키운다. */
  scale: number;
}) {
  // 아이템 그림은 인벤토리 칸(24px) 단위라 48 이면 대부분이 원래 크기 그대로 들어간다.
  const boxSize = Math.round(64 * scale);
  const resultSize = Math.round(48 * scale);
  const playing = play !== null && item !== null;
  const tier = item === null ? 0 : fxTierOf(kit, item);
  const top = item !== null && isTopGrade(kit, item);
  const grade = item === null ? null : gradeName(kit, item);
  const boxIcon = kitIconOf(kit, kit.name);
  const itemIcon = item === null ? '' : kitIconOf(kit, kit.items[item].name);
  const classes = ['kt-stage'];
  if (playing) {
    classes.push('kt-play');
    // 겹은 아래 것을 모두 품는다. 가장 높은 등급이면 번쩍임, 빛살, 반짝임, 금빛이 함께 돈다.
    for (const step of [1, 2, 3]) if (tier >= step) classes.push(`kt-t${step}`);
  }
  const at = (step: number) => playing && tier >= step;
  return (
    <div key={play ?? 'still'} className={classes.join(' ')} style={fxStyle} aria-hidden>
      <div className="kt-stage-body">
        <div className="kt-ring" />
        <div className="kt-ring kt-ring--inner" />
        {at(3) ? (
          <div className="kt-gold-layer">
            <div className="kt-gold-flash" />
            {angles(GOLD_RAYS).map((angle, index) => (
              <span
                key={angle}
                className="kt-gold-ray"
                style={{ '--a': `${angle}deg`, '--i': index } as CSSProperties}
              />
            ))}
          </div>
        ) : null}
        {at(2)
          ? angles(RAYS).map((angle) => (
              <span
                key={`ray-${angle}`}
                className="kt-ray"
                style={{ '--a': `${angle}deg` } as CSSProperties}
              />
            ))
          : null}
        {at(1) ? <div className="kt-flash" /> : null}
        {playing ? <div className="kt-burst" /> : null}
        {item === null || playing ? (
          <div className="kt-box">
            {boxIcon ? <ItemIcon file={boxIcon} size={boxSize} /> : <GiftIcon />}
          </div>
        ) : null}
        {item !== null ? (
          <div className={top ? 'kt-result kt-result--top' : 'kt-result'}>
            {itemIcon ? <ItemIcon file={itemIcon} size={resultSize} /> : null}
            <ItemName kit={kit} item={item} />
            {grade ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {grade}
              </Text>
            ) : null}
          </div>
        ) : null}
        {at(3)
          ? angles(SPARKS).map((angle, index) => (
              <StarFillIcon
                key={`spark-${angle}`}
                aria-hidden
                className="kt-spark"
                style={{ '--a': `${angle + 18}deg`, '--i': index } as CSSProperties}
              />
            ))
          : null}
        {at(3) ? <StarFillIcon aria-hidden className="kt-glint" /> : null}
      </div>
    </div>
  );
}

/** 고른 키트를 열어 보는 칸. 키트를 바꾸면 새로 그린다. */
function KitOpener({ kit, onSale }: { kit: Kit; onSale: boolean }) {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const [opened, setOpened] = useState(0);
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const [recent, setRecent] = useState<number[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [calcOpen, setCalcOpen] = useState(false);
  const [trials, setTrials] = useState(100);

  // 연출. 누를 때의 스위치 상태로 정한다(끈 채 연 뒤 켜도 지난 연출이 돌지 않게).
  const [fxOn, setFxOn] = useState(readFxSetting);
  const [batch, setBatch] = useState(0);
  const [play, setPlay] = useState<number | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);
  const last = recent.length > 0 ? recent[recent.length - 1] : null;

  /*
   * 한 번 열기 연출이 도는 동안에는 방금 나온 것을 통계와 목록에 넣지 않는다. 먼저 올라가면 상자가 열리기 전에
   * 무엇이 나왔는지 알려 버린다. 연출이 끝나면 넣는다.
   */
  const [settled, setSettled] = useState(0);
  const pending = play !== null && settled < play && last !== null ? last : null;
  const fxTotal = FX_DURATION + (last !== null && fxTierOf(kit, last) === 3 ? GOLD_EXTRA_MS : 0);
  useEffect(() => {
    if (pending === null || play === null) return;
    const timer = window.setTimeout(() => setSettled(play), fxTotal);
    return () => window.clearTimeout(timer);
  }, [pending, play, fxTotal]);
  const shownCounts = useMemo(() => {
    if (pending === null) return counts;
    const next = new Map(counts);
    const left = (next.get(pending) ?? 0) - 1;
    if (left > 0) next.set(pending, left);
    else next.delete(pending);
    return next;
  }, [counts, pending]);
  const shownOpened = opened - (pending === null ? 0 : 1);
  /*
   * 연출하는 동안 목록은 누르기 전 모습 그대로 둔다. 새 줄만 숨기면 목록이 10줄로 잘리며 맨 아래 줄이 먼저
   * 빠져 한 줄 짧아졌다가 연출이 끝나면 다시 길어져, 아래 단추들이 들썩였다.
   */
  const [before, setBefore] = useState<number[]>([]);
  const shownRecent = pending === null ? recent : before;

  const chance = target === null ? 0 : kit.items[target].chance;
  const gradeCounts = useMemo(() => countByGrade(kit, shownCounts), [kit, shownCounts]);

  const run = (times: number, until: number | null) => {
    const result = openKit(kit, times, until);
    const next = batch + 1;
    setBatch(next);
    setOpened((prev) => prev + result.opened);
    setCounts((prev) => addCounts(prev, result.counts));
    // 한 번씩 열 때는 지난 결과에 이어 붙여 최근 것을 쌓아 보이고, 여러 번 열면 이번 것만 보인다.
    setBefore(recent);
    setRecent((prev) =>
      times === 1 ? [...prev, ...result.recent].slice(-RECENT_LIMIT) : result.recent,
    );
    const single = times === 1 && until === null;
    setPlay(fxOn && single ? next : null);
    setReveal(fxOn && !single ? next : null);
    if (until === null) setMessage('');
    else
      setMessage(
        result.hit
          ? `${formatNumber(result.opened)}번 만에 목표 아이템이 나왔습니다.`
          : `${formatNumber(times)}번 동안 목표 아이템이 나오지 않았습니다.`,
      );
  };

  const reset = () => {
    setOpened(0);
    setCounts(new Map());
    setRecent([]);
    setMessage('');
    setPlay(null);
    setReveal(null);
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
    // 가장 높은 등급 금빛. 다른 시뮬레이터의 최상위 결과와 같은 금색 토큰이다.
    '--fx-gold': token.gold,
    '--fx-gold-line': token.gold6,
    '--fx-gold-bg': token.gold1,
    '--fx-dur': `${play !== null ? FX_DURATION : 0}ms`,
    '--rf': stageScale,
  } as CSSProperties;

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined" role="region" aria-label="키트 열기">
        <Flex vertical gap={14}>
          <Flex gap={8} align="center" wrap>
            {onSale ? <Tag color="success">판매 중</Tag> : null}
            <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
              {[
                kit.start ? `${kit.start}${kit.end ? ` ~ ${kit.end}` : ''}` : '',
                kit.price !== null ? `한 번 ${formatNumber(kit.price)} 캐시` : '',
                `구성품 ${formatNumber(kit.items.length)}종`,
              ]
                .filter(Boolean)
                .join(', ')}
            </Text>
          </Flex>

          {/* 여는 칸과 목표 칸. 768px 미만에서는 위아래로 쌓는다. */}
          <Row gutter={[24, 20]} align="stretch">
            <Col xs={24} md={12}>
              <Flex vertical gap={12}>
                <KitStage kit={kit} item={last} play={play} fxStyle={fxStyle} scale={stageScale} />
                <section
                  aria-label="이번에 나온 아이템"
                  style={{
                    minHeight: 76,
                    padding: '10px 12px',
                    borderRadius: token.borderRadius,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillQuaternary,
                  }}
                >
                  {shownRecent.length === 0 ? (
                    <Text type="secondary">{pending === null ? '열기 전' : '여는 중'}</Text>
                  ) : (
                    // 여러 번 열면 줄이 차례로 드러난다. key 로 열 때마다 새로 그려 연출을 처음부터 돌린다.
                    <Flex
                      key={reveal ?? 'still'}
                      vertical
                      gap={4}
                      className={reveal !== null ? 'kt-reveal' : undefined}
                      style={fxStyle}
                    >
                      {[...shownRecent].reverse().map((item, index) => (
                        <div
                          key={`${index}-${item}`}
                          className={isTopGrade(kit, item) ? 'kt-line kt-line--top' : 'kt-line'}
                          style={{ '--i': index } as CSSProperties}
                        >
                          <ItemName kit={kit} item={item} iconSize={24} />
                        </div>
                      ))}
                    </Flex>
                  )}
                </section>
                <Flex gap={8} wrap>
                  {OPEN_COUNTS.map((times, index) => (
                    <Button
                      key={times}
                      type={index === 0 ? 'primary' : 'default'}
                      icon={index === 0 ? <GiftIcon /> : undefined}
                      onClick={() => run(times, null)}
                    >
                      {formatNumber(times)}번 열기
                    </Button>
                  ))}
                </Flex>
                <Flex gap={8} align="center">
                  <Switch
                    checked={fxOn}
                    onChange={(on) => {
                      setFxOn(on);
                      setPlay(null);
                      setReveal(null);
                      writeFxSetting(on);
                    }}
                    aria-label="키트 연출"
                  />
                  <Text style={{ fontSize: 13 }}>키트 연출</Text>
                </Flex>
                <Flex gap={8} wrap>
                  {AUTO_LIMITS.map((limit) => (
                    <Button
                      key={limit}
                      disabled={target === null}
                      onClick={() => run(limit, target)}
                    >
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
            <Col xs={24} md={12}>
              <section
                aria-label="목표 아이템"
                style={{
                  height: '100%',
                  padding: 16,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: token.borderRadius,
                }}
              >
                <Flex vertical gap={10}>
                  <Text strong>목표 아이템</Text>
                  <Select<number>
                    aria-label="목표 아이템"
                    showSearch
                    allowClear
                    placeholder="아이템 고르기"
                    value={target ?? undefined}
                    onChange={(item) => {
                      setTarget(item ?? null);
                      setMessage('');
                    }}
                    onClear={() => setTarget(null)}
                    optionFilterProp="label"
                    options={kit.items.map((item, index) => ({ value: index, label: item.name }))}
                    style={{ width: '100%' }}
                  />
                  {target !== null ? (
                    <Flex gap={8} align="center" wrap>
                      <Text className="tnum" style={{ fontSize: 13 }}>
                        한 번에 <Text strong>{formatChance(chance)}</Text>, 평균{' '}
                        <Text strong>{formatNumber(Math.ceil(1 / chance))}번</Text>에 한 번
                        {kit.price !== null ? (
                          <>
                            ,{' '}
                            <Text strong>
                              {formatNumber(Math.ceil(1 / chance) * kit.price)} 캐시
                            </Text>
                          </>
                        ) : null}
                      </Text>
                      <Popover
                        open={calcOpen}
                        trigger={[]}
                        placement={screens.md ? 'bottomLeft' : 'bottom'}
                        title={
                          <Flex justify="space-between" align="center" gap={8}>
                            <span>목표 아이템 기댓값</span>
                            <Button
                              type="text"
                              size="small"
                              icon={<CloseIcon />}
                              aria-label="목표 아이템 기댓값 닫기"
                              onClick={() => setCalcOpen(false)}
                            />
                          </Flex>
                        }
                        content={
                          <Flex
                            vertical
                            gap={10}
                            style={{ width: 'min(400px, calc(100vw - 88px))' }}
                          >
                            <TrialCountInput value={trials} onChange={setTrials} />
                            <TrialOdds framed={false} trials={trials} chance={chance} verb="열기" />
                            {kit.price !== null ? (
                              <Text className="tnum" style={{ fontSize: 13 }}>
                                <Text strong>{formatNumber(trials * kit.price)} 캐시</Text>
                              </Text>
                            ) : null}
                          </Flex>
                        }
                      >
                        <Button
                          size="small"
                          icon={<CalculateIcon />}
                          aria-expanded={calcOpen}
                          onClick={() => setCalcOpen(!calcOpen)}
                        >
                          목표 아이템 기댓값
                        </Button>
                      </Popover>
                    </Flex>
                  ) : null}
                </Flex>
              </section>
            </Col>
          </Row>

          <Divider style={{ margin: 0 }} />

          <Row gutter={[24, 16]} align="middle">
            <Col xs={12} sm={6} lg={4}>
              <Statistic
                title="연 횟수"
                value={formatNumber(shownOpened)}
                suffix="번"
                styles={NUMERIC}
              />
            </Col>
            {kit.price !== null ? (
              <Col xs={12} sm={6} lg={4}>
                <Statistic
                  title="쓴 캐시"
                  value={formatNumber(shownOpened * kit.price)}
                  styles={NUMERIC}
                />
              </Col>
            ) : null}
            {/* 등급이 있는 키트는 등급마다 몇 번 나왔는지. 제목에 그 등급 확률을 붙여 견주어 보게 한다. */}
            {kit.grades.map((grade, index) => (
              <Col key={grade.name} xs={12} sm={6} lg={3}>
                <Statistic
                  title={
                    grade.chance === null
                      ? grade.name
                      : `${grade.name} ${formatChance(grade.chance)}`
                  }
                  value={formatNumber(gradeCounts[index] ?? 0)}
                  suffix="번"
                  styles={NUMERIC}
                />
              </Col>
            ))}
          </Row>
          <div>
            <Button icon={<ResetIcon />} disabled={opened === 0} onClick={reset}>
              처음부터
            </Button>
          </div>
          <TallyTable kit={kit} counts={shownCounts} />
        </Flex>
      </Card>

      <ItemTable
        kit={kit}
        onTarget={(item) => {
          setTarget(item);
          setMessage('');
        }}
      />
    </Flex>
  );
}

function KitPicker({
  index,
  value,
  onChange,
}: {
  index: KitIndex;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Flex vertical gap={4} style={{ maxWidth: 560 }}>
      <label htmlFor="kit-select">
        <Text strong style={{ fontSize: 13 }}>
          키트
        </Text>
      </label>
      <Select<string>
        id="kit-select"
        showSearch
        value={value}
        onChange={onChange}
        optionFilterProp="label"
        options={index.kits.map((kit) => ({
          value: kit.id,
          label: isOnSale(index, kit) ? `${kitLabel(kit)} 판매 중` : kitLabel(kit),
        }))}
        // 고르는 줄에 키트 상자 그림을 붙인다. 고른 뒤 입력칸 안은 글자만 둔다.
        optionRender={(option) => {
          const kit = index.kits.find((each) => each.id === option.value);
          return (
            <Flex gap={8} align="center">
              {kit?.icon ? <ItemIcon file={kit.icon} size={24} /> : null}
              <span>{option.label}</span>
            </Flex>
          );
        }}
      />
    </Flex>
  );
}

/** 고른 키트의 확률표를 받아 여는 칸을 그린다. 받는 동안은 같은 모양의 뼈대를 둔다. */
function KitLoader({ id, onSale }: { id: string; onSale: boolean }) {
  const query = useKitQuery(id);
  if (query.isPending)
    return (
      <Card aria-busy="true">
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  return (
    <QueryState
      isLoading={false}
      error={query.error}
      isEmpty={!query.data}
      emptyMessage="이 키트의 확률표가 없습니다."
    >
      {query.data ? <KitOpener key={id} kit={query.data} onSale={onSale} /> : null}
    </QueryState>
  );
}

/** 키트 시뮬레이터. 모아 둔 키트 가운데 하나를 골라 열어 본다. 처음에는 지금 파는 것 가운데 가장 최근 것을 고른다. */
export function KitSimulatorView() {
  const query = useKitIndexQuery();
  const index = query.data;
  const [picked, setPicked] = useState<string | null>(null);
  const kit = useMemo(() => {
    if (!index) return null;
    return (
      index.kits.find((each) => each.id === picked) ??
      index.kits.find((each) => isOnSale(index, each)) ??
      index.kits[0] ??
      null
    );
  }, [index, picked]);

  if (query.isPending)
    return (
      <Card aria-busy="true">
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );

  return (
    <QueryState
      isLoading={false}
      error={query.error}
      isEmpty={!kit}
      emptyMessage="아직 모아 둔 키트가 없습니다."
    >
      {index && kit ? (
        <Flex vertical gap={16} style={{ minWidth: 0 }}>
          <Flex vertical gap={6}>
            <KitPicker index={index} value={kit.id} onChange={setPicked} />
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              키트 {formatNumber(index.kits.length)}개, 판매 중 {formatNumber(index.current.length)}
              개{index.updated ? `, ${index.updated} 갱신` : ''}
            </Text>
          </Flex>
          <KitLoader key={kit.id} id={kit.id} onSale={isOnSale(index, kit)} />
        </Flex>
      ) : null}
    </QueryState>
  );
}
