import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import { DungeonCoinsPage } from '@/pages/DungeonCoinsPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

/** antd 표와 탭을 여러 번 다시 그린다. 느린 기계에서 기본 제한 5초를 넘길 수 있다. */
vi.setConfig({ testTimeout: 20_000 });

/** 이름마다 올라와 있는 매물의 개당 가격. 없는 이름은 매물이 없다. */
const LISTINGS: Record<string, number[]> = {
  '손상된 글라스 기브넨의 깃털': [460_000, 500_000],
  '글라스 기브넨의 심장': [430_000],
  '빛바랜 에너지 회로': [46_790_000],
  '고리아스 동력원': [257_000_000],
};

function renderPage(path = '/dungeon-coins') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <DungeonCoinsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('던전 코인 가치', () => {
  beforeEach(() => {
    // 이름 인덱스 파일은 없는 것으로 둔다. 카테고리로 찾는 그림만 빠진다.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.mocked(fetchAuctionList).mockImplementation(async ({ itemName }) => ({
      auction_item: (LISTINGS[itemName ?? ''] ?? []).map((price) => ({
        item_name: itemName ?? '',
        item_display_name: itemName ?? '',
        item_count: 1,
        auction_item_category: '기타 재료',
        auction_price_per_unit: price,
        date_auction_expire: '',
      })),
      next_cursor: null,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(fetchAuctionList).mockReset();
  });

  it('첫 탭은 탈라 가흐이고, 최저가를 필요한 코인 수로 나눠 가장 이득인 교환품을 위에 둔다', async () => {
    renderPage();

    // 회로 46,790,000 / 35 = 1,336,857. 동력원 257,000,000 / 200 = 1,285,000.
    expect(await screen.findAllByText('1,336,857 G')).not.toHaveLength(0);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('link').textContent).toBe('빛바랜 에너지 회로');
    expect(within(rows[0]).getByText('가장 이득')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1,285,000 G')).toBeInTheDocument();
    expect(within(rows[2]).getAllByText('매물 없음')).not.toHaveLength(0);
  });

  it('탭은 탈라 가흐, 브리 레흐, 글렌 베르나, 크롬 바스, 크롬 바스 심연 순이다', () => {
    renderPage();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '탈라 가흐',
      '브리 레흐',
      '글렌 베르나',
      '크롬 바스',
      '크롬 바스 심연',
    ]);
  });

  it('던전 탭을 바꾸면 그 던전의 교환품 시세를 받는다', async () => {
    renderPage();
    await screen.findAllByText('1,336,857 G');

    fireEvent.click(screen.getByRole('tab', { name: '크롬 바스' }));

    // 깃털 460,000 / 200 = 2,300. 심장 430,000 / 200 = 2,150. 아다만티움은 매물이 없다.
    expect(await screen.findAllByText('2,300 G')).not.toHaveLength(0);
    expect(screen.getByText('2,150 G')).toBeInTheDocument();
    const asked = vi.mocked(fetchAuctionList).mock.calls.map(([params]) => params.itemName);
    expect(asked).toContain('아다만티움');
  });

  it('주소의 던전으로 바로 열고, 교환품 이름은 아이템 정보로 가는 링크다', async () => {
    renderPage('/dungeon-coins?dungeon=crom-bas');

    const link = await screen.findByRole('link', { name: '글라스 기브넨의 심장' });
    expect(link.getAttribute('href')).toBe(
      `/items?category=&name=${encodeURIComponent('글라스 기브넨의 심장')}`,
    );
  });
});
