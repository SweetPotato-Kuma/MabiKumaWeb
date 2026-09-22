import { Flex, Typography } from 'antd';
import { bundlePrice } from '@/features/auction/price';
import { formatGold, formatNumber } from '@/lib/format';

const { Text } = Typography;

/**
 * 표의 가격 칸.
 *
 * 한 칸에 하나만 올라온 매물은 개당과 전체가 같아서 가격 하나면 끝난다. 장비는 대부분
 * 이쪽이다. 여러 개가 묶인 매물에서만 개당과 전체를 나눠 보여 준다.
 *
 * 전체 값은 API 가 주는 것이 아니라 개당 가격에 개수를 곱한 값이다.
 */
export function AuctionPriceCell({ pricePerUnit, count }: { pricePerUnit: number; count: number }) {
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
      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
        개당 {formatGold(price.pricePerUnit)}
      </Text>
      <Text strong className="tnum">
        전체 {formatGold(price.total)}
      </Text>
      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
        {formatNumber(price.count)}개
      </Text>
    </Flex>
  );
}
