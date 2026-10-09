import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import { buildNameIndex, itemNameIndexQueryOptions } from '@/features/auction/nameIndex';
import { buildRecipeBook, recipeBookQueryOptions } from '@/features/crafting/recipes';
import { resetMemoCache } from '@/features/materialMemo/store';
import { MaterialMemoPage } from '@/pages/MaterialMemoPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

/** 검(1) = 철괴(2) 3개 + 가죽(3) 1개. 철괴는 철광석(5) 2개로 10개씩 나온다. */
const book = buildRecipeBook({
  updated: '2026-10-01',
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

/** 아이템 사전의 이름 목록. 제작법 데이터에 없는 '오래된 지팡이' 는 제작하지 않는 아이템이다. */
const nameIndex = buildNameIndex({
  updated: '2026-10-01',
  categories: ['무기'],
  items: [
    ['검', 0],
    ['오래된 지팡이', 0],
  ],
});

/** 이름마다 올라와 있는 매물. [개당 가격, 개수]. */
const LISTINGS: Record<string, [number, number][]> = {
  검: [[700, 1]],
  철괴: [[50, 10]],
  가죽: [[400, 5]],
  철광석: [[1, 100]],
  '오래된 지팡이': [[1000, 5]],
  '빛바랜 에너지 회로': [[1000, 10]],
};

function renderPage(target = book, names = nameIndex) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(recipeBookQueryOptions.queryKey, target);
  queryClient.setQueryData(itemNameIndexQueryOptions.queryKey, names);
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/materials-calculator']}>
          <MaterialMemoPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

function addGoal(name: string, quantity?: number) {
  fireEvent.change(screen.getByLabelText('목표 아이템'), { target: { value: name } });
  if (quantity !== undefined)
    fireEvent.change(screen.getByLabelText('목표 개수'), { target: { value: String(quantity) } });
  fireEvent.click(screen.getByRole('button', { name: /추가/ }));
}

/** 줄의 구매 방법 상자에서 고른다. */
function chooseMethod(itemName: string, option: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: `${itemName} 구매 방법` }));
  fireEvent.click(screen.getByText(option, { selector: '.ant-select-item-option-content' }));
}

