import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import { emptyColorChannel, emptyColorChannels } from '@/features/colorChannels';
import { defaultParts } from '@/features/bags/searchParams';
import { addBagWatch, getBagWatches, resetBagWatchesForTest } from '@/features/bags/watches';
import { BagsPage } from '@/pages/BagsPage';

const search = vi.fn();

/** 울프 1채널, 상인 한 명이 빨간 감자 주머니와 파란 밀 주머니를 판다. */
const done = {
  server: '울프',
  status: 'done' as const,
  done: 1,
  total: 1,
  channels: [
    {
      server: '울프',
      channel: 1,
      nextUpdate: new Date(Date.now() + 10 * 60_000).toISOString(),
      npcs: [
        {
          npc: '상인 라누',
          bags: [
            { n: '튼튼한 밀 주머니', c: ['0000ff'], p: 1000, t: '골드' },
            { n: '튼튼한 감자 주머니', c: ['ff0000'], p: 2000, t: '골드' },
          ],
        },
      ],
    },
  ],
  failedChannels: [],
  nextUpdate: Date.now() + 10 * 60_000,
};

vi.mock('@/features/bags/useBagSearch', () => ({
  useBagSearch: () => ({ state: done, search }),
}));
vi.mock('@/features/bags/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  canSearchBags: () => true,
}));
vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

function renderPage(url = '/bags?server=울프') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <BagsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

/** 파트 A 의 빨강이 200 이상. */
const reddish = () => ({
  bags: [],
  parts: [
    {
      enabled: true,
      channels: { ...emptyColorChannels(), r: { ...emptyColorChannel(), min: 200 } },
    },
    ...defaultParts().slice(1),
  ],
});

const cardNames = () =>
  within(screen.getByRole('list', { name: '주머니 목록' }))
    .getAllByRole('listitem')
    .map((card) => card.textContent ?? '');

describe('튼튼한 주머니 NPC 상점과 경매장 탭', () => {
  beforeEach(() => {
    resetBagWatchesForTest();
    search.mockClear();
    vi.mocked(fetchAuctionList).mockResolvedValue({
      auction_item: [
        {
          item_name: '튼튼한 감자 주머니',
          item_display_name: '튼튼한 감자 주머니',
          item_count: 1,
          auction_item_category: '주머니',
          auction_price_per_unit: 5_000_000,
          date_auction_expire: new Date(Date.now() + 3 * 3_600_000).toISOString(),
          item_option: [
            { option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '255,0,0' },
          ],
        },
      ],
      next_cursor: null,
    });
  });

  afterEach(() => resetBagWatchesForTest());

  it('들어오면 고른 서버를 바로 찾고, NPC 상점 탭이 먼저 열린다', () => {
    renderPage();
    expect(search).toHaveBeenCalledWith('울프');
    expect(screen.getByRole('tab', { name: 'NPC 상점' })).toHaveAttribute('aria-selected', 'true');
    expect(cardNames()).toHaveLength(2);
  });

  it('경매장 탭은 경매장 주머니를 받아 남은 시간과 함께 보여 준다', async () => {
    renderPage('/bags?server=울프&tab=auction');
    expect(screen.getByRole('tab', { name: '경매장' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/남은 시간 \d+시간/)).toBeInTheDocument();
    expect(vi.mocked(fetchAuctionList)).toHaveBeenCalledWith(
      expect.objectContaining({ category: '주머니' }),
      expect.anything(),
    );
    // 경매장은 서버를 가리지 않아 서버 칸이 없다.
    expect(screen.queryByText('서버', { selector: 'span' })).toBeNull();
  });

  it('관심 조건에 맞는 주머니는 관심 표시가 붙고 맨 위로 올라오며, 조건마다 맞는 수가 나온다', async () => {
    addBagWatch('붉은 주머니', reddish());
    renderPage();
    // 감자(빨강)가 밀보다 비싸지만 관심 주머니라 맨 위다.
    const [first, second] = cardNames();
    expect(first).toMatch(/관심.*감자/);
    expect(second).toMatch(/밀/);
    expect(second).not.toMatch(/관심/);
    expect(await screen.findByText('NPC 1개, 경매장 1개')).toBeInTheDocument();
  });

  it('지금 조건을 이름을 붙여 저장하고, 저장한 조건을 다시 불러온다', async () => {
    renderPage('/bags?server=울프&a=r200-');
    fireEvent.click(screen.getByRole('button', { name: /지금 조건 저장/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '붉은 주머니' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await screen.findByText('붉은 주머니')).toBeInTheDocument();
    expect(getBagWatches()).toHaveLength(1);

    // 조건을 지운 뒤 관심 조건의 보기를 누르면 그 조건이 돌아온다.
    fireEvent.click(screen.getByRole('button', { name: '파트 A 조건 지우기' }));
    expect(cardNames()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '보기' }));
    expect(cardNames()).toHaveLength(1);
  });
});
