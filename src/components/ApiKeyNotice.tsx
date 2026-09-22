import { Link } from 'react-router-dom';
import { useCanQuery } from '@/lib/settings';

/** 키도 없고 프록시도 없어서 조회 자체가 불가능할 때만 안내한다. */
export function ApiKeyNotice() {
  const canQuery = useCanQuery();

  if (canQuery) return null;

  return (
    <div className="notice" role="status">
      <strong>조회하려면 API 키가 필요합니다.</strong> 넥슨 오픈 API 키를{' '}
      <Link to="/settings">설정</Link> 에서 등록해 주세요. 키는 이 브라우저에만 저장되며 서버로
      전송되지 않습니다.
    </div>
  );
}
