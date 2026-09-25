import { Link } from 'react-router-dom';
import { Button, Result } from 'antd';
import notFoundBearDark from '@/assets/not-found-dark.png';
import notFoundBear from '@/assets/not-found.png';
import { useResolvedThemeMode } from '@/lib/themePreference';
import { HomeIcon } from '@/components/icons';

export function NotFoundPage() {
  const isDark = useResolvedThemeMode() === 'dark';
  return (
    <Result
      // 원본은 2배 크기다. 크기를 적어 두어 그림이 늦게 떠도 제목이 밀리지 않게 한다.
      icon={<img src={isDark ? notFoundBearDark : notFoundBear} alt="" width={201} height={150} />}
      title="404"
      subTitle="요청한 페이지를 찾을 수 없습니다."
      extra={
        <Link to="/">
          <Button type="primary" icon={<HomeIcon />}>
            홈으로
          </Button>
        </Link>
      }
    />
  );
}
