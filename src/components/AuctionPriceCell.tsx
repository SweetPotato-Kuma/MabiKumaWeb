import { Flex, Typography } from 'antd';
import { bundlePrice } from '@/features/auction/price';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/**
 * 표의 가격 칸.
 *
 * 한 칸에 하나만 올라온 매물은 개당과 전체가 같아서 가격 하나면 끝난다. 장비는 대부분
 * 이쪽이다. 여러 개가 묶인 매물에서만 지갑에서 나가는 전체 값을 크게, 그 아래에 개당 값을 작게 적는다.
 *
 * 개수는 여기 적지 않는다. 표에 수량 칸이 따로 있어서 같은 숫자를 두 번 읽게 된다.
 *
 * 전체 값은 API 가 주는 것이 아니라 개당 가격에 개수를 곱한 값이다.
 */
export function AuctionPriceCell({ pricePerUnit, count }: { pricePerUnit: number; count: number }) {
  const formatGold = useGoldFormatter();
  const price = bundlePrice(pricePerUnit, count);

  if (!price.isBundle) {
    return (
      <Text strong className="tnum">
        {formatGold(price.pricePerUnit)}
      </Text>
    );
  }

  return (
    <Flex vertical gap={2} align="flex-end">
      <Text strong className="tnum">
        전체 {formatGold(price.total)}
      </Text>
      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
        개당 {formatGold(price.pricePerUnit)}
      </Text>
    </Flex>
  );
}
