import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { ItemsPage } from '@/pages/ItemsPage';

const SPEC = '마나실드 사용 중일 때 최대대미지 7~12 증가';

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('data/items/names.json')) {
        return new Response(
          JSON.stringify({
            updated: '2026-10-01',
            categories: ['인챈트 스크롤'],
            items: [
              ['인챈트 스크롤 - 나비', 0, '버터플라이'],
              ['인챈트 스크롤 - 올빼미', 0],
              ['개방된 전용 인챈트 스크롤', 0],
            ],
          }),
        );
      }
      if (url.endsWith('data/enchant-scrolls.json')) {
        return new Response(
          JSON.stringify({
            scrolls: {
              '인챈트 스크롤 - 나비': [{ slot: 1, level: 6, desc: [SPEC], alt: '버터플라이' }],
            },
          }),
        );
      }
      return new Response('not found', { status: 404 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderPage(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<ItemsPage />}>
              <Route path="/items" />
              <Route path="/item/:slug" />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('인챈트 스크롤 상세', () => {
  it('사전에 있는 이름의 상세는 사양과 다른 이름을 보여 준다', async () => {
    renderPage('/item/인챈트_스크롤_-_나비?category=인챈트 스크롤');

    expect(await screen.findByText(SPEC)).toBeInTheDocument();
    expect(screen.getByText('버터플라이')).toBeInTheDocument();
  });

  it('사전에 없는 개방된 전용 스크롤도 같은 인챈트 이름의 사양을 보여 준다', async () => {
    renderPage('/item/개방된_전용_인챈트_스크롤_-_나비');

    expect(
      await screen.findByRole('heading', { name: '개방된 전용 인챈트 스크롤 - 나비' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(SPEC)).toBeInTheDocument();
  });

  it('첫 번째 인챈트 이름으로 만든 이름도 같은 사양을 보여 준다', async () => {
    renderPage('/item/인챈트_스크롤_-_버터플라이');

    expect(await screen.findByText(SPEC)).toBeInTheDocument();
  });
});

describe('인챈트 스크롤 찾기', () => {
  it('첫 번째 인챈트 이름으로 찾아도 같은 스크롤이 목록에 나온다', async () => {
    renderPage('/items');

    fireEvent.change(await screen.findByLabelText('이름으로 찾기'), {
      target: { value: '버터플라이' },
    });

    expect(await screen.findByText('인챈트 스크롤 - 나비')).toBeInTheDocument();
    expect(screen.queryByText('인챈트 스크롤 - 올빼미')).toBeNull();
  });
});
