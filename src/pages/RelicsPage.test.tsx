import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type * as Settings from '@/lib/settings';
import type * as MarketApi from '@/features/market/api';
import { fetchAuctionList } from '@/features/auction/api';
import type { AuctionItem, ItemOption } from '@/features/auction/types';
import { RelicsPage } from '@/pages/RelicsPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));
// 워커의 거래 기록 대신 8레벨의 최종 거래 하나를 돌려준다. 8레벨은 지금 매물이 없다.
vi.mock('@/features/market/api', async (importOriginal) => ({
  ...(await importOriginal<typeof MarketApi>()),
  useOptionTradesQuery: () => ({
    isLoading: false,
    data: {
      trades: [
        ['오버 드라이브 폭발 공격 대미지 560% 증가 (최대 700%)', 200_000_000, '2026-09-25T03:00:00.000Z'],
      ],
    },
  }),
}));
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

/** 게임 데이터에서 뽑아 둔 아르카나 파일(public/data/arcana.json)의 일부. */
const ARCANA_DATA = {
  updated: '2026-09-22',
  arcanas: [
    {
      id: 4,
      name: '알케믹 스팅어',
      awakening: 59066,
      skills: [{ id: 59060, name: '플레임 버스트' }],
    },
    {
      id: 6,
      name: '블래스트 랜서',
      awakening: 59107,
      skills: [{ id: 59105, name: '오버 드라이브' }],
    },
  ],
};

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
    // 아르카나 파일만 있고 그림 목록과 이름 사전은 없는 것으로 둔다.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('data/arcana.json')
          ? new Response(JSON.stringify(ARCANA_DATA))
          : new Response('', { status: 404 }),
      ),
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
    expect(within(cell).getByText('8,000만')).toBeInTheDocument();
    expect(cell).toHaveAttribute('title', '80,000,000 G');
    // 같은 칸에 레벨과 매물 수가 있고, 레벨 글자는 그 레벨의 수치(700% 의 10분의 7)를 품는다.
    const line = cell.closest('[role="listitem"]') as HTMLElement;
    expect(within(line).getByTitle('490%')).toHaveTextContent('7레벨');
    expect(within(line).getByText('2건')).toBeInTheDocument();
    const url = new URL(cell.getAttribute('href') ?? '', 'https://example.com');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: '유물',
      relic: '오버 드라이브 폭발 공격 대미지',
      relicMin: '7',
      relicMax: '7',
    });
    expect(
      screen.getByRole('link', { name: '오버 드라이브 폭발 공격 대미지 10레벨 매물 보기' }),
    ).toHaveTextContent('3억');
    expect(screen.getByText('134,000,000 G')).toBeInTheDocument();
  });

  it('매물이 없는 레벨은 최종 거래가를 한 줄로 적고, 본전 확률을 센다', async () => {
    renderPage();
    await screen.findByRole('link', { name: '오버 드라이브 폭발 공격 대미지 7레벨 매물 보기' });

    const [eight, mark] = screen.getAllByTitle('최종 거래가 200,000,000 G, 9월 25일');
    expect(eight).toHaveTextContent('2억');
    expect(mark).toHaveTextContent('최종');
    // 매물도 거래 기록도 없는 레벨은 기록이 없다고 적는다.
    expect(screen.getAllByText('기록 없음')).toHaveLength(7);

    // 값을 아는 결과는 10레벨 3억, 8레벨 2억(최종 거래가), 7레벨 8,000만 셋이다.
    // 이데아 1억 3,400만 이상은 둘이라 66.7%.
    expect(screen.getByText('본전 확률')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByLabelText(/값을 아는 3가지 중 2가지/)).toBeInTheDocument();
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

  it('옵션을 아르카나로 묶고, 아르카나를 고르면 그 아르카나만 보인다', async () => {
    renderPage();
    await screen.findByRole('link', { name: '오버 드라이브 폭발 공격 대미지 7레벨 매물 보기' });

    // 매물이 있는 아르카나만 묶음과 단추가 생긴다. 알케믹 스팅어는 매물이 없다.
    expect(screen.getAllByText('블래스트 랜서').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: /알케믹 스팅어/ })).toBeNull();
    const lancer = screen.getByRole('button', { name: /블래스트 랜서/ });
    expect(screen.getByText(/옵션 1종, 매물 3건/)).toBeInTheDocument();

    fireEvent.click(lancer);
    expect(lancer).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('link', { name: '오버 드라이브 폭발 공격 대미지 10레벨 매물 보기' }),
    ).toBeInTheDocument();
  });

  it('스킬 이름으로 줄을 좁힌다', async () => {
    renderPage();
    await screen.findByRole('link', { name: '오버 드라이브 폭발 공격 대미지 7레벨 매물 보기' });

    fireEvent.change(screen.getByLabelText('스킬 이름으로 좁히기'), { target: { value: '플레임' } });

    expect(await screen.findByText(/"플레임" 이 들어간 옵션이 없습니다/)).toBeInTheDocument();
  });
});
