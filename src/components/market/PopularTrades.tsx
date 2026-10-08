import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Flex, Grid, Segmented, Skeleton, Tag, Typography, theme } from 'antd';
import { ArrowDownIcon, SearchIcon, TrendingUpIcon } from '@/components/icons';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { canonicalItemName, usePrefetchItemCards } from '@/features/itemcard/cards';
import { useIconMaps } from '@/features/itemcard/iconMap';
import {
  canLookupMarket,
  useMarketPopularQuery,
  type PopularResponse,
  type PopularRow,
  type PopularWindow,
} from '@/features/market/api';
import { muriasAuctionPath } from '@/features/relics/murias';
import { formatNumber } from '@/lib/format';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import './popularTicker.css';

const { Text } = Typography;

const WINDOWS: { value: PopularWindow; label: string }[] = [
  { value: '1h', label: '1시간' },
  { value: '24h', label: '24시간' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
];

type Basis = 'count' | 'total';

/** 띠와 펼친 목록이 보이는 순위 수. */
const SHOWN_ROWS = 10;

/** 띠가 다음 순위로 넘어가는 간격과, 넘어가는 움직임의 길이(popularTicker.css 와 같다). */
const TICK_MS = 3500;
const SLIDE_MS = 420;

/** 한국 시각의 "10월 2일". 7일, 30일 집계는 날짜로 가르므로 날짜만 적는다. */
const kstDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
});
const kstDateTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * 집계 기간과 기준 시각(한국 시각). 어느 기간을 셌고 그 데이터가 언제까지인지 숨기지 않는다.
 * 7일과 30일은 날짜로 가르므로 날짜만 적고, 모으기 시작한 날이 기간보다 늦으면 그 날부터의 순위라고 밝힌다.
 */
function periodLabel(data: PopularResponse): string {
  const byDay = data.window === '7d' || data.window === '30d';
  const range = byDay
    ? `${kstDate.format(new Date(data.from))} ~ 오늘`
    : `${kstDateTime.format(new Date(data.from))} ~ ${kstDateTime.format(new Date(data.to))}`;
  const updated = data.updated ? `, 마지막 수집 ${kstDateTime.format(new Date(data.updated))}` : '';
  const partial = data.partial && data.since ? `. 기록은 ${data.since}부터 모았습니다` : '';
  return `집계 ${range} (한국 시각)${updated}${partial}`;
}

/** 순위 숫자. 3위까지는 강조색이다. */
function Rank({ rank, width }: { rank: number; width: number }) {
  const { token } = theme.useToken();
  return (
    <Text
      className="tnum"
      strong
      style={{
        width,
        textAlign: 'right',
        flex: `0 0 ${width}px`,
        color: rank <= 3 ? token.colorPrimary : undefined,
      }}
    >
      {rank}
    </Text>
  );
}

/** 그림을 찾을 이름. 인챈트별로 센 스크롤은 사전에 그 이름이 없을 수 있어 원래 이름으로 찾는다. */
function iconName(row: PopularRow): string {
  return canonicalItemName(row.item ?? row.name);
}

/** 띠에 한 번에 한 줄로 보이는 순위 하나. */
function TickerItem({ rank, row, basis }: { rank: number; row: PopularRow; basis: Basis }) {
  const formatGold = useGoldFormatter();
  const name = canonicalItemName(row.name);
  return (
    <>
      <Rank rank={rank} width={20} />
      <ItemIcon category={row.category} name={iconName(row)} size={24} />
      <Text strong ellipsis style={{ minWidth: 0, flex: '0 1 auto' }}>
        {name}
      </Text>
      <Text
        type="secondary"
        className="tnum"
        style={{ fontSize: 12, whiteSpace: 'nowrap', flex: '0 0 auto' }}
      >
        {basis === 'count' ? `${formatNumber(row.n)}회` : `총 ${formatGold(row.total)}`}
      </Text>
    </>
  );
}

/**
 * 한 줄 띠 안의 순위 바꾸기. 다음 순위가 아래에서 올라오며 앞 순위를 위로 밀어낸다.
 * 마우스를 올리거나 초점이 있는 동안, 탭이 가려진 동안은 멈춘다. 움직임 줄이기 설정이면 1위만 보인다.
 */
