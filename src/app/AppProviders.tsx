import { useEffect, useMemo, type ReactNode } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { applyThemeVariables, buildThemeConfig } from '@/app/theme';
import { useResolvedThemeMode } from '@/lib/themePreference';

/**
 * 한 화면에는 하나의 테마만 있다. 섹션마다 테마를 뒤집지 않는다.
 * 여기가 유일한 ConfigProvider 이고, 개별 화면이 테마를 덮어쓰지 않는다.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const mode = useResolvedThemeMode();

  /**
   * 테마 객체를 렌더마다 새로 만들면 ConfigProvider 가 같은 값을 받고도 바뀐 것으로 보고
   * 토큰을 다시 계산해 스타일을 새로 주입한다. 열려 있던 드롭다운이 그 순간 자리를 잃고
   * 화면이 흔들린다. 모드가 바뀔 때만 새로 만든다.
   */
  const themeConfig = useMemo(() => buildThemeConfig(mode), [mode]);

  useEffect(() => {
    applyThemeVariables(mode);
  }, [mode]);

  return (
    <ConfigProvider theme={themeConfig} locale={koKR}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
