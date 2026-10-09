import type { ReactNode } from 'react';
import { Flex, Spin, Typography } from 'antd';
import { isCardStoreConfigured } from '@/features/itemcard/cards';
import { isIconMapConfigured } from '@/features/itemcard/iconMap';
import type { CostSum, NodePrice } from '@/features/crafting/plan';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

/**
 * 재료 트리 표의 칸 컴포넌트. 아이템 정보의 제작 비용과 재료 메모가 같이 쓴다.
 */
const { Text } = Typography;

/** 재료 그림 칸. 표 한 줄 높이를 크게 늘리지 않으면서 알아볼 수 있는 크기. */
export const MATERIAL_ICON = 32;

function priceStatusText(price: NodePrice): string {
  switch (price.status) {
    case 'untradable':
      return '거래 불가';
    case 'loading':
      return '받는 중';
    case 'error':
      return '조회 실패';
    case 'npc':
    case 'coin':
      return '';
    default:
      return price.price.offers.length === 0 ? '매물 없음' : '';
  }
}

export function LowestPrice({ price, lowest }: { price: NodePrice; lowest?: number }): ReactNode {
  const formatGold = useGoldFormatter();
  if (price.status === 'loading') return <Spin size="small" />;
  const status = priceStatusText(price);
  if (status || lowest === undefined) return <Text type="secondary">{status || '-'}</Text>;
  return (
    <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
      {formatGold(lowest)}
    </Text>
  );
}

/** 합이 온전하지 않으면 무엇이 빠졌는지 짧게 붙인다. 자세한 목록은 총액 아래에 있다. */
export function CostText({ cost, strong }: { cost: CostSum; strong?: boolean }) {
  const formatGold = useGoldFormatter();
  if (cost.pending > 0 && cost.gold === 0) return <Spin size="small" />;
  const knownNothing = cost.gold === 0 && cost.unpriced.length > 0;
  return (
    <Flex vertical align="flex-end">
      <Text
        className="tnum"
        strong={strong}
        style={{ whiteSpace: 'nowrap' }}
        type={knownNothing ? 'secondary' : undefined}
      >
        {knownNothing ? '값 모름' : formatGold(cost.gold)}
      </Text>
      {!knownNothing && (cost.unpriced.length > 0 || cost.short.length > 0) ? (
        <Text type="warning" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {cost.unpriced.length > 0 ? '값 모르는 재료 빠짐' : '매물 부족'}
        </Text>
      ) : null}
    </Flex>
  );
}

/**
 * 그림을 찾을 수 없는 재료의 자리. 이름이 줄마다 다른 자리에서 시작하면 트리의 들여쓰기가 읽히지
 * 않으므로 칸은 비워 둔다. 그림 저장소가 없는 환경에서는 ItemIcon 처럼 자리도 두지 않는다.
 */
export function MaterialIconSlot() {
  if (!isCardStoreConfigured() && !isIconMapConfigured()) return null;
  return (
    <div style={{ width: MATERIAL_ICON, height: MATERIAL_ICON, flex: `0 0 ${MATERIAL_ICON}px` }} />
  );
}
