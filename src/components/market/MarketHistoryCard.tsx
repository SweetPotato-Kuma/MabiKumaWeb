import { useMemo, useState } from 'react';
import { Alert, Card, Flex, Segmented, Skeleton, Typography } from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { PriceHistoryChart, type ChartSlot, type ChartTick } from '@/components/market/PriceHistoryChart';
import { RecentTradeStats } from '@/components/market/RecentTradeStats';
import { canLookupMarket, useMarketItemQuery, type MarketItemResponse } from '@/features/market/api';
import {
  buildHourSlots,
  buildSlots,
  isThursday,
  kstDate,
  shortDateLabel,
} from '@/features/market/series';

const { Text } = Typography;

/** 날짜별 그래프의 날 수. 워커의 기본값과 같다. */
const HISTORY_DAYS = 30;
/** 시간별 그래프의 칸 수. 워커의 HOURLY_HOURS 와 같다. */
const HOURLY_HOURS = 7 * 24;

type View = 'hourly' | 'daily';

const VIEW_OPTIONS = [
  { value: 'hourly', label: '시간별 7일' },
  { value: 'daily', label: `날짜별 ${HISTORY_DAYS}일` },
];

/**
 * 시간별 칸과 가로축 글자. 날이 바뀌는 칸(0시)마다 날짜와 요일을 적는다.
 * 목요일 음영이 어느 날인지 글자로도 읽혀야 한다.
 */
function hourlyChart(data: MarketItemResponse, now: number) {
  const slots = buildHourSlots(data.hourly ?? [], HOURLY_HOURS, now);
  const chartSlots: ChartSlot[] = slots.map((slot) => ({
    key: `${slot.date} ${slot.hour}`,
    date: slot.date,
    title: `${shortDateLabel(slot.date)} ${slot.hour}시`,
    summary: slot.summary,
  }));
  const ticks: ChartTick[] = slots.flatMap((slot, index) =>
    slot.hour === 0 ? [{ index, label: shortDateLabel(slot.date), at: 'start' as const }] : [],
  );
  return { slots: chartSlots, ticks, hasData: slots.some((slot) => slot.summary) };
}

/** 날짜별 칸과 가로축 글자. 칸이 30개라 날짜는 목요일에만 적는다. */
function dailyChart(data: MarketItemResponse, now: number) {
  const slots = buildSlots(data.daily, HISTORY_DAYS, now);
  const chartSlots: ChartSlot[] = slots.map((slot) => ({
    key: slot.date,
    date: slot.date,
    title: shortDateLabel(slot.date),
    summary: slot.summary,
  }));
  const ticks: ChartTick[] = slots.flatMap((slot, index) =>
    isThursday(slot.date) ? [{ index, label: shortDateLabel(slot.date), at: 'center' as const }] : [],
  );
  return { slots: chartSlots, ticks, hasData: slots.some((slot) => slot.summary) };
}

/**
 * 아이템 정보의 시세 기록. 최근 1일 요약과 가격, 거래량 그래프.
 *
 * 그래프는 시간별(최근 7일)과 날짜별(최근 30일)을 고른다. 시간별이 먼저다. 어느 시간에 얼마에
 * 몇 개가 팔렸는지가 사고팔 때를 정하는 데 더 쓸모 있고, 한 주를 통째로 보여 목요일과 다른
 * 요일을 견줄 수 있다.
 *
 * 경매장 거래 내역 API 는 1시간치만 주므로, 워커가 10분마다 받아 쌓아 둔 기록을 읽는다. 기록을 모으기
 * 시작한 날보다 앞은 비어 있는 것이 정상이라 그 날짜를 같이 적는다.
 */
export function MarketHistoryCard({ name }: { name: string }) {
  const query = useMarketItemQuery(name);
  const [view, setView] = useState<View>('hourly');
  const data = query.data;
  const now = query.dataUpdatedAt || Date.now();

  const chart = useMemo(
    () => (data ? (view === 'hourly' ? hourlyChart(data, now) : dailyChart(data, now)) : null),
    [data, view, now],
  );

  if (!canLookupMarket()) return null;

  const firstDate = kstDate(now, view === 'hourly' ? 6 : HISTORY_DAYS - 1);
  const partial = data?.since && data.since > firstDate;

  return (
    <Card size="small" title="시세 기록">
      {query.isPending ? (
        <Skeleton active title={false} paragraph={{ rows: 5 }} />
      ) : query.error ? (
        <Alert type="error" showIcon message={query.error.message} />
      ) : data && chart ? (
        <Flex vertical gap={16}>
          <Flex vertical gap={8}>
            <Text strong>최근 1일</Text>
            {data.recent ? (
              <RecentTradeStats summary={data.recent} label="최근 1일 개당 가격" />
            ) : (
              <Text type="secondary">최근 1일 동안 거래된 기록이 없습니다.</Text>
            )}
          </Flex>

          <Flex vertical gap={10}>
            <Flex justify="space-between" align="center" gap={8} wrap>
              <Text strong>가격과 거래량</Text>
              <Segmented
                size="small"
                value={view}
                options={VIEW_OPTIONS}
                onChange={(next) => setView(next as View)}
              />
            </Flex>
            {chart.hasData ? (
              <PriceHistoryChart
                slots={chart.slots}
                ticks={chart.ticks}
                ariaLabel={
                  view === 'hourly'
                    ? '최근 7일 시간별 중위 가격과 거래 수량 그래프'
                    : `최근 ${HISTORY_DAYS}일 날짜별 중위 가격과 거래 수량 그래프`
                }
              />
            ) : (
              <EmptyState
                size="small"
                description={
                  view === 'hourly'
                    ? '최근 7일 동안 이 아이템이 거래된 기록이 없습니다.'
                    : '아직 이 아이템이 거래된 기록이 없습니다.'
                }
              />
            )}
          </Flex>

          {partial ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              거래 기록은 {data.since}부터 모았습니다. 그 앞은 비어 있습니다.
            </Text>
          ) : null}
        </Flex>
      ) : null}
    </Card>
  );
}
