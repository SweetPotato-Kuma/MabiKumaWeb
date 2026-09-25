import { Col, Row, Statistic } from 'antd';
import type { PriceSummary } from '@/features/market/api';
import { formatGold, formatNumber } from '@/lib/format';

/**
 * 기간 하나의 개당 가격 요약을 한 줄로. 경매장 검색과 아이템 정보가 같이 쓴다.
 *
 * 거래 건수를 맨 앞에 둔다. 표본이 적으면 중위도 평균도 믿을 수 없으므로 그것부터 보여야 한다.
 */
export function RecentTradeStats({ summary, label }: { summary: PriceSummary; label: string }) {
  const cells = [
    ['거래', `${formatNumber(summary.n)}건`],
    ['최저', formatGold(summary.lo)],
    ['중위', formatGold(summary.mid)],
    ['평균', formatGold(summary.avg)],
    ['최고', formatGold(summary.hi)],
  ] as const;

  return (
    <Row gutter={[16, 12]} aria-label={label}>
      {cells.map(([title, value]) => (
        // 값은 한 줄로 둔다. 칸이 좁으면 숫자를 쪼개지 않고 칸째 다음 줄로 넘긴다.
        <Col key={title} flex="1 1 auto">
          <Statistic
            title={title}
            value={value}
            styles={{ content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}
          />
        </Col>
      ))}
    </Row>
  );
}
