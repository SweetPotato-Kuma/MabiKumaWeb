import { Navigate, useLocation } from 'react-router-dom';

/**
 * 옮겨 간 화면의 예전 주소. 목록은 pageMeta.json 의 redirects 에 있다.
 *
 * 복사해 둔 링크가 깨지지 않게 카테고리, 이름, 장비 조합이 담긴 쿼리를 그대로 들고 넘긴다.
 * 검색엔진에는 빌드가 구운 예전 주소 HTML 의 canonical 이 새 주소를 알린다(scripts/postbuild.mjs).
 */
export function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}
