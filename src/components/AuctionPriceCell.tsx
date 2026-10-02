import { Typography } from 'antd';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/**
 * 표의 가격 칸. 늘 개당 가격 하나다.
 *
 * 한 칸에 여러 개를 묶어 올린 매물도 개당 가격으로 견주어야 비교가 된다. 묶음 전체 값을 함께 적으면 가격 칸이
 * 두 줄이 되어 줄 높이만 늘어나고, 개수는 표의 수량 칸에 따로 있다. 판매 대금처럼 전체 값이 필요한 곳은
 * 매물 상세 창이 보여 준다.
 */
export function AuctionPriceCell({ pricePerUnit }: { pricePerUnit: number }) {
  const formatGold = useGoldFormatter();
  return (
    <Text strong className="tnum">
      {formatGold(Number.isFinite(pricePerUnit) ? pricePerUnit : 0)}
    </Text>
  );
}
