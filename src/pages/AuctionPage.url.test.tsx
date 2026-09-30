import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { AuctionPage } from '@/pages/AuctionPage';

/** 판매 중 매물 25건. 1번이 가장 비싸고 25번이 가장 싸다. 조회는 이 목록을 그대로 돌려준다. */
const FAKE_ITEMS = Array.from({ length: 25 }, (_, index) => ({
  item_name: `시험 검 ${index + 1}`,
  item_display_name: `시험 검 ${index + 1}`,
  item_count: ((index * 7) % 9) + 1,
  auction_item_category: '검',
  auction_price_per_unit: (25 - index) * 1000,
  date_auction_expire: new Date(Date.now() + (index + 1) * 3_600_000).toISOString(),
}));

vi.mock('@/features/auction/hooks', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAuctionItemsQuery: (_input: unknown, enabled: boolean) => ({
    data: enabled ? { items: FAKE_ITEMS, loadedCount: FAKE_ITEMS.length } : undefined,
    isPending: !enabled,
    error: null,
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: async () => undefined,
  }),
}));

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCanQuery: () => true,
}));

/** 화면 밖에서 주소를 읽고 뒤로 가기를 누르는 손잡이. */
interface Probe {
  search: () => string;
  back: () => void;
}

/**
 * 검색 조건이 주소에 실리고, 주소에서 되살아나는지 본다.
 * 조회는 나가지 않게 fetch 를 막아 둔다. 여기서 보는 것은 주소와 입력칸의 오감이다.
 */
function renderAt(url: string): Probe {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let location = '';
  let goBack = () => {};
  function Watcher() {
    location = useLocation().search;
    const navigate = useNavigate();
    goBack = () => navigate(-1);
    return null;
  }
  render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <Watcher />
          <AuctionPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
  return { search: () => location, back: () => act(() => goBack()) };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// 페이지 전체를 그리는 시험이라 다른 시험과 함께 돌면 기본 5초를 넘기기도 한다.
vi.setConfig({ testTimeout: 30_000 });

describe('경매장 검색 조건과 주소', () => {
  it('주소의 검색어가 입력칸에 채워진다', async () => {
    renderAt('/auction?keyword=소울&category=검');

    expect(await screen.findByDisplayValue('소울')).toBeInTheDocument();
  });

  it('찾기를 누르면 검색어가 주소에 실리고 뒤로 가면 이전 검색으로 돌아간다', async () => {
    const router = renderAt('/auction?keyword=소드');
    const input = await screen.findByPlaceholderText(/아이템명 검색/);

    fireEvent.change(input, { target: { value: '활' } });
    fireEvent.click(screen.getByRole('button', { name: /찾기/ }));

    await waitFor(() => expect(router.search()).toBe('?keyword=%ED%99%9C'));

    router.back();

    expect(router.search()).toBe('?keyword=소드');
    expect(await screen.findByDisplayValue('소드')).toBeInTheDocument();
  });

  it('검색 초기화를 누르면 주소가 비고 입력칸도 빈다', async () => {
    const router = renderAt('/auction?keyword=소드&category=검');
    await screen.findByDisplayValue('소드');

    fireEvent.click(screen.getByRole('button', { name: /검색 초기화/ }));

    await waitFor(() => expect(router.search()).toBe(''));
    expect(screen.getByPlaceholderText(/아이템명 검색/)).toHaveValue('');
  });

  it('잘못된 파라미터로 들어와도 오류 없이 화면이 뜬다', async () => {
    renderAt('/auction?tab=zzz&sort=nope&page=-5&size=7&f=%7Bbroken&category=&keyword=');

    expect(await screen.findByRole('heading', { name: '경매장 조회' })).toBeInTheDocument();
    expect(screen.getByText(/카테고리를 고르거나, 아이템명이나 상세 검색 조건을 넣은 뒤/)).toBeInTheDocument();
  });

  it('거래 내역 탭을 고르면 주소에 실리고 판매 중 매물로 돌아오면 빠진다', async () => {
    const router = renderAt('/auction?keyword=소드');
    await screen.findByRole('tab', { name: '거래 내역' });

    fireEvent.click(screen.getByRole('tab', { name: '거래 내역' }));
    await waitFor(() => expect(router.search()).toContain('tab=history'));

    fireEvent.click(screen.getByRole('tab', { name: '판매 중 매물' }));
    await waitFor(() => expect(router.search()).not.toContain('tab='));
  });

  describe('표의 정렬과 쪽 넘기기', () => {
    /** 표 본문의 이름 열을 위에서부터 읽는다. */
    const firstNames = () =>
      screen
        .getAllByText(/^시험 검 \d+$/)
        .map((node) => node.textContent)
        .slice(0, 3);

    it('주소의 정렬과 쪽 번호가 표에 그대로 나타난다', async () => {
      // 가격이 비싼 순(1번부터)으로 10건씩 나누면 두 번째 쪽은 11번부터다.
      renderAt('/auction?keyword=시험&sort=-price&page=2');

      await screen.findByText('시험 검 11');
      expect(firstNames()[0]).toBe('시험 검 11');
    });

    it('표 머리를 누르면 정렬이 주소에 실리고 쪽은 처음으로 돌아간다', async () => {
      const router = renderAt('/auction?keyword=시험&page=2');
      await screen.findByRole('columnheader', { name: /가격/ });

      fireEvent.click(screen.getByRole('columnheader', { name: /가격/ }));

      await waitFor(() => expect(router.search()).toContain('sort=-price'));
      expect(router.search()).not.toContain('page=');
    });

    it('쪽을 넘기면 주소에 실리고, 첫 쪽으로 돌아오면 주소에서 빠진다', async () => {
      const router = renderAt('/auction?keyword=시험');
      await screen.findByText('시험 검 25');

      fireEvent.click(screen.getByTitle('2'));
      await waitFor(() => expect(router.search()).toContain('page=2'));

      fireEvent.click(screen.getByTitle('1'));
      await waitFor(() => expect(router.search()).not.toContain('page='));
    });
  });
});
