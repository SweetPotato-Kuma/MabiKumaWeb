import { Flex, Skeleton, Typography } from 'antd';
import type { CostTotal, ItemCost } from '@/features/materialMemo/cost';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

const STATUS_TEXT = {
  error: '조회 실패',
  untradable: '거래 불가',
  empty: '매물 없음',
} as const;

/** 표의 금액 칸. 받는 중이면 자리만, 모르면 이유를 적는다. */
export function CostCell({ cost }: { cost: ItemCost }) {
  const formatGold = useGoldFormatter();
  if (cost.status === 'loading')
    return <Skeleton.Input active size="small" style={{ width: 80, minWidth: 80 }} />;
  if (cost.status !== 'ok')
    return (
      <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        {STATUS_TEXT[cost.status]}
      </Text>
    );
  return (
    <Flex vertical align="flex-end">
      <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
        {formatGold(cost.gold)}
      </Text>
      {cost.shortfall ? (
        <Text type="warning" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          매물 부족
        </Text>
      ) : null}
    </Flex>
  );
}

/** 필요 금액 합계. 값을 다 알지 못하면 무엇이 빠졌는지 곁에 적는다. */
export function CostSummary({ label, total }: { label: string; total: CostTotal }) {
  const formatGold = useGoldFormatter();
  return (
    <Flex gap={12} align="baseline" wrap>
      <Text type="secondary">{label}</Text>
      <Text strong className="tnum" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
        {formatGold(total.gold)}
      </Text>
      {total.pending > 0 ? (
        <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
          시세 {formatNumber(total.pending)}종을 받는 중입니다
        </Text>
      ) : null}
      {total.pending === 0 && total.unknown > 0 ? (
        <Text type="warning" className="tnum" style={{ fontSize: 13 }}>
          값을 모르는 재료 {formatNumber(total.unknown)}종 빠짐
        </Text>
      ) : null}
      {total.pending === 0 && total.shortfall > 0 ? (
        <Text type="warning" className="tnum" style={{ fontSize: 13 }}>
          매물 부족 {formatNumber(total.shortfall)}종
        </Text>
      ) : null}
      <Text type="secondary" style={{ fontSize: 13 }}>
        평균 10분 지연된 시세
      </Text>
    </Flex>
  );
}
