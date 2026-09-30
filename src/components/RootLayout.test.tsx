import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { RootLayout } from '@/components/RootLayout';

vi.setConfig({ testTimeout: 30_000 });

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<RootLayout />}>
              <Route path="*" element={<div>화면</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

/** jsdom 은 폭 조건이 모두 거짓이라 좁은 화면(서랍 메뉴)으로 그려진다. */
async function openDrawer() {
  fireEvent.click(await screen.findByRole('button', { name: '메뉴 열기' }));
  return await screen.findByRole('dialog');
}

describe('서랍 메뉴', () => {
  it('묶음마다 제목이 하나씩이고, 시뮬레이터는 장비와 유물로 갈린다', async () => {
    renderAt('/auction');
    const drawer = await openDrawer();

    expect(drawer).toHaveTextContent('NPC 상점');
    expect(drawer).toHaveTextContent('시뮬레이터 · 장비');
    expect(drawer).toHaveTextContent('시뮬레이터 · 유물');
    // 제목이 연달아 두 줄로 서지 않는다: 묶음 이름만 있는 "시뮬레이터" 제목은 없다.
    const headings = Array.from(drawer.querySelectorAll('.ant-menu-item-group-title')).map((node) => node.textContent);
    expect(headings).not.toContain('시뮬레이터');
    expect(headings).toEqual(['NPC 상점', '시뮬레이터 · 장비', '시뮬레이터 · 유물']);
  });

  it('뿔피리는 NPC 상점 묶음의 항목이 아니라 앞뒤가 선으로 갈린 최상위 칸이다', async () => {
    renderAt('/auction');
    const drawer = await openDrawer();

    const groups = Array.from(drawer.querySelectorAll('.ant-menu-item-group'));
    const shop = groups.find((group) => group.textContent?.includes('NPC 상점'));
    expect(shop?.textContent).not.toContain('뿔피리');
    expect(drawer).toHaveTextContent('뿔피리');
    // 묶음 뒤에 오는 뿔피리 앞에는 갈래선이 있다.
    const horn = Array.from(drawer.querySelectorAll('li')).find((node) => node.textContent === '뿔피리');
    expect(horn?.previousElementSibling?.classList.contains('ant-menu-item-divider')).toBe(true);
  });

  it('없는 주소(404)에서는 선택된 메뉴가 없다', async () => {
    renderAt('/nonexistent-page');
    const drawer = await openDrawer();

    expect(drawer.querySelector('.ant-menu-item-selected')).toBeNull();
  });

  it('경매장 화면에서는 경매장이 선택돼 있다', async () => {
    renderAt('/auction');
    const drawer = await openDrawer();

    expect(drawer.querySelector('.ant-menu-item-selected')).toHaveTextContent('경매장');
  });
});

describe('에린 시계', () => {
  it('좁은 화면에서는 서랍 맨 위에 에린 시각과 상점 교체 시간이 보인다', async () => {
    renderAt('/auction');
    const drawer = await openDrawer();

    expect(drawer).toHaveTextContent(/에린 시각 \d{2}:\d{2} \((낮|밤)\)/);
    expect(drawer).toHaveTextContent(/다음 상점 교체까지/);
  });

  it('넓은 화면에서는 헤더 검색 단추 왼쪽에 에린 시각이 있다', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    renderAt('/auction');

    const clock = await screen.findByRole('button', { name: /에린 시각 \d{2}:\d{2}/ });
    const search = screen.getByRole('button', { name: /검색/ });

    expect(clock).toHaveTextContent(/^에린 \d{2}:\d{2}$/);
    // 문서에서 에린 시계가 검색 단추보다 앞에 있다.
    expect(clock.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
