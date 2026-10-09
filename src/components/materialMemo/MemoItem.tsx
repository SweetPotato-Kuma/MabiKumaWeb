import type { ReactNode } from 'react';
import { Flex } from 'antd';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import type { RecipeBook } from '@/features/crafting/recipes';

/** 표의 이름 칸 그림. */
export const MEMO_ICON = 28;

/**
 * 그림과 아이템 정보 상세로 가는 이름. 그림은 제작법 데이터가 적어 둔 파일을 먼저 쓰고,
 * 없으면 이름 사전의 카테고리로 찾는다. 경매장에 오른 적 없는 재료도 이름만으로 상세가 열린다.
 */
export function MemoItem({
  book,
  itemId,
  size = MEMO_ICON,
  suffix,
}: {
  book: RecipeBook;
  itemId: number;
  size?: number;
  suffix?: ReactNode;
}) {
  const index = useItemNameIndexQuery().data;
  const name = book.itemName(itemId);
  const category = index?.categoriesByName.get(name)?.[0];
  return (
    <Flex gap={8} align="center" style={{ minWidth: 0 }}>
      <ItemIcon category={category} name={name} file={book.iconOf(itemId)} size={size} />
      <Flex gap={6} align="center" wrap style={{ minWidth: 0 }}>
        <ItemInfoLink name={name} category={category} />
        {suffix}
      </Flex>
    </Flex>
  );
}
