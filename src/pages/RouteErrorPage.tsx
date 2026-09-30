import { useEffect, useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button, Flex, Result } from 'antd';
import errorBearDark from '@/assets/error-bear-dark.png';
import errorBear from '@/assets/error-bear.png';
import { isChunkLoadError, reloadForNewVersion } from '@/lib/staleChunk';
import { useResolvedThemeMode } from '@/lib/themePreference';
import { HomeIcon } from '@/components/icons';

/** 라우터 바깥에서 터진 오류라 RootLayout 을 거치지 않는다. 배경과 여백을 여기서 잡는다. */
export function RouteErrorPage() {
  const error = useRouteError();
  const isDark = useResolvedThemeMode() === 'dark';
  const staleChunk = isChunkLoadError(error);
  // 새로 배포되어 옛 파일이 사라진 경우다. 새로고침하면 새 파일을 받는다.
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    if (staleChunk) setReloading(reloadForNewVersion());
  }, [staleChunk]);

  let title = '문제가 발생했습니다';
  let detail = '알 수 없는 오류입니다.';

  if (staleChunk) {
    title = reloading ? '새 버전을 불러오는 중입니다' : '새 버전을 불러오지 못했습니다';
    detail = reloading ? '' : '페이지를 새로고침해 주세요.';
  } else if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    detail = typeof error.data === 'string' ? error.data : detail;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <Flex align="center" justify="center" style={{ flex: '1 0 auto', padding: 16 }}>
      <Result
        icon={<img src={isDark ? errorBearDark : errorBear} alt="" width={230} height={150} />}
        title={title}
        subTitle={detail}
        extra={
          reloading ? null : (
            <Button type="primary" icon={<HomeIcon />} href={import.meta.env.BASE_URL}>
              홈으로
            </Button>
          )
        }
      />
    </Flex>
  );
}