describe('목표 아이템 재료 메모 화면', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetMemoCache();
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
    vi.mocked(fetchAuctionList).mockReset();
  });

  it('목표가 없으면 빈 상태를 보이고, 이름이 맞기 전에는 추가할 수 없다', () => {
    renderPage();
    expect(screen.getByText('목표 아이템을 추가하면 재료 트리가 나옵니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /추가/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('목표 아이템'), { target: { value: '없는 아이템' } });
    expect(screen.getByRole('button', { name: /추가/ })).toBeDisabled();
  });

  it('제작하지 않는 아이템도 목표가 되고, 사는 값으로 필요 금액이 나온다', async () => {
    renderPage();
    addGoal('오래된 지팡이', 3);

    expect(screen.getByLabelText('오래된 지팡이 목표 개수')).toHaveValue('3');
    // 1,000 G x 3
    expect(await screen.findAllByText('3,000 G')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /펼치기|Expand row/i })).not.toBeInTheDocument();
  });

  it('제작하는 아이템은 재료를 펼쳐 구하는 방법을 고르고, 가진 개수만큼 금액이 준다', async () => {
    renderPage();
    addGoal('검');

    // 기본은 경매장 구매다. 검 최저가 700 G.
    expect(await screen.findAllByText('700 G')).not.toHaveLength(0);

    chooseMethod('검', '제작: 핸디크래프트 9랭크');
    // 철괴 3개 x 50 + 가죽 1개 x 400
    expect(await screen.findAllByText('550 G')).not.toHaveLength(0);
    expect(await screen.findByLabelText('철괴 가진 개수')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('철괴 가진 개수'), { target: { value: '3' } });
    expect(await screen.findAllByText('400 G')).not.toHaveLength(0);
    expect(screen.getAllByText('완료')).not.toHaveLength(0);
  });

  it('전체 재료는 기본으로 접혀 있고, 펼치면 전체 개수와 가진 개수만 보인다', async () => {
    renderPage();
    addGoal('검', 2);
    chooseMethod('검', '제작: 핸디크래프트 9랭크');
    fireEvent.change(await screen.findByLabelText('철괴 가진 개수'), { target: { value: '4' } });

    const header = screen.getByRole('button', { name: /전체 재료/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('전체 개수')).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByText('전체 개수').closest('.ant-collapse') as HTMLElement;
    // 검 2개 = 철괴 6개(4개 보유) + 가죽 2개. 시세 열은 없다.
    const rows = within(panel).getAllByRole('row');
    expect(within(rows[1]).getByText('철괴')).toBeInTheDocument();
    expect(within(rows[1]).getByText('6')).toBeInTheDocument();
    expect(within(rows[1]).getByText('4')).toBeInTheDocument();
    expect(within(rows[2]).getByText('가죽')).toBeInTheDocument();
    expect(within(rows[2]).getByText('2')).toBeInTheDocument();
    expect(within(panel).queryByText('개당 최저가')).not.toBeInTheDocument();
    expect(within(header).getByText('2종')).toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('목표의 현재 개수를 적으면 모자란 만큼만 값을 센다', async () => {
    renderPage();
    addGoal('오래된 지팡이', 3);
    await screen.findAllByText('3,000 G');

    fireEvent.change(screen.getByLabelText('오래된 지팡이 가진 개수'), { target: { value: '1' } });
    expect(await screen.findAllByText('2,000 G')).not.toHaveLength(0);
  });

  it('여러 목표를 두고 하나만 지울 수 있다', () => {
    renderPage();
    addGoal('오래된 지팡이', 1);
    addGoal('검', 1);
    expect(screen.getByLabelText('오래된 지팡이 목표 개수')).toBeInTheDocument();
    expect(screen.getByLabelText('검 목표 개수')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '검 목표 삭제' }));
    expect(screen.queryByLabelText('검 목표 개수')).not.toBeInTheDocument();
    expect(screen.getByLabelText('오래된 지팡이 목표 개수')).toBeInTheDocument();
  });

  it('저장된 목표와 가진 개수는 다시 열어도 그대로 보인다', () => {
    const first = renderPage();
    addGoal('오래된 지팡이', 4);
    fireEvent.change(screen.getByLabelText('오래된 지팡이 가진 개수'), { target: { value: '2' } });
    first.unmount();
    resetMemoCache();

    renderPage();
    expect(screen.getByLabelText('오래된 지팡이 목표 개수')).toHaveValue('4');
    expect(screen.getByLabelText('오래된 지팡이 가진 개수')).toHaveValue('2');
  });

  it('코인 상점에서 파는 아이템은 코인으로 사기를 고르면 필요한 코인 개수가 나온다', async () => {
    // 빛바랜 에너지 회로는 탈라 가흐 구슬 35개에 판다. 제작법에는 나오지 않는 아이템이다.
    const coinBook = buildRecipeBook({
      updated: '2026-10-01',
      skills: [{ id: 10013, name: '핸디크래프트', count: 1 }],
      items: { 3: ['빛바랜 에너지 회로', 1] },
      recipes: [],
    });
    renderPage(
      coinBook,
      buildNameIndex({
        updated: '2026-10-01',
        categories: ['기타'],
        items: [['빛바랜 에너지 회로', 0]],
      }),
    );
    addGoal('빛바랜 에너지 회로', 2);

    const box = await screen.findByRole('checkbox', { name: '탈라 가흐 구슬 70개로 구매' });
    const need = () =>
      screen.getByText('필요한 탈라 가흐 구슬').closest('.ant-statistic') as HTMLElement;
    expect(within(need()).getByText('0개')).toBeInTheDocument();
    // 구슬을 고르기 전에는 경매장 값이다. 1,000 G x 2
    expect(await screen.findAllByText('2,000 G')).not.toHaveLength(0);

    fireEvent.click(box);
    expect(await within(need()).findByText('70개')).toBeInTheDocument();
    // 코인으로 사면 골드는 들지 않고, 코인 없이 산다면 그대로 2,000 G 다.
    const goldOnly = screen.getByText('코인 없이 산다면').closest('.ant-statistic') as HTMLElement;
    expect(within(goldOnly).getByText('2,000 G')).toBeInTheDocument();
  });

  it('제작법 데이터가 없으면 오류를 보인다', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(recipeBookQueryOptions.queryKey, null);
    render(
      <AppProviders>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <MaterialMemoPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProviders>,
    );
    expect(within(document.body).getByText('제작법 데이터를 받지 못했습니다')).toBeInTheDocument();
  });
});
