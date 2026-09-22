import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SettingOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Flex, Skeleton, Space } from 'antd';
import { NexonApiError } from '@/lib/nexonClient';

interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage?: string;
  /** 이 에러에서 사용자가 바로 할 수 있는 다음 행동. 화면 쪽에서 상황에 맞춰 넘긴다. */
  errorAction?: ReactNode;
  children: ReactNode;
}

function ErrorView({ error, action }: { error: unknown; action?: ReactNode }) {
  const isApiError = error instanceof NexonApiError;
  const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
  const needsKey = isApiError && error.isApiKeyProblem;

  return (
    <Alert
      type="error"
      showIcon
      role="alert"
      message="요청을 처리하지 못했습니다"
      description={
        <Flex vertical gap={12} align="flex-start">
          <span>{message}</span>
          {action}
          {needsKey ? (
            <Link to="/settings">
              <Button icon={<SettingOutlined />}>설정에서 API 키 입력하기</Button>
            </Link>
          ) : null}
        </Flex>
      }
    />
  );
}

/**
 * 로딩 / 에러 / 빈 결과 / 정상을 한 곳에서 처리한다.
 * 네 상태가 전부 있어야 화면이 끝난 것으로 본다.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyMessage = '조건에 맞는 결과가 없습니다. 조건을 바꿔 다시 검색해 보세요.',
  errorAction,
  children,
}: QueryStateProps) {
  if (error) return <ErrorView error={error} action={errorAction} />;

  if (isLoading) {
    // 결과가 표라서 로딩도 표 모양을 흉내 낸다. 범용 스피너는 위치를 알려 주지 못한다.
    return (
      <Card aria-live="polite" aria-busy="true">
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Skeleton.Input active block style={{ height: 38 }} />
          <Skeleton active title={false} paragraph={{ rows: 6, width: '100%' }} />
        </Space>
      </Card>
    );
  }

  if (isEmpty) {
    return (
      <Card>
        <Empty description={emptyMessage} />
      </Card>
    );
  }

  return <>{children}</>;
}
