import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SearchOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Flex, Skeleton, Typography } from 'antd';
import { ItemCardSummary } from '@/components/ItemCardSummary';
import {
  isCardStoreConfigured,
  useItemCard,
  usePrefetchItemCards,
} from '@/features/itemcard/cards';

const { Text } = Typography;

/**
 * 장비가 아닌 아이템의 상세. 그림, 이름, 설명, 그리고 그 아이템의 시세로 가는 단추.
 *
 * 예전에는 목록 위에 창으로 띄웠다. 경매장 상세에서도 넘어올 수 있게 주소를 가진 화면으로
 * 바꿨다. 창은 주소가 없어서 링크로 열 수도, 뒤로 가기로 닫을 수도 없다.
 * 머리 모양은 경매장 매물 상세와 같은 ItemCardSummary 를 쓴다.
 */
export function ItemInfoDetail({ category, name }: { category: string; name: string }) {
  const keys = useMemo(() => [{ category, name }], [category, name]);
  usePrefetchItemCards(keys);
  const card = useItemCard(category, name);

  const configured = isCardStoreConfigured();
  const loading = configured && card === undefined;
  const missing = !configured || card === null || (card !== undefined && !card.description);

  return (
    <Card>
      <Flex vertical gap={20}>
        <ItemCardSummary card={card} title={name} rawName={name} category={category} />

        {loading ? <Skeleton active title={false} paragraph={{ rows: 3 }} /> : null}

        {!loading && missing ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="이 아이템은 아직 설명이 없습니다. 게임 데이터에 없거나 새로 들어온 아이템입니다."
          />
        ) : null}

        <div>
          <Link to={`/auction?keyword=${encodeURIComponent(name)}&category=${encodeURIComponent(category)}`}>
            <Button icon={<SearchOutlined />}>시세 보기</Button>
          </Link>
        </div>

        {/* 어디서 온 값인지 섞이지 않게 적는다. 그림과 설명은 경매장 응답이 아니다. */}
        <Text type="secondary" style={{ fontSize: 12 }}>
          그림과 설명은 게임 데이터에서 따로 모아 둔 것이며 경매장 API 가 주는 값이 아닙니다.
        </Text>
      </Flex>
    </Card>
  );
}
