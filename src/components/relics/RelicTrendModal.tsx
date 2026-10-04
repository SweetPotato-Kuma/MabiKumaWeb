import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Flex, Grid, Modal, Segmented, Select, Skeleton, Table, Typography } from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { SearchIcon, WarningIcon } from '@/components/icons';
import { PriceHistoryChart, type ChartSlot, type ChartTick } from '@/components/market/PriceHistoryChart';
import { canLookupMarket, useRelicSeriesQuery, type DailySummary } from '@/features/market/api';
import { buildSlots, isThursday, kstDate, shortDateLabel } from '@/features/market/series';
import {
  formatRelicValue,
  muriasAuctionPath,
  RELIC_LEVELS,
  relicValueAt,
} from '@/features/relics/murias';
import { type LastTrade, type MuriasRow } from '@/features/relics/prices';
import { trendByLevel, type RelicTrade } from '@/features/relics/trend';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 그래프 기간. 거래 기록은 모으기 시작한 날부터만 있어 처음에는 7일이 더 꽉 찬다. */
const WINDOWS = [
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
];

/** 최근 거래 목록에 보일 줄 수. */
const RECENT_ROWS = 10;

/** 날짜별 칸과 가로축 글자. 7일이면 날마다, 30일이면 목요일에만 날짜를 적는다. */
function chartOf(daily: readonly DailySummary[], days: number, now: number) {
  const slots = buildSlots(daily, days, now);
  const chartSlots: ChartSlot[] = slots.map((slot) => ({
    key: slot.date,
    date: slot.date,
    title: shortDateLabel(slot.date),
    summary: slot.summary,
  }));
  const ticks: ChartTick[] = slots.flatMap((slot, index) =>
    days <= 7
      ? // 일곱 칸이면 칸 폭이 좁아 요일까지 적으면 이웃 날짜와 붙는다. 목요일 음영이 요일을 알려 준다.
        [{ index, label: slot.date.slice(5), at: 'center' as const }]
      : isThursday(slot.date)
        ? [{ index, label: shortDateLabel(slot.date), at: 'center' as const }]
        : [],
  );
  return { slots: chartSlots, ticks, hasData: slots.some((slot) => slot.summary) };
}

/**
 * 유물 옵션 하나의 레벨별 거래가 추이를 보는 창. 레벨 칸을 누르면 그 레벨이 먼저 열리고, 위에서 다른 레벨로 옮긴다.
 *
 * 추이는 판매 중 최저가가 아니라 실제로 팔린 거래가다. 판매 중 값은 10분마다 덮어써 시간에 따른 기록이 없지만,
 * 거래는 워커가 쌓아 두었다. 옵션마다 따로 보여 주는 것은 모든 옵션과 레벨을 한 통계에 섞으면 뜻이 없어서다.
 * 아래 단추로 그 레벨의 판매 중 매물을 경매장에서 본다.
 */
