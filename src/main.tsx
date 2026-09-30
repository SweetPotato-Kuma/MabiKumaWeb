import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/AppProviders';
import { queryClient } from '@/app/queryClient';
import { router } from '@/app/router';
import { applyThemeVariables } from '@/app/theme';
import { reloadForNewVersion } from '@/lib/staleChunk';
import { getResolvedThemeMode } from '@/lib/themePreference';
// antd 의 기본 리셋이 먼저, 프로젝트 전역 스타일이 나중. 순서가 바뀌면 배경이 덮인다.
import 'antd/dist/reset.css';
// 글꼴은 사이트 안에 싣는다(theme.ts 의 FONT_FAMILY). 화면에 나온 글자가 속한 조각만 받는다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@/styles/index.css';

// 첫 페인트 전에 배경을 맞춰 둔다. 렌더 뒤에 칠하면 밝은 화면이 한 번 번쩍인다.
applyThemeVariables(getResolvedThemeMode());

// 배포 전에 열어 둔 화면이 사라진 옛 파일을 부르면 Vite 가 이 이벤트를 준다. 새로고침 한 번으로 새 파일을 받는다.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

const container = document.getElementById('root');

if (!container) {
  throw new Error('#root 엘리먼트를 찾을 수 없습니다.');
}

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppProviders>
  </StrictMode>,
);
