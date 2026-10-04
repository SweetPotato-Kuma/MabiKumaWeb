import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { RootLayout } from '@/components/RootLayout';
import type * as Settings from '@/lib/settings';

const endpoint = vi.hoisted(() => ({ state: { apiKey: '', viaProxy: false } }));

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  useEndpointMode: () => endpoint.state,
}));

/** jsdom 은 폭 조건이 모두 거짓이라 좁은 화면이다. 조회 상태 배지는 서랍 아래에 있다. */
async function drawerText() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auction']}>
          <Routes>
            <Route element={<RootLayout />}>
              <Route path="*" element={<div>화면</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '메뉴 열기' }));
  return (await screen.findByRole('dialog')).textContent ?? '';
}

describe('헤더의 조회 상태 배지', () => {
  it('내 API 키로 조회해도 배지를 두지 않는다', async () => {
    endpoint.state = { apiKey: 'live_test', viaProxy: false };

    expect(await drawerText()).not.toContain('내 API 키');
  });

  it('프록시로 조회하면 배지를 두지 않는다', async () => {
    endpoint.state = { apiKey: '', viaProxy: true };

    const text = await drawerText();
    expect(text).not.toContain('내 API 키');
    expect(text).not.toContain('조회 불가');
  });

  it('조회할 길이 없을 때만 조회 불가를 알린다', async () => {
    endpoint.state = { apiKey: '', viaProxy: false };

    expect(await drawerText()).toContain('조회 불가');
  });
});
