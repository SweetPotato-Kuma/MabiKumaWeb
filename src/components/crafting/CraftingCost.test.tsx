import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { CraftingCost } from '@/components/crafting/CraftingCost';
import { fetchAuctionList } from '@/features/auction/api';
import { buildRecipeBook } from '@/features/crafting/recipes';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

/** 검(1) = 철괴(2) 3개 + 가죽(3) 1개. 철괴는 철광석(5) 2개로 10개씩 나온다. */
const book = buildRecipeBook({
  updated: '2026-09-22',
  skills: [
    { id: 10013, name: '핸디크래프트', count: 1 },
    { id: 10015, name: '제련', count: 1 },
  ],
  items: { 1: ['검', 1], 2: ['철괴', 1], 3: ['가죽', 1], 5: ['철광석', 1] },
  recipes: [
    {
      item: 1,
      skill: 10013,
      rank: 7,
      yield: 1,
      materials: [
        [[2], 3],
        [[3], 1],
      ],
    },
    { item: 2, skill: 10015, rank: 1, yield: 10, materials: [[[5], 2]] },
  ],
});

/** 이름마다 올라와 있는 매물. [개당 가격, 개수]. */
const LISTINGS: Record<string, [number, number][]> = {
  철괴: [[50, 10]],
  가죽: [[400, 5]],
  철광석: [[1, 100]],
};

function renderCost() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CraftingCost book={book} itemId={1} />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('제작 비용', () => {
  beforeEach(() => {
    // 이름 인덱스 파일은 없는 것으로 둔다. 그림과 아이템 정보 링크만 빠진다.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.mocked(fetchAuctionList).mockImplementation(async ({ itemName }) => ({
      auction_item: (LISTINGS[itemName ?? ''] ?? []).map(([price, count]) => ({
        item_name: itemName ?? '',
        item_display_name: itemName ?? '',
        item_count: count,
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

  it('직접 재료의 시세를 받아 총액을 매긴다', async () => {
    renderCost();

    // 철괴 3개 x 50 + 가죽 1개 x 400
    expect(await screen.findAllByText('550 G')).not.toHaveLength(0);
    const asked = vi
      .mocked(fetchAuctionList)
      .mock.calls.map(([params]) => params.itemName)
      .sort();
    // 철광석은 철괴를 펼치기 전까지 묻지 않는다.
    expect(asked).toEqual(['가죽', '철괴']);
  });

  it('재료를 펼치면 하위 재료와 제작했을 때의 값을 보여 준다', async () => {
    renderCost();
    await screen.findAllByText('550 G');

    const tree = screen.getByText('재료 트리').closest('.ant-card') as HTMLElement;
    fireEvent.click(within(tree).getAllByRole('button', { name: /펼치기|Expand row/i })[0]);

    // 철괴 3개 = 10개씩 한 번, 철광석 2개 x 1
    expect(await within(tree).findByText('철광석')).toBeInTheDocument();
    expect(await within(tree).findByText('제작 시 2 G')).toBeInTheDocument();
  });
});
