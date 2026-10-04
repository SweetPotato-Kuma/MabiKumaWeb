import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type * as Settings from '@/lib/settings';
import type * as MarketApi from '@/features/market/api';
import { fetchAuctionList } from '@/features/auction/api';
import type { AuctionItem, ItemOption } from '@/features/auction/types';
import { readRelicCache, writeRelicCache } from '@/features/relics/hooks';
import { RelicsPage } from '@/pages/RelicsPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));
const SERIES = vi.hoisted(() => ({
  option: '오버 드라이브 폭발 공격 대미지',
  days: 30,
  daily: [
    ['오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', '2026-09-24', 1, 1, 70_000_000, 70_000_000, 70_000_000, 70_000_000],
    ['오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', '2026-09-25', 2, 2, 75_000_000, 78_000_000, 81_000_000, 156_000_000],
  ],
  recent: [
    ['오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 75_000_000, 1, '2026-09-25T03:30:00.000Z'],
    ['오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 81_000_000, 1, '2026-09-25T02:30:00.000Z'],
  ],
  since: '2026-09-23',
  updated: '2026-09-25T03:40:00.000Z',
}));

// 워커의 거래 기록 대신 8레벨의 최종 거래 하나를 돌려준다. 8레벨은 지금 매물이 없다.
vi.mock('@/features/market/api', async (importOriginal) => ({
  ...(await importOriginal<typeof MarketApi>()),
  canLookupMarket: () => true,
  useRelicSeriesQuery: () => ({
    isPending: false,
    error: null,
    data: SERIES,
    dataUpdatedAt: Date.parse('2026-09-25T04:00:00.000Z'),
  }),
  useOptionTradesQuery: () => ({
    isLoading: false,
    data: {
      trades: [
        ['오버 드라이브 폭발 공격 대미지 560% 증가 (최대 700%)', 200_000_000, '2026-09-25T03:00:00.000Z'],
        // 지금 매물이 없는 옵션의 10레벨 최종 거래. 10레벨 합계가 이 값으로 센다.
        ['플레임 버스트 대미지 450% 증가 (최대 450%)', 50_000_000, '2026-09-26T03:00:00.000Z'],
      ],
    },
  }),
}));
// 테스트 환경에는 키도 프록시도 없다. 조회할 수 있는 것으로 두고 넥슨 API 는 위에서 막는다.
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  useCanQuery: () => true,
}));

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

let location = '';
function Watcher() {
  const current = useLocation();
  location = current.pathname + current.search;
  return null;
}

/** 레벨 칸 단추. 가격을 누르면 그 레벨의 거래가 추이 창이 열린다. */
const levelButton = (level: number) =>
  screen.findByRole('button', {
    name: new RegExp(`오버 드라이브 폭발 공격 대미지 ${level}레벨 .*거래가 추이 보기`),
  });