export function RelicTrendModal({
  row,
  level: initialLevel,
  lastTrades,
  onClose,
}: {
  row: MuriasRow;
  level: number;
  /** 이 옵션의 레벨마다 최종 거래(1레벨부터). 거래 기록이 짧아 최근 거래가 없을 때 대신 적는다. */
  lastTrades: (LastTrade | null)[] | undefined;
  onClose: () => void;
}) {
  const formatGold = useGoldFormatter();
  const navigate = useNavigate();
  const narrow = !(Grid.useBreakpoint().sm ?? true);
  const [level, setLevel] = useState(initialLevel);
  const [days, setDays] = useState(7);
  const query = useRelicSeriesQuery(row.name);
  const now = query.dataUpdatedAt || Date.now();

  const levels = useMemo(() => trendByLevel(query.data, row), [query.data, row]);
  const trend = levels[level - 1];
  // 최근 거래 표의 줄. 같은 시각에 같은 값이 두 번 거래될 수 있어 순번을 붙여 키를 만든다.
  const recentRows = useMemo(() => trend.recent.slice(0, RECENT_ROWS), [trend.recent]);
  const recentKeys = useMemo(
    () => new Map(recentRows.map((trade, index) => [trade, `${trade.at}-${index}`])),
    [recentRows],
  );
  const chart = useMemo(() => chartOf(trend.daily, days, now), [trend.daily, days, now]);

  const cell = row.levels[level - 1];
  const last = lastTrades?.[level - 1] ?? null;
  const latest: RelicTrade | LastTrade | null = trend.recent[0] ?? last;
  const firstDate = kstDate(now, days - 1);
  const partial = query.data?.since && query.data.since > firstDate;
  const value = formatRelicValue(row, relicValueAt(row, level));

  return (
    <Modal
      open
      onCancel={onClose}
      destroyOnHidden
      width="min(720px, calc(100vw - 32px))"
      title={
        <Flex vertical gap={0}>
          <span>{row.name}</span>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
            {level}레벨 {value}
            {row.verb ? ` ${row.verb}` : ''}
          </Text>
        </Flex>
      }
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onClose}>닫기</Button>
          <Button
            type="primary"
            icon={<SearchIcon />}
            onClick={() => {
              onClose();
              navigate(muriasAuctionPath(row.name, level));
            }}
          >
            경매장 매물 보기
          </Button>
        </Flex>
      }
    >
      <Flex vertical gap={16}>
        <Flex gap={12} wrap align="center" justify="space-between">
          {narrow ? (
            <Select
              value={level}
              onChange={setLevel}
              options={RELIC_LEVELS.map((each) => ({ value: each, label: `${each}레벨` }))}
              aria-label="레벨"
              style={{ minWidth: 110 }}
            />
          ) : (
            <Segmented
              value={level}
              onChange={setLevel}
              options={RELIC_LEVELS.map((each) => ({ value: each, label: `${each}` }))}
              aria-label="레벨"
            />
          )}
          <Segmented value={days} onChange={setDays} options={WINDOWS} aria-label="기간" />
        </Flex>

        <Flex gap={24} wrap>
          <Flex vertical gap={0}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              지금 최저가
            </Text>
            {cell ? (
              <>
                <Text strong className="tnum">
                  {formatGold(cell.lowest)}
                </Text>
                <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                  매물 {formatNumber(cell.count)}건
                </Text>
              </>
            ) : (
              <Text type="secondary">매물 없음</Text>
            )}
          </Flex>
          <Flex vertical gap={0}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              최근 거래가
            </Text>
            {latest ? (
              <>
                <Text strong className="tnum">
                  {formatGold(latest.price)}
                </Text>
                <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                  {formatDateTime('at' in latest ? latest.at : '')}
                </Text>
              </>
            ) : (
              <Text type="secondary">기록 없음</Text>
            )}
          </Flex>
        </Flex>

        {cell?.risky && cell.actual !== undefined ? (
          <Alert
            type="warning"
            showIcon
            icon={<WarningIcon />}
            title="사기 위험"
            description={`이 레벨의 실제 최저가는 ${formatGold(cell.actual)} 입니다. 더 높은 레벨의 최저가보다 비싸서 표에는 ${formatGold(cell.lowest)} 로 낮춰 적었습니다.`}
          />
        ) : null}

        {!canLookupMarket() ? null : query.isPending ? (
          <Skeleton active title={false} paragraph={{ rows: 6 }} />
        ) : query.error ? (
          <Alert type="error" showIcon title={query.error.message} />
        ) : (
          <Flex vertical gap={16}>
            {chart.hasData ? (
              <PriceHistoryChart
                slots={chart.slots}
                ticks={chart.ticks}
                ariaLabel={`${row.name} ${level}레벨 최근 ${days}일 거래가 그래프`}
              />
            ) : (
              <EmptyState size="small" description={`최근 ${days}일 동안 ${level}레벨이 거래된 기록이 없습니다.`} />
            )}
            {trend.recent.length > 0 ? (
              <Table<RelicTrade>
                size="small"
                pagination={false}
                rowKey={(trade) => recentKeys.get(trade) ?? trade.at}
                dataSource={recentRows}
                columns={[
                  { title: '거래 시각', dataIndex: 'at', render: (at: string) => <span className="tnum">{formatDateTime(at)}</span> },
                  {
                    title: '개당 가격',
                    dataIndex: 'price',
                    align: 'right',
                    render: (price: number) => <span className="tnum">{formatGold(price)}</span>,
                  },
                  {
                    title: '수량',
                    dataIndex: 'qty',
                    align: 'right',
                    width: 72,
                    render: (qty: number) => <span className="tnum">{formatNumber(qty)}</span>,
                  },
                ]}
              />
            ) : null}
            {partial ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                거래 기록은 {query.data?.since}부터 모았습니다. 그 앞은 비어 있습니다.
              </Text>
            ) : null}
          </Flex>
        )}
      </Flex>
    </Modal>
  );
}
