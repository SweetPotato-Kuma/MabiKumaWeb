import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

export function RouteErrorPage() {
  const error = useRouteError();

  let title = '문제가 발생했습니다';
  let detail = '알 수 없는 오류입니다.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    detail = typeof error.data === 'string' ? error.data : detail;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <div className="page state state--error" role="alert">
      <h1>{title}</h1>
      <p className="state__body">{detail}</p>
      <a className="button" href={import.meta.env.BASE_URL}>
        홈으로
      </a>
    </div>
  );
}
