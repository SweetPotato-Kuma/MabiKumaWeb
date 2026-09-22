import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NexonApiError } from '@/lib/nexonClient';

interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage?: string;
  children: ReactNode;
}

function ErrorView({ error }: { error: unknown }) {
  if (error instanceof NexonApiError) {
    return (
      <div className="state state--error" role="alert">
        <p className="state__title">요청을 처리하지 못했습니다</p>
        <p className="state__body">{error.message}</p>
        {error.isApiKeyProblem ? (
          <Link className="button" to="/settings">
            설정에서 API 키 입력하기
          </Link>
        ) : null}
      </div>
    );
  }

  const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

  return (
    <div className="state state--error" role="alert">
      <p className="state__title">요청을 처리하지 못했습니다</p>
      <p className="state__body">{message}</p>
    </div>
  );
}

/** 로딩 / 에러 / 빈 결과 / 정상을 한 곳에서 처리한다. */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyMessage = '조건에 맞는 결과가 없습니다.',
  children,
}: QueryStateProps) {
  if (error) return <ErrorView error={error} />;

  if (isLoading) {
    return (
      <div className="state" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <p className="state__body">불러오는 중…</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="state">
        <p className="state__body">{emptyMessage}</p>
      </div>
    );
  }

  return <>{children}</>;
}