function renderPage(path = '/relics') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Watcher />
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
    // 받은 매물을 이 브라우저에 남긴다. 다음 테스트가 지난 매물로 시작하지 않게 비운다.
    window.localStorage.clear();
  });

  it('지난번에 본 매물을 먼저 보여 주고, 새 매물을 받는 중이라고 알린다', async () => {
    writeRelicCache(Date.now() - 5 * 60_000, PAGES.flat());
    // 새 매물은 끝나지 않는다. 그동안 지난번 것이 보여야 한다.
    vi.mocked(fetchAuctionList).mockImplementation(() => new Promise(() => {}));
    renderPage();

    const cell = await levelButton(7);
    expect(within(cell).getByText('80,000,000')).toBeInTheDocument();
    expect(screen.getByText(/5분 전에 받은 판매 중 매물/)).toBeInTheDocument();
    expect(screen.getByText('새 매물을 받는 중입니다.')).toBeInTheDocument();
  });

  it('새 매물을 다 받으면 다음에 열 때 쓰도록 남긴다', async () => {
    renderPage();
    await levelButton(7);
    expect(screen.queryByText('새 매물을 받는 중입니다.')).toBeNull();
    expect(readRelicCache()?.items).toHaveLength(PAGES.flat().length);
  });

  it('무리아스의 유물을 옵션과 레벨별 최저가로 모으고, 두 단 머리에 레벨 범위를 적는다', async () => {
    renderPage();

    const cell = await levelButton(7);
    // 두 번째 쪽의 8,000만이 첫 쪽의 9,500만보다 싸다.
    expect(within(cell).getByText('80,000,000')).toBeInTheDocument();
    // 같은 칸에 레벨과 매물 수가 있고, 레벨 글자는 그 레벨의 수치(700% 의 10분의 7)를 품는다.
    const line = cell.closest('[role="listitem"]') as HTMLElement;
    expect(within(line).getByTitle('490%')).toHaveTextContent('7레벨');
    expect(within(line).getByText('2건')).toBeInTheDocument();
    expect((await levelButton(10)).textContent).toBe('300,000,000');
    expect(screen.getByText('134,000,000 G')).toBeInTheDocument();
    // 두 단이 어디서 어디까지인지 머리에 적는다.
    expect(screen.getByText('10~6레벨')).toBeInTheDocument();
    expect(screen.getByText('5~1레벨')).toBeInTheDocument();
  });

  it('가격 칸을 누르면 그 레벨의 거래가 추이 창이 열리고, 경매장 매물 보기로 그 레벨 매물에 간다', async () => {
    renderPage();

    fireEvent.click(await levelButton(7));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('오버 드라이브 폭발 공격 대미지')).toBeInTheDocument();
    expect(dialog.getByText('7레벨 490% 증가')).toBeInTheDocument();
    // 지금 최저가와, 거래 기록의 가장 최근 거래가를 함께 적는다.
    expect(dialog.getByText('80,000,000 G')).toBeInTheDocument();
    expect(dialog.getByText('75,000,000 G', { selector: 'strong, .ant-typography' })).toBeInTheDocument();
    expect(dialog.getByRole('img', { name: /7레벨 최근 7일 거래가 그래프/ })).toBeInTheDocument();
    // 최근 거래 목록에 두 건.
    expect(dialog.getAllByRole('row').length).toBeGreaterThanOrEqual(3);

    fireEvent.click(dialog.getByRole('button', { name: /경매장 매물 보기/ }));

    await waitFor(() => expect(location).toContain('/auction'));
    const url = new URL(location, 'https://example.com');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: '유물',
      relic: '오버 드라이브 폭발 공격 대미지',
      relicMin: '7',
      relicMax: '7',
    });
  });

  it('창 안에서 레벨을 옮기면 그 레벨의 값과 경매장 이동이 따라온다', async () => {
    renderPage();
    fireEvent.click(await levelButton(7));
    const dialog = within(await screen.findByRole('dialog'));

    // 테스트 화면은 좁은 화면(폭 조건이 모두 거짓)이라 레벨 고르기가 목록 칸이다.
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: '레벨' }));
    fireEvent.click(await screen.findByTitle('10레벨'));

    expect(await dialog.findByText('10레벨 700% 증가')).toBeInTheDocument();
    expect(dialog.getByText('300,000,000 G')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: /경매장 매물 보기/ }));
    await waitFor(() => expect(location).toContain('relicMin=10'));
  });

  it('매물이 없는 레벨은 최종 거래가를 적고 기록 아이콘을 눌러 설명을 보며, 본전 확률을 센다', async () => {
    renderPage();
    await levelButton(7);

    expect((await levelButton(8)).textContent).toBe('200,000,000');
    // "최종" 글자 대신 아이콘이다. 마우스를 올리지 않아도 눌러서 설명이 열린다(휴대폰).
    const info = screen.getByRole('button', { name: '오버 드라이브 폭발 공격 대미지 8레벨 최종 거래가 설명' });
    fireEvent.click(info);
    expect(await screen.findByText(/최종 거래가 200,000,000 G, 9월 25일/)).toBeInTheDocument();
    expect(screen.queryByText('최종')).toBeNull();
    // 매물도 거래 기록도 없는 레벨은 기록이 없다고 적는다.
    expect(screen.getAllByText('기록 없음')).toHaveLength(7);

    // 값을 아는 결과는 10레벨 3억, 8레벨 2억(최종 거래가), 7레벨 8,000만 셋이다.
    // 이데아 1억 3,400만 이상은 둘이라 66.7%.
    expect(screen.getByText('본전 확률')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
  });

  it('낮은 레벨이 더 높은 레벨보다 비싸면 값을 낮추고 사기 위험을 알린다', async () => {
    vi.mocked(fetchAuctionList).mockImplementation(async ({ category }) => ({
      auction_item:
        category === '유물'
          ? [
              // 1레벨 10억, 2레벨 천만 원. 1레벨 값은 믿을 수 없다.
              murias('오버 드라이브 폭발 공격 대미지 70% 증가 (최대 700%)', 1_000_000_000),
              murias('오버 드라이브 폭발 공격 대미지 140% 증가 (최대 700%)', 10_000_000),
            ]
          : [],
      next_cursor: null,
    }));
    renderPage();

    const one = await levelButton(1);
    expect(one.textContent).toBe('10,000,000');
    fireEvent.click(screen.getByRole('button', { name: '오버 드라이브 폭발 공격 대미지 1레벨 사기 위험 설명' }));
    expect(await screen.findByText(/\(사기 위험\) 실제 최저가는 1,000,000,000 G/)).toBeInTheDocument();
    // 2레벨 값은 그대로이고 경고도 없다.
    expect(screen.queryByRole('button', { name: '오버 드라이브 폭발 공격 대미지 2레벨 사기 위험 설명' })).toBeNull();
  });

  it('아르카나 제목 옆에 10레벨 합계를 적는다', async () => {
    renderPage();
    await levelButton(7);

    // 10레벨 매물이 있는 옵션은 오버 드라이브 하나(3억).
    expect(screen.getByText('10레벨 합계 300,000,000 G')).toBeInTheDocument();
  });

  it('10레벨 매물이 없는 옵션은 최종 거래가로 세어 합계에 넣고, 몇 종 기준인지는 적지 않는다', async () => {
    vi.mocked(fetchAuctionList).mockImplementation(async ({ category }) => ({
      auction_item:
        category === '유물'
          ? [
              // 플레임 버스트는 3레벨 매물만 있다. 10레벨은 최종 거래가 5천만으로 센다.
              murias('플레임 버스트 대미지 135% 증가 (최대 450%)', 9_000_000),
              murias('오버 드라이브 폭발 공격 대미지 700% 증가 (최대 700%)', 300_000_000),
            ]
          : [],
      next_cursor: null,
    }));
    renderPage();
    await levelButton(10);

    expect(screen.getByText('10레벨 합계 50,000,000 G')).toBeInTheDocument();
    expect(screen.getByText('10레벨 합계 300,000,000 G')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+종/)).toBeNull();
  });

  it('아르카나 이름 옆에 옵션 수와 매물 수를 한 줄로 잇는다', async () => {
    renderPage();
    await levelButton(7);

    const counts = screen.getByText(/옵션 1종, 매물 3건/);
    const name = counts.parentElement?.querySelector('.ant-typography strong, strong');
    // 이름과 같은 줄(같은 부모)에 있다. 이름 아래 줄이 아니다.
    expect(counts.parentElement).toContainElement(within(counts.parentElement as HTMLElement).getByText('블래스트 랜서'));
    expect(name).toBeTruthy();
  });

  it('매물 있는 것만 보기를 켜면 매물 없는 레벨이 숨고 주소에 남는다', async () => {
    renderPage();
    await levelButton(7);
    expect(screen.getAllByText('기록 없음')).toHaveLength(7);

    fireEvent.click(screen.getByRole('switch', { name: '매물 있는 것만 보기' }));

    await waitFor(() => expect(screen.queryAllByText('기록 없음')).toHaveLength(0));
    expect(location).toContain('listed=1');
    // 매물이 있는 레벨은 그대로이고, 8레벨 최종 거래가(매물 없음)는 숨는다.
    expect(await levelButton(7)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /8레벨 .*거래가 추이 보기/ })).toBeNull();
  });

  it('그 밖의 유물은 일반, 특급, 이데아로 나눠 보여 준다', async () => {
    renderPage();
    await levelButton(7);

    fireEvent.click(screen.getByRole('tab', { name: '그 밖의 유물' }));

    const special = await screen.findByRole('link', { name: '와드네 특급 매물 보기' });
    expect(special).toHaveTextContent('32,000,000 G');
    expect(screen.getByRole('link', { name: '와드네 이데아 매물 보기' })).toHaveTextContent(
      '215,000 G',
    );
    expect(screen.queryByRole('link', { name: '와드네 일반 매물 보기' })).toBeNull();
  });

  it('옵션을 아르카나로 묶고, 아르카나를 고르면 그 아르카나만 보인다', async () => {
    renderPage();
    await levelButton(7);

    // 매물이 있는 아르카나만 묶음과 단추가 생긴다. 알케믹 스팅어는 매물이 없다.
    expect(screen.getAllByText('블래스트 랜서').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: /알케믹 스팅어/ })).toBeNull();
    const lancer = screen.getByRole('button', { name: /블래스트 랜서/ });
    expect(screen.getByText(/옵션 1종, 매물 3건/)).toBeInTheDocument();

    fireEvent.click(lancer);
    expect(lancer).toHaveAttribute('aria-pressed', 'true');
    expect(await levelButton(10)).toBeInTheDocument();
  });

  it('스킬 이름으로 줄을 좁힌다', async () => {
    renderPage();
    await levelButton(7);

    fireEvent.change(screen.getByLabelText('스킬 이름으로 좁히기'), { target: { value: '플레임' } });

    expect(await screen.findByText(/"플레임" 이 들어간 옵션이 없습니다/)).toBeInTheDocument();
  });
});
