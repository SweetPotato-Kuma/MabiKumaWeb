import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SearchOutlined, ToolOutlined } from '@ant-design/icons';
import { Button, Empty, Flex, Modal, Skeleton, Typography } from 'antd';
import { ItemCardSummary } from '@/components/ItemCardSummary';
import { equipmentPath, isEquipmentCategory } from '@/features/equipment/api';
import {
  isCardStoreConfigured,
  useItemCard,
  usePrefetchItemCards,
} from '@/features/itemcard/cards';

const { Text } = Typography;

export interface ItemCardTarget {
  category: string;
  name: string;
}

interface ItemCardModalProps {
  item: ItemCardTarget | null;
  onClose: () => void;
}

/**
 * 아이템 사전에서 줄을 눌렀을 때 뜨는 창.
 *
 * 경매장 매물 상세와 머리 모양이 같다. 사전에는 가격과 옵션이 없으므로 그 아래는 비우고,
 * 대신 그 아이템의 시세로 바로 가는 단추를 둔다.
 */
export function ItemCardModal({ item, onClose }: ItemCardModalProps) {
  const cardName = item?.name ?? '';
  const cardCategory = item?.category ?? '';
  // 표에서 이미 받아 둔 경우가 대부분이라 보통은 바로 나온다. 아니면 여기서 한 번 묻는다.
  const keys = useMemo(
    () => (cardName ? [{ category: cardCategory, name: cardName }] : []),
    [cardCategory, cardName],
  );
  usePrefetchItemCards(keys);
  const card = useItemCard(cardCategory, cardName);

  const configured = isCardStoreConfigured();
  const loading = configured && card === undefined;
  const missing = !configured || card === null || (card !== undefined && !card.description);

  return (
    <Modal open={item !== null} onCancel={onClose} footer={null} width={640} title={null} destroyOnHidden>
      {item === null ? null : (
        <Flex vertical gap={20}>
          <ItemCardSummary card={card} title={item.name} rawName={item.name} category={item.category} />

          {loading ? <Skeleton active title={false} paragraph={{ rows: 3 }} /> : null}

          {!loading && missing ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="이 아이템은 아직 설명이 없습니다. 게임 데이터에 없거나 새로 들어온 아이템입니다."
            />
          ) : null}

          <Flex gap={8} wrap>
            <Link
              to={`/auction?keyword=${encodeURIComponent(item.name)}&category=${encodeURIComponent(item.category)}`}
              onClick={onClose}
            >
              <Button icon={<SearchOutlined />}>시세 보기</Button>
            </Link>
            {isEquipmentCategory(item.category) ? (
              <Link to={equipmentPath(item.category, item.name)} onClick={onClose}>
                <Button icon={<ToolOutlined />}>장비 시뮬레이터</Button>
              </Link>
            ) : null}
          </Flex>

          {/* 어디서 온 값인지 섞이지 않게 적는다. 사전의 그림과 설명은 경매장 응답이 아니다. */}
          <Text type="secondary" style={{ fontSize: 12 }}>
            그림과 설명은 아이템 사전에 모아 둔 것이며 경매장 API 가 주는 값이 아닙니다.
          </Text>
        </Flex>
      )}
    </Modal>
  );
}
