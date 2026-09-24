import { Navigate, useLocation } from 'react-router-dom';

/**
 * 예전 장비 시뮬레이터 주소(`/equipment`). 시뮬레이터는 아이템 사전 안으로 들어갔다.
 * 복사해 둔 조합 링크가 깨지지 않게 카테고리, 이름, 조합을 그대로 들고 사전으로 넘긴다.
 */
export function EquipmentRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/dictionary${search}`} replace />;
}
