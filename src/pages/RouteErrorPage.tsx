import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';
import { Button, Flex, Result } from 'antd';

/** 라우터 바깥에서 터진 오류라 RootLayout 을 거치지 않는다. 배경과 여백을 여기서 잡는다. */
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
    <Flex align="center" justify="center" style={{ minHeight: '100dvh', padding: 16 }}>
      <Result
        status="error"
        title={title}
        subTitle={detail}
        extra={
          <Button type="primary" icon={<HomeOutlined />} href={import.meta.env.BASE_URL}>
            홈으로
          </Button>
        }
      />
    </Flex>
  );
}
