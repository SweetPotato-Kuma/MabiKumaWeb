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
  '마력이 깃든 늑대의 이빨': [1_500_000],
  마력석: [1_000],
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
        item_count: itemName === '마력석' ? 100 : 1,
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

  it('브리 레흐 탭은 가진 구슬로 가공해 팔 때의 차익을 계산한다', async () => {
    // 가공한 이빨(100) = 단단한 늑대의 이빨(구슬 1개) 7 + 마력석 20. 가공한 이빨은 장비(200) 의 재료다.
    const recipes = {
      updated: '2026-09-26',
      skills: [{ id: 10013, name: '핸디크래프트', count: 2 }],
      items: {
        5100329: ['단단한 늑대의 이빨', 1],
        5100360: ['단단한 늑대의 이빨(거래 불가)', 0],
        5100330: ['마력석', 1],
        100: ['마력이 깃든 늑대의 이빨', 1],
        200: ['소울 리버레이트 보우', 1],
      },
      recipes: [
        {
          item: 100,
          skill: 10013,
          rank: 13,
          yield: 1,
          materials: [
            [[5100329, 5100360], 7],
            [[5100330], 20],
          ],
        },
        { item: 200, skill: 10013, rank: 16, yield: 1, materials: [[[100], 24]] },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('recipes.json')
          ? new Response(JSON.stringify(recipes), { status: 200 })
          : new Response('', { status: 404 }),
      ),
    );
    renderPage('/dungeon-coins?dungeon=brie-lech');

    // 교환 가치가 먼저 보이고, 탭 바로 아래 전환 단추로 계산기를 연다.
    expect(screen.queryByLabelText('가진 구슬')).toBeNull();
    fireEvent.click(screen.getByText('가공해 팔기'));

    // 1,500,000 - 마력석 20 x 1,000 = 1,480,000. 구슬 7개로 나누면 211,428.
    expect(await screen.findAllByText('211,428 G')).not.toHaveLength(0);
    expect(screen.getAllByText(/1,480,000 G/)).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: '소울 리버레이트 보우' })).toBeNull();

    fireEvent.change(screen.getByLabelText('가진 구슬'), { target: { value: '15' } });
    expect(await screen.findAllByText('2,960,000 G')).not.toHaveLength(0);
    expect(screen.getByText('14 / 15개')).toBeInTheDocument();
  });

  it('가공 계산기는 주소로 바로 열고, 계산기가 없는 던전에는 전환 단추가 없다', async () => {
    renderPage('/dungeon-coins?dungeon=brie-lech&view=craft');
    expect(await screen.findByText('브리 레흐 구슬로 가공해 팔기')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '탈라 가흐' }));
    expect(await screen.findAllByText('1,336,857 G')).not.toHaveLength(0);
    expect(screen.queryByText('가공해 팔기')).toBeNull();
  });
});
