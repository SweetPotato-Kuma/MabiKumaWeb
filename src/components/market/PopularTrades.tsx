import { useState } from 'react';
import { Alert, Button, Card, Flex, Grid, Segmented, Skeleton, Tag, Typography, theme } from 'antd';
import { ArrowDownIcon, SearchIcon, TrendingUpIcon } from '@/components/icons';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { canonicalItemName } from '@/features/itemcard/cards';
import { usePrefetchIconMaps } from '@/features/itemcard/iconMap';
import {
  canLookupMarket,
  useMarketPopularQuery,
  type PopularResponse,
  type PopularRow,
  type PopularWindow,
} from '@/features/market/api';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

const WINDOWS: { value: PopularWindow; label: string }[] = [
  { value: '1h', label: '1시간' },
  { value: '24h', label: '24시간' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
];

type Basis = 'count' | 'total';

/** 처음 보이는 줄 수와, 펼치면 보이는 줄 수(워커가 주는 만큼). */
const COLLAPSED_ROWS = 10;

const OPEN_KEY = 'mabikuma:popularTradesOpen';

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // 막혀 있으면 이번 화면에서만 기억한다.
  }
}

const kstDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
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
  const { token } = theme.useToken();
  const formatGold = useGoldFormatter();
  const name = canonicalItemName(row.name);
  return (
    <Flex gap={10} align="center" style={{ minWidth: 0 }}>
      <Text
        className="tnum"
        strong
        style={{ width: 22, textAlign: 'right', flex: '0 0 22px', color: rank <= 3 ? token.colorPrimary : undefined }}
      >
        {rank}
      </Text>
      <ItemIcon category={row.category} name={name} size={40} />
      <Flex vertical gap={2} style={{ minWidth: 0, flex: '1 1 auto' }}>
        <Flex gap={6} align="center" wrap>
          <Text strong style={{ minWidth: 0 }}>
            <ItemInfoLink name={name} category={row.category} />
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
        onClick={() => onSearch(name)}
      />
    </Flex>
  );
}

/**
 * 인기 거래 아이템. 최근 거래가 가장 많은(또는 거래 금액이 가장 큰) 아이템 순위를 펼쳐서 본다.
 * 접어 둔 채로는 서버에 묻지 않는다. 줄에서 아이템 상세로 가거나 경매장에서 바로 찾을 수 있다.
 *
 * 워커가 쌓아 둔 거래 기록을 읽으므로 워커가 없으면 보이지 않는다.
 */
export function PopularTrades({ onSearch }: { onSearch: (name: string) => void }) {
  const [open, setOpen] = useState(readOpen);
  const [window, setWindow] = useState<PopularWindow>('24h');
  const [basis, setBasis] = useState<Basis>('count');
  const [showAll, setShowAll] = useState(false);
  const query = useMarketPopularQuery(window, open);
  const wide = Grid.useBreakpoint().md ?? false;

  const rows = query.data ? (basis === 'count' ? query.data.byCount : query.data.byTotal) : [];
  const shown = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);
  usePrefetchIconMaps([...new Set(shown.map((row) => row.category))]);

  if (!canLookupMarket()) return null;

  const toggle = () => {
    writeOpen(!open);
    setOpen(!open);
  };

  return (
    <Card variant="outlined" size="small">
      <Flex vertical gap={12}>
        <Flex justify="space-between" align="center" gap={8}>
          <Flex gap={8} align="center">
            <TrendingUpIcon />
            <Text strong style={{ fontSize: 16 }}>
              인기 거래 아이템
            </Text>
          </Flex>
          <Button
            type="text"
            size="small"
            aria-expanded={open}
            aria-label={open ? '인기 거래 아이템 접기' : '인기 거래 아이템 펼치기'}
            icon={<ArrowDownIcon style={{ transform: open ? 'rotate(180deg)' : undefined }} />}
            onClick={toggle}
          />
        </Flex>

        {open ? (
          <>
            <Flex gap={12} wrap align="center">
              <Segmented
                options={WINDOWS}
                value={window}
                onChange={(next) => {
                  setWindow(next);
                  setShowAll(false);
                }}
              />
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
              <Alert type="error" showIcon message={query.error.message} />
            ) : rows.length === 0 ? (
              <EmptyState size="small" description="이 기간에 거래된 아이템이 없습니다." />
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    // 넓은 화면은 두 칸이고 위에서 아래로 차례로 채운다(1~5위 왼쪽, 6~10위 오른쪽). 좁으면 한 칸이다.
                    gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
                    ...(wide ? { gridTemplateRows: `repeat(${Math.ceil(shown.length / 2)}, auto)`, gridAutoFlow: 'column' } : {}),
                    gap: '10px 40px',
                  }}
                >
                  {shown.map((row, index) => (
                    <PopularItem key={row.name} rank={index + 1} row={row} basis={basis} onSearch={onSearch} />
                  ))}
                </div>
                {rows.length > COLLAPSED_ROWS ? (
                  <Button size="small" onClick={() => setShowAll((prev) => !prev)} style={{ alignSelf: 'center' }}>
                    {showAll ? '접기' : `${formatNumber(rows.length)}위까지 보기`}
                  </Button>
                ) : null}
                {query.data ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {periodLabel(query.data)}
                  </Text>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </Flex>
    </Card>
  );
}
