import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { RootLayout } from '@/components/RootLayout';
import { GAME_DATA_FAILURE_EVENT } from '@/lib/gameData';
import { GameDataErrorPage } from './GameDataErrorPage';
import { gameDataReturnPath } from '@/lib/gameDataNavigation';

function CurrentPage() {
  const location = useLocation();
  return <div>{location.pathname + location.search + location.hash}</div>;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('조회 실패는 오류 화면으로 이동하고 다시 조회는 검색 조건을 유지한다', async () => {
  vi.stubEnv('BASE_URL', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <AppProviders>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/auction?q=문어#popular']}>
          <Routes>
            <Route path="/data-error" element={<GameDataErrorPage />} />
            <Route element={<RootLayout />}>
              <Route path="/auction" element={<CurrentPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
  expect(await screen.findByText('/auction?q=문어#popular')).toBeInTheDocument();
  fireEvent(window, new Event(GAME_DATA_FAILURE_EVENT));
  expect(await screen.findByText('게임 정보를 불러오지 못했습니다')).toBeInTheDocument();
  expect(screen.queryByLabelText('전체 검색 열기')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '다시 조회' })).toHaveAttribute(
    'href',
    '/auction?q=문어#popular',
  );
  vi.unstubAllGlobals();
});

it('외부 주소와 오류 화면으로 되돌아가는 주소는 홈으로 바꾼다', () => {
  for (const path of [
    'https://other.example',
    '//other.example',
    '/\\other.example',
    '/data-error',
    null,
  ])
    expect(gameDataReturnPath(path)).toBe('/');
});
