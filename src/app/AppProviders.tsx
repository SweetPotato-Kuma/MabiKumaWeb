import { useEffect, useMemo, type ReactNode } from 'react';
import { App as AntdApp, ConfigProvider, type ConfigProviderProps } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { applyThemeVariables, buildThemeConfig } from '@/app/theme';
import { useResolvedThemeMode } from '@/lib/themePreference';
import { EmptyState } from '@/components/EmptyState';

/**
 * 한 화면에는 하나의 테마만 있다. 섹션마다 테마를 뒤집지 않는다.
 * 여기가 유일한 ConfigProvider 이고, 개별 화면이 테마를 덮어쓰지 않는다.
 */
/**
 * 표와 목록이 비었을 때도 곰 그림을 쓴다. 고르기 상자의 드롭다운은 좁아서 그림이 짐이 되므로
 * null 을 돌려 antd 기본값에 맡긴다.
 */
const renderEmpty: ConfigProviderProps['renderEmpty'] = (componentName) =>
  componentName === 'Table' || componentName === 'List' ? (
    <EmptyState size="small" description="표시할 항목이 없습니다." />
  ) : null;

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
    <ConfigProvider theme={themeConfig} locale={koKR} renderEmpty={renderEmpty}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
