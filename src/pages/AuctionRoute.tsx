import { useLocation } from 'react-router-dom';
import { AuctionPage } from '@/pages/AuctionPage';

/**
 * 경매장은 검색 조건을 주소에서 처음 한 번만 읽는다. 이미 경매장에 있을 때 다른 주소로 넘어오면(전체 검색의
 * "경매장에서 검색" 등) 화면이 그대로여서 아무 일도 없었다. 쿼리가 바뀌면 화면을 새로 그려 그 조건으로 다시 찾는다.
 */
export function AuctionRoute() {
  const { search } = useLocation();
  return <AuctionPage key={search} />;
}
