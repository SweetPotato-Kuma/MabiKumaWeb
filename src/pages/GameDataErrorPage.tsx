import { useLocation } from 'react-router-dom';
import { Button, Flex, Result, Space } from 'antd';
import errorBear from '@/assets/error-bear.png';
import errorBearDark from '@/assets/error-bear-dark.png';
import { gameDataReturnPath } from '@/lib/gameDataNavigation';
import { useResolvedThemeMode } from '@/lib/themePreference';

/** 조회 실패 후에는 오래된 표를 보여주지 않고, 원래 화면을 다시 조회할 수 있게 한다. */
export function GameDataErrorPage() {
  const location = useLocation();
  const isDark = useResolvedThemeMode() === 'dark';
  // 전체 페이지 이동으로 초기 표와 메모리의 조회 결과를 모두 다시 준비한다.
  const retryUrl = import.meta.env.BASE_URL + gameDataReturnPath(location.state?.returnTo).slice(1);
  return (
    <Flex align="center" justify="center" style={{ flex: '1 0 auto', padding: 16 }}>
      <Result
        icon={<img src={isDark ? errorBearDark : errorBear} alt="" width={230} height={150} />}
        title="게임 정보를 불러오지 못했습니다"
        subTitle="잠시 후 다시 시도해 주세요."
        extra={
          <Space>
            <Button type="primary" href={retryUrl}>
              다시 조회
            </Button>
            <Button href={import.meta.env.BASE_URL}>홈으로</Button>
          </Space>
        }
      />
    </Flex>
  );
}
