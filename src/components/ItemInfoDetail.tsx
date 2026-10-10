import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Flex, Skeleton } from 'antd';
import { ItemCardSummary } from '@/components/ItemCardSummary';
import {
  cardCategoryOf,
  isCardStoreConfigured,
  useItemCard,
  usePrefetchItemCards,
} from '@/features/itemcard/cards';
import { useKitIcon } from '@/features/kits/kits';
import { EmptyState } from '@/components/EmptyState';
import { SearchIcon } from '@/components/icons';

/**
 * 장비가 아닌 아이템의 상세. 그림, 이름, 설명, 그리고 그 아이템의 시세로 가는 단추.
 *
 * 예전에는 목록 위에 창으로 띄웠다. 경매장 상세에서도 넘어올 수 있게 주소를 가진 화면으로
 * 바꿨다. 창은 주소가 없어서 링크로 열 수도, 뒤로 가기로 닫을 수도 없다.
 * 머리 모양은 경매장 매물 상세와 같은 ItemCardSummary 를 쓴다.
 */
export function ItemInfoDetail({
  category,
  name,
  cardName,
  children,
}: {
  category: string;
  name: string;
  /** 그림과 설명을 찾을 사전 이름. 사전에 없는 이름(개방된 전용 인챈트 스크롤 - 올빼미)이면 기본 스크롤의 이름이다. 없으면 name. */
  cardName?: string;
  /** 설명 아래, 시세 단추 위에 더 보일 것(인챈트 스크롤의 사양 등). */
  children?: ReactNode;
}) {
  const lookupName = cardName ?? name;
  // 사전 카테고리가 없는 아이템도 설명이 있다. 카드는 분류 없음 칸에서 찾고, 화면의 카테고리는 그대로 둔다.
  const cardCategory = cardCategoryOf(category);
  const keys = useMemo(() => [{ category: cardCategory, name: lookupName }], [cardCategory, lookupName]);
  usePrefetchItemCards(keys);
  const card = useItemCard(cardCategory, lookupName);
  // 사전에 없는 키트 보상(의장 등)은 키트에 모아 둔 그림으로 채운다.
  const kitIcon = useKitIcon(name);

  const configured = isCardStoreConfigured();
  const loading = configured && card === undefined;
  const missing = !configured || card === null || (card !== undefined && !card.description);

  return (
    <Card>
      <Flex vertical gap={20}>
        <ItemCardSummary
          card={card}
          title={name}
          category={category}
          iconName={lookupName}
          fallbackIcon={kitIcon ?? undefined}
        />

        {loading ? <Skeleton active title={false} paragraph={{ rows: 3 }} /> : null}

        {!loading && missing ? (
          <EmptyState
            size="small"
            description="이 아이템은 아직 설명이 없습니다. 게임 데이터에 없거나 새로 들어온 아이템입니다."
          />
        ) : null}

        {children}

        <div>
          <Link to={`/auction?keyword=${encodeURIComponent(name)}&category=${encodeURIComponent(category)}`}>
            <Button icon={<SearchIcon />}>시세 보기</Button>
          </Link>
        </div>
      </Flex>
    </Card>
  );
}
