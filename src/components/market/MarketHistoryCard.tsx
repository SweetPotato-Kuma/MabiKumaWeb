import { Alert, Card, Flex, Skeleton, Typography } from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { PriceHistoryChart } from '@/components/market/PriceHistoryChart';
import { RecentTradeStats } from '@/components/market/RecentTradeStats';
import { canLookupMarket, useMarketItemQuery } from '@/features/market/api';
import { kstDate } from '@/features/market/series';

const { Text } = Typography;

/** 그래프로 보여 줄 날 수. 워커의 기본값과 같다. */
const HISTORY_DAYS = 30;

/**
 * 아이템 정보의 시세 기록. 최근 1일 요약과 한 달 그래프.
 *
 * 경매장 거래 내역 API 는 1시간치만 주므로, 워커가 10분마다 받아 쌓아 둔 기록을 읽는다. 기록을 모으기
 * 시작한 날보다 앞은 비어 있는 것이 정상이라 그 날짜를 같이 적는다.
 */
export function MarketHistoryCard({ name }: { name: string }) {
  const query = useMarketItemQuery(name);
  if (!canLookupMarket()) return null;

  const data = query.data;
  const firstDate = kstDate(Date.now(), HISTORY_DAYS - 1);
  const partial = data?.since && data.since > firstDate;

  return (
    <Card size="small" title="시세 기록">
      {query.isPending ? (
        <Skeleton active title={false} paragraph={{ rows: 5 }} />
      ) : query.error ? (
        <Alert type="error" showIcon message={query.error.message} />
      ) : data ? (
        <Flex vertical gap={16}>
          <Flex vertical gap={8}>
            <Text strong>최근 1일</Text>
            {data.recent ? (
              <RecentTradeStats summary={data.recent} label="최근 1일 개당 가격" />
            ) : (
              <Text type="secondary">최근 1일 동안 거래된 기록이 없습니다.</Text>
            )}
          </Flex>

          <Flex vertical gap={8}>
            <Flex justify="space-between" align="baseline" gap={8} wrap>
              <Text strong>최근 {HISTORY_DAYS}일</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                실선 중위, 점선 평균
              </Text>
            </Flex>
            {data.daily.length > 0 ? (
              <PriceHistoryChart daily={data.daily} days={HISTORY_DAYS} />
            ) : (
              <EmptyState size="small" description="아직 이 아이템이 거래된 기록이 없습니다." />
            )}
          </Flex>

          {partial ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              거래 기록은 {data.since}부터 모았습니다. 그 앞 날짜는 비어 있습니다.
            </Text>
          ) : null}
        </Flex>
      ) : null}
    </Card>
  );
}
