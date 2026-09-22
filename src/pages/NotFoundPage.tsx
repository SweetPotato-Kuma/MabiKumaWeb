import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="page state">
      <h1>404</h1>
      <p className="state__body">요청한 페이지를 찾을 수 없습니다.</p>
      <Link className="button button--primary" to="/">
        홈으로
      </Link>
    </div>
  );
}
