import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { CraftingCost } from '@/components/crafting/CraftingCost';
import { fetchAuctionList } from '@/features/auction/api';
import { buildRecipeBook } from '@/features/crafting/recipes';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

/** 트리를 펼치며 antd 표와 선택 칸을 여러 번 다시 그린다. 느린 기계에서 기본 제한 5초를 넘길 수 있다. */
vi.setConfig({ testTimeout: 20_000 });

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
  '순도 높은 힘의 결정': [[10000, 5]],
  '깨어난 힘의 정수': [[100, 100]],
};

function renderCost(target = book) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CraftingCost book={target} recipes={target.recipesOf(1)} />
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

    const tree = screen.getByText('제작 비용').closest('.ant-card') as HTMLElement;
    fireEvent.click(within(tree).getAllByRole('button', { name: /펼치기|Expand row/i })[0]);

    // 철괴 3개 = 10개씩 한 번, 철광석 2개 x 1
    expect(await within(tree).findByText('철광석')).toBeInTheDocument();
    expect(await within(tree).findByText('제작 시 2 G')).toBeInTheDocument();
  });

  it('코인 상점에서 파는 재료는 코인으로 사기를 고르면 필요한 코인에 넣는다', async () => {
    // 빛바랜 에너지 회로는 탈라 가흐 구슬 35개, 철괴는 코인 상점에 없다.
    const coinBook = buildRecipeBook({
      updated: '2026-09-22',
      skills: [{ id: 10013, name: '핸디크래프트', count: 1 }],
      items: { 1: ['검', 1], 2: ['철괴', 1], 3: ['빛바랜 에너지 회로', 1] },
      recipes: [
        {
          item: 1,
          skill: 10013,
          rank: 7,
          yield: 1,
          materials: [
            [[2], 3],
            [[3], 2],
          ],
        },
      ],
    });
    renderCost(coinBook);

    const box = await screen.findByRole('checkbox', { name: '탈라 가흐 구슬 70개로 구매' });
    expect(screen.getAllByRole('checkbox', { name: /로 구매/ })).toHaveLength(1);
    const stat = () =>
      screen.getByText('필요한 탈라 가흐 구슬').closest('.ant-statistic') as HTMLElement;
    expect(within(stat()).getByText('0개')).toBeInTheDocument();

    fireEvent.click(box);

    expect(await within(stat()).findByText('70개')).toBeInTheDocument();
    expect(screen.getByText('코인 구매')).toBeInTheDocument();
    // 코인으로 산 재료의 시세가 없으면 개당 가치는 계산하지 않는다.
    expect(screen.getByText('탈라 가흐 구슬 개당 가치')).toBeInTheDocument();
  });

  it('사기로 둔 재료를 펼쳐 그 아래 재료를 코인으로 고르면 윗줄이 제작으로 바뀌어 코인에 들어간다', async () => {
    const nested = buildRecipeBook({
      updated: '2026-09-22',
      skills: [{ id: 10013, name: '핸디크래프트', count: 1 }],
      items: { 1: ['검', 1], 2: ['철괴', 1], 3: ['빛바랜 에너지 회로', 1] },
      recipes: [
        { item: 1, skill: 10013, rank: 7, yield: 1, materials: [[[2], 3]] },
        { item: 2, skill: 10013, rank: 1, yield: 1, materials: [[[3], 2]] },
      ],
    });
    renderCost(nested);
    await screen.findAllByText('150 G');

    const tree = screen.getByText('제작 비용').closest('.ant-card') as HTMLElement;
    fireEvent.click(within(tree).getAllByRole('button', { name: /펼치기|Expand row/i })[0]);
    fireEvent.click(await within(tree).findByRole('checkbox', { name: /로 구매/ }));

    const stat = () =>
      screen.getByText('필요한 탈라 가흐 구슬').closest('.ant-statistic') as HTMLElement;
    expect(await within(stat()).findByText('210개')).toBeInTheDocument();
    expect(within(tree).getByText(/^제작:/)).toBeInTheDocument();
    // 아래에서 코인으로 살 수 있는 재료를 모두 골랐으므로 윗줄의 만들기 칸도 켜진다.
    expect(within(tree).getByRole('checkbox', { name: /로 만들기/ })).toBeChecked();
  });

  it('구슬로 만들 수 있는 하위 재료는 한 코인의 개수만 보여 주고, 고르면 코인 합계에 넣는다', async () => {
    // 결정 1개 = 가죽 3개 + 정수 20개(거래 불가 판과 같은 재료). 정수는 브리 레흐 구슬 5개 또는 심연의 증표 10개.
    const beadBook = buildRecipeBook({
      updated: '2026-09-22',
      skills: [{ id: 10013, name: '핸디크래프트', count: 1 }],
      items: {
        1: ['검', 1],
        2: ['순도 높은 힘의 결정', 1],
        3: ['가죽', 1],
        4: ['깨어난 힘의 정수', 1],
        5: ['깨어난 힘의 정수(거래 불가)', 0],
      },
      recipes: [
        { item: 1, skill: 10013, rank: 7, yield: 1, materials: [[[2], 1]] },
        {
          item: 2,
          skill: 10013,
          rank: 1,
          yield: 1,
          materials: [
            [[3], 3],
            [[4, 5], 20],
          ],
        },
      ],
    });
    renderCost(beadBook);

    expect(await screen.findByText('브리 레흐 구슬 100개로 만들기')).toBeInTheDocument();
    // 한 코인으로만 센다. 추천이나 설명 줄은 두지 않는다.
    expect(screen.queryByText(/심연의 증표/)).not.toBeInTheDocument();
    expect(screen.queryByText(/추천|절약|대체/)).not.toBeInTheDocument();
    // 켜기 전에도 합계 칸은 0개로 자리를 잡고 있다.
    const before = screen.getByText('필요한 브리 레흐 구슬');
    expect(
      within(before.closest('.ant-statistic') as HTMLElement).getByText('0개'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /로 만들기/ }));

    const title = await screen.findByText('필요한 브리 레흐 구슬');
    expect(
      within(title.closest('.ant-statistic') as HTMLElement).getByText('100개'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/필요한 심연의 증표/)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /로 만들기/ })).toBeChecked();

    // 끄면 합계도 0개로 돌아간다.
    fireEvent.click(screen.getByRole('checkbox', { name: /로 만들기/ }));
    expect(
      await within(
        screen.getByText('필요한 브리 레흐 구슬').closest('.ant-statistic') as HTMLElement,
      ).findByText('0개'),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /로 만들기/ })).not.toBeChecked();
  });

  it('아래에서 코인으로 살 수 있는 재료를 모두 고르면 윗줄의 만들기 칸도 켜지고, 끄면 아래도 꺼진다', async () => {
    const beadBook = buildRecipeBook({
      updated: '2026-09-22',
      skills: [{ id: 10013, name: '핸디크래프트', count: 1 }],
      items: {
        1: ['검', 1],
        2: ['순도 높은 힘의 결정', 1],
        3: ['가죽', 1],
        4: ['깨어난 힘의 정수', 1],
      },
      recipes: [
        { item: 1, skill: 10013, rank: 7, yield: 1, materials: [[[2], 1]] },
        {
          item: 2,
          skill: 10013,
          rank: 1,
          yield: 1,
          materials: [
            [[3], 3],
            [[4], 20],
          ],
        },
      ],
    });
    renderCost(beadBook);
    const tree = (await screen.findByText('제작 비용')).closest('.ant-card') as HTMLElement;
    expect(await within(tree).findByRole('checkbox', { name: /로 만들기/ })).not.toBeChecked();

    fireEvent.click(within(tree).getAllByRole('button', { name: /펼치기|Expand row/i })[0]);
    fireEvent.click(await within(tree).findByRole('checkbox', { name: /로 구매/ }));

    await waitFor(() =>
      expect(within(tree).getByRole('checkbox', { name: /로 만들기/ })).toBeChecked(),
    );

    fireEvent.click(within(tree).getByRole('checkbox', { name: /로 만들기/ }));
    await waitFor(() =>
      expect(within(tree).getByRole('checkbox', { name: /로 구매/ })).not.toBeChecked(),
    );
    expect(within(tree).getByRole('checkbox', { name: /로 만들기/ })).not.toBeChecked();
  });

  it('재료 이름은 그 재료의 아이템 정보로 가는 링크다', async () => {
    renderCost();
    await screen.findAllByText('550 G');

    const tree = screen.getByText('제작 비용').closest('.ant-card') as HTMLElement;
    fireEvent.click(within(tree).getAllByRole('button', { name: /펼치기|Expand row/i })[0]);

    const link = await within(tree).findByRole('link', { name: '철광석' });
    expect(link.getAttribute('href')).toBe('/item/철광석');
  });
});
