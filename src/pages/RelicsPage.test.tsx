import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type * as Settings from '@/lib/settings';
import { fetchAuctionList } from '@/features/auction/api';
import type { AuctionItem, ItemOption } from '@/features/auction/types';
import { RelicsPage } from '@/pages/RelicsPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));
// 테스트 환경에는 키도 프록시도 없다. 조회할 수 있는 것으로 두고 넥슨 API 는 위에서 막는다.
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  useCanQuery: () => true,
}));

/** antd 표와 탭을 여러 번 다시 그린다. 느린 기계에서 기본 제한 5초를 넘길 수 있다. */
vi.setConfig({ testTimeout: 20_000 });

const listing = (item_name: string, price: number, item_option: ItemOption[] | null = null) =>
  ({
    item_name,
    item_display_name: item_name,
    item_count: 1,
    auction_item_category: '유물',
    auction_price_per_unit: price,
    date_auction_expire: '2026-09-28T22:55:00.000Z',
    item_option,
  }) as AuctionItem;

const murias = (value: string, price: number) =>
  listing('무리아스의 유물', price, [
    { option_type: '무리아스 유물', option_value: value },
    { option_type: '전용 해제 거래 보증서 사용 불가', option_value: 'true' },
  ]);

/** 두 쪽으로 나눠 온다. 두 번째 쪽까지 받아야 가장 싼 값이 맞는다. */
const PAGES: AuctionItem[][] = [
  [
    murias('오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 95_000_000),
    murias('오버 드라이브 폭발 공격 대미지 700% 증가 (최대 700%)', 300_000_000),
    listing('무리아스의 유물(이데아)', 134_000_000),
    listing('와드네(특급)', 32_000_000),
  ],
  [
    murias('오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 80_000_000),
    listing('와드네(이데아)', 215_000),
  ],
];

function renderPage(path = '/relics') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <RelicsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('유물 시세', () => {
  beforeEach(() => {
    // 그림 목록과 이름 사전은 없는 것으로 둔다.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.mocked(fetchAuctionList).mockImplementation(async ({ category, cursor }) => {
      const index = cursor ? Number(cursor) : 0;
      return {
        auction_item: category === '유물' ? PAGES[index] : [],
        next_cursor: category === '유물' && index + 1 < PAGES.length ? String(index + 1) : null,
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(fetchAuctionList).mockReset();
  });

  it('무리아스의 유물을 옵션과 레벨별 최저가로 모으고, 칸을 누르면 그 레벨 매물로 간다', async () => {
    renderPage();

    const cell = await screen.findByRole('link', {
      name: '오버 드라이브 폭발 공격 대미지 7레벨 매물 보기',
    });
    // 두 번째 쪽의 8,000만이 첫 쪽의 9,500만보다 싸다.
    expect(within(cell).getByText('8,000만 G')).toBeInTheDocument();
    expect(within(cell).getByText('2건')).toBeInTheDocument();
    const url = new URL(cell.getAttribute('href') ?? '', 'https://example.com');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: '유물',
      relic: '오버 드라이브 폭발 공격 대미지',
      relicMin: '7',
      relicMax: '7',
    });
    expect(
      screen.getByRole('link', { name: '오버 드라이브 폭발 공격 대미지 10레벨 매물 보기' }),
    ).toHaveTextContent('3억 G');
    expect(screen.getByText('134,000,000 G')).toBeInTheDocument();
  });

  it('그 밖의 유물은 일반, 특급, 이데아로 나눠 보여 준다', async () => {
    renderPage();
    await screen.findByRole('link', { name: '오버 드라이브 폭발 공격 대미지 7레벨 매물 보기' });

    fireEvent.click(screen.getByRole('tab', { name: '그 밖의 유물' }));

    const special = await screen.findByRole('link', { name: '와드네 특급 매물 보기' });
    expect(special).toHaveTextContent('3,200만 G');
    expect(screen.getByRole('link', { name: '와드네 이데아 매물 보기' })).toHaveTextContent(
      '22만 G',
    );
    expect(screen.queryByRole('link', { name: '와드네 일반 매물 보기' })).toBeNull();
  });

  it('스킬 이름으로 줄을 좁힌다', async () => {
    renderPage();
    await screen.findByRole('link', { name: '오버 드라이브 폭발 공격 대미지 7레벨 매물 보기' });

    fireEvent.change(screen.getByLabelText('스킬 이름으로 좁히기'), { target: { value: '플레임' } });

    expect(await screen.findByText(/"플레임" 이 들어간 옵션이 없습니다/)).toBeInTheDocument();
  });
});
