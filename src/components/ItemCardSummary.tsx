import { Flex, Tag, Typography } from 'antd';
import { ItemIcon } from '@/components/ItemIcon';
import type { ItemCard } from '@/features/itemcard/cards';

const { Text, Title, Paragraph } = Typography;

/**
 * 상세 창의 그림 칸. 표보다 크게 둔다. 여기서는 그림을 보려고 연 것이다.
 * 96 이면 가장 긴 것(48x96)까지 원래 크기 그대로 들어간다.
 */
const SUMMARY_ICON_BOX = 96;

interface ItemCardSummaryProps {
  card: ItemCard | null | undefined;
  /** 큰 제목. 경매장에서는 인챈트가 붙은 표시 이름, 사전에서는 아이템 이름이다. */
  title: string;
  /** 원래 이름. 제목과 다를 때만 한 줄 더 보여 준다. */
  rawName: string;
  category: string;
}

/**
 * 아이템 상세 창의 머리. 그림, 이름, 한 줄 설명, 카테고리, 그리고 설명 본문.
 *
 * 경매장 매물 상세와 사전 상세가 같은 모양이어야 한다. 한쪽에서 본 창을 다른 쪽에서
 * 다르게 읽을 이유가 없다. 그래서 두 창이 이 조각을 같이 쓴다.
 */
export function ItemCardSummary({ card, title, rawName, category }: ItemCardSummaryProps) {
  return (
    <>
      <Flex align="flex-start" gap={16}>
        <ItemIcon card={card} size={SUMMARY_ICON_BOX} />
        <Flex vertical gap={4} style={{ minWidth: 0 }}>
          <Title level={4} style={{ margin: 0 }}>
            {title}
          </Title>
          {title !== rawName ? (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {rawName}
            </Text>
          ) : null}
          {card?.subtitle ? (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {card.subtitle}
            </Text>
          ) : null}
          <div>
            <Tag style={{ marginInlineEnd: 0 }}>{category}</Tag>
          </div>
        </Flex>
      </Flex>

      {card?.description ? (
        // 설명 안의 줄바꿈은 게임이 넣어 둔 것이다. 이어 붙이면 문단이 뭉개진다.
        <Paragraph style={{ marginBottom: 0, maxWidth: '65ch', whiteSpace: 'pre-line' }}>
          {card.description}
        </Paragraph>
      ) : null}
    </>
  );
}
