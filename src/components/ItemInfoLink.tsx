import { Link } from 'react-router-dom';
import { itemInfoPath } from '@/features/auction/dictionary';

/**
 * 아이템 이름을 그 아이템의 상세로 가는 링크로 그린다.
 *
 * 제작 재료 트리처럼 상세 안에서 다른 아이템을 보여 줄 때 쓴다. 상세는 같은 화면에서 내용만 바뀌므로
 * 표 아래쪽에서 눌러도 새 아이템의 머리부터 보이게 맨 위로 올린다. 사전에 카테고리가 없는 아이템
 * (경매장에 오른 적 없는 재료)도 이름만으로 열린다.
 */
export function ItemInfoLink({ name, category }: { name: string; category?: string }) {
  return (
    <Link to={itemInfoPath(category ?? '', name)} onClick={() => window.scrollTo({ top: 0 })}>
      {name}
    </Link>
  );
}
