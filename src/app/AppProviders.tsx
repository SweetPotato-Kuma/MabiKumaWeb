import { useEffect, type ReactNode } from 'react';
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

  useEffect(() => {
    applyThemeVariables(mode);
  }, [mode]);

  return (
    <ConfigProvider theme={buildThemeConfig(mode)} locale={koKR}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