function Ticker({
  rows,
  basis,
  paused,
  tickMs,
}: {
  rows: PopularRow[];
  basis: Basis;
  paused: boolean;
  tickMs: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  // 방금 떠나는 순위. 밀려 올라가는 동안만 남겨 둔다.
  const [leaving, setLeaving] = useState<number | null>(null);
  // 탭이 가려져 넘기지 못했을 때 다음 차례를 다시 걸기 위한 셈.
  const [waiting, setWaiting] = useState(0);

  const count = rows.length;
  useEffect(() => {
    if (reduced || paused || count < 2) return;
    // 한 칸 넘길 때마다 새로 건다. 가려진 탭에서는 넘기지 않고 다음 차례를 기다린다.
    const timer = setTimeout(() => {
      if (!document.hidden) {
        setLeaving(index);
        setIndex((index + 1) % count);
      } else {
        setWaiting((times) => times + 1);
      }
    }, tickMs);
    return () => clearTimeout(timer);
  }, [reduced, paused, count, tickMs, index, waiting]);

  useEffect(() => {
    if (leaving === null) return;
    const timer = setTimeout(() => setLeaving(null), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [leaving, index]);

  const at = index < count ? index : 0;
  return (
    <div className="pt-ticker">
      {leaving !== null && leaving < count ? (
        <div key={`out-${leaving}-${index}`} className="pt-layer pt-out" aria-hidden>
          <TickerItem rank={leaving + 1} row={rows[leaving]} basis={basis} />
        </div>
      ) : null}
      <div key={`in-${at}`} className={`pt-layer${leaving !== null ? ' pt-in' : ''}`}>
        <TickerItem rank={at + 1} row={rows[at]} basis={basis} />
      </div>
    </div>
  );
}

function PopularItem({
  rank,
  row,
  basis,
  onSearch,
}: {
  rank: number;
  row: PopularRow;
  basis: Basis;
  onSearch: (name: string) => void;
}) {
  const formatGold = useGoldFormatter();
  const navigate = useNavigate();
  const name = canonicalItemName(row.name);
  // 유물 옵션 줄은 아이템 상세가 없다. 이름과 검색 모두 경매장의 그 옵션 매물로 간다.
  const relicPath = row.relic ? muriasAuctionPath(row.relic) : null;
  return (
    <Flex gap={10} align="center" style={{ minWidth: 0 }}>
      <Rank rank={rank} width={22} />
      <ItemIcon category={row.category} name={iconName(row)} size={40} />
      <Flex vertical gap={2} style={{ minWidth: 0, flex: '1 1 auto' }}>
        <Flex gap={6} align="center" wrap>
          <Text strong style={{ minWidth: 0 }}>
            {relicPath ? (
              <Link to={relicPath}>{name}</Link>
            ) : (
              <ItemInfoLink name={name} category={row.category} />
            )}
          </Text>
          <Tag style={{ margin: 0 }}>{row.category}</Tag>
        </Flex>
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          {basis === 'count'
            ? `${formatNumber(row.n)}회${row.avg !== null ? `, 개당 평균 ${formatGold(row.avg)}` : ''}`
            : `총 ${formatGold(row.total)}, ${formatNumber(row.n)}회`}
        </Text>
      </Flex>
      <Button
        type="text"
        size="small"
        icon={<SearchIcon />}
        aria-label={`${name} 경매장 검색`}
        onClick={() => (relicPath ? navigate(relicPath) : onSearch(name))}
      />
    </Flex>
  );
}

/**
 * 인기 거래 아이템. 평소에는 검색 위에 한 줄 띠로만 있고, 1위부터 10위까지가 한 칸씩 밀려 올라가며 보인다.
 * 띠를 누르면 10위까지 목록이 펼쳐진다. 경매장 화면을 거의 가리지 않으려는 모양이라, 펼침 상태는 기억하지 않고
 * 들어올 때마다 띠로 시작한다.
 *
 * 워커가 쌓아 둔 거래 기록을 읽으므로 워커가 없거나, 받지 못했거나, 거래가 없으면 아무것도 그리지 않는다.
 */
export function PopularTrades({
  onSearch,
  tickMs = TICK_MS,
}: {
  onSearch: (name: string) => void;
  /** 띠가 다음 순위로 넘어가는 간격(ms). */
  tickMs?: number;
}) {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [window, setWindow] = useState<PopularWindow>('24h');
  const [basis, setBasis] = useState<Basis>('count');
  const wide = Grid.useBreakpoint().md ?? false;
  const query = useMarketPopularQuery(window, true);

  const rows = query.data
    ? (basis === 'count' ? query.data.byCount : query.data.byTotal).slice(0, SHOWN_ROWS)
    : [];
  const iconMaps = useIconMaps(rows.map((row) => row.category));
  // CDN의 지난 목록에 이름이나 그림이 빠져 있어도 카드 저장소에서 보완한다.
  // 띠에 아직 나오지 않은 순위도 함께 묶어 조회한다.
  usePrefetchItemCards(
    rows
      .map((row) => ({ category: row.category, name: iconName(row) }))
      .filter(({ category, name }) => iconMaps.needsLookup(category, name)),
  );

  if (!canLookupMarket()) return null;
  // 띠는 받지 못했거나 거래가 없으면 자리를 차지하지 않는다. 있을 때 덤으로 보이는 것이다.
  // 펼친 뒤에는 기간을 바꾸다 빈 기간을 만날 수 있으니 닫지 않고 까닭을 보인다.
  if (!open && !query.isPending && (query.error || rows.length === 0)) return null;

  const frame = {
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: token.borderRadiusLG,
    background: token.colorBgContainer,
  };

  /**
   * 띠와 펼친 머리줄 어디를 눌러도 펼치고 접는다. 화살표는 상태를 알리는 그림일 뿐이고 단추가 아니다.
   * 접힌 띠에는 누를 아이템이 없어서, 오른쪽 끝 작은 화살표까지 마우스를 옮길 이유가 없다.
   * 키보드로도 Enter 와 Space 로 연다.
   */
  const toggleProps = {
    className: 'no-select',
    role: 'button',
    tabIndex: 0,
    'aria-expanded': open,
    'aria-label': open ? '인기 거래 아이템 접기' : '인기 거래 아이템 펼치기',
    onClick: () => setOpen((prev) => !prev),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setOpen((prev) => !prev);
    },
  } as const;
  const arrow = (
    <ArrowDownIcon
      style={{
        flex: '0 0 auto',
        transform: open ? 'rotate(180deg)' : undefined,
        color: token.colorTextSecondary,
      }}
    />
  );

  if (!open) {
    return (
      <div
        {...toggleProps}
        style={{
          ...frame,
          padding: '6px 14px',
          cursor: 'pointer',
          background: hovering ? token.colorFillQuaternary : token.colorBgContainer,
        }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
      >
        <Flex align="center" gap={12}>
          <Flex gap={6} align="center" style={{ flex: '0 0 auto' }}>
            <TrendingUpIcon />
            <Text strong style={{ whiteSpace: 'nowrap' }}>
              인기 거래
            </Text>
          </Flex>
          {query.isPending ? (
            <Skeleton.Input
              active
              size="small"
              style={{ height: 28, minWidth: 0, flex: '1 1 auto' }}
              block
            />
          ) : (
            <Ticker rows={rows} basis={basis} paused={hovering} tickMs={tickMs} />
          )}
          {arrow}
        </Flex>
      </div>
    );
  }

  return (
    <div style={{ ...frame, padding: '10px 12px' }}>
      <Flex vertical gap={12}>
        <Flex
          {...toggleProps}
          justify="space-between"
          align="center"
          gap={8}
          style={{ cursor: 'pointer' }}
        >
          <Flex gap={8} align="center">
            <TrendingUpIcon />
            <Text strong style={{ fontSize: 16 }}>
              인기 거래 아이템
            </Text>
          </Flex>
          {arrow}
        </Flex>

        <Flex gap={12} wrap align="center">
          <Segmented options={WINDOWS} value={window} onChange={setWindow} />
          <Segmented
            options={[
              { value: 'count', label: '거래 횟수' },
              { value: 'total', label: '총 거래 금액' },
            ]}
            value={basis}
            onChange={setBasis}
          />
        </Flex>

        {query.isPending ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : query.error ? (
          <Alert type="error" showIcon title={query.error.message} />
        ) : rows.length === 0 ? (
          <EmptyState size="small" description="이 기간에 거래된 아이템이 없습니다." />
        ) : (
          <div
            style={{
              display: 'grid',
              // 넓은 화면은 두 칸이고 위에서 아래로 차례로 채운다(1~5위 왼쪽, 6~10위 오른쪽). 좁으면 한 칸이다.
              gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
              ...(wide
                ? {
                    gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, auto)`,
                    gridAutoFlow: 'column',
                  }
                : {}),
              gap: '10px 40px',
            }}
          >
            {rows.map((row, index) => (
              <PopularItem
                key={row.name}
                rank={index + 1}
                row={row}
                basis={basis}
                onSearch={onSearch}
              />
            ))}
          </div>
        )}

        {query.data ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {periodLabel(query.data)}
          </Text>
        ) : null}
      </Flex>
    </div>
  );
}
