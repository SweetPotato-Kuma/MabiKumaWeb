import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import { resetInventoryCache } from '@/features/dungeonCoins/inventory';
import { DungeonCoinsPage } from '@/pages/DungeonCoinsPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

/** 최근 24시간 거래 통계. 시험마다 바꾼다. 조회할 수 없는 상태(프록시 없음)도 흉내 낸다. */
const market = vi.hoisted(() => ({
  available: true,
  state: { items: {} as Record<string, unknown>, isLoading: false, failed: false, updated: null as string | null },
}));
vi.mock('@/features/market/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  canLookupMarket: () => market.available,
  useMarketRecentQuery: () => market.state,
}));

/** antd 표와 탭을 여러 번 다시 그린다. 느린 기계에서 기본 제한 5초를 넘길 수 있다. */
vi.setConfig({ testTimeout: 20_000 });

/** 이름마다 올라와 있는 매물의 개당 가격. 없는 이름은 매물이 없다. */
const LISTINGS: Record<string, number[]> = {
  '손상된 글라스 기브넨의 깃털': [460_000, 500_000],
  '글라스 기브넨의 심장': [430_000],
  '빛바랜 에너지 회로': [46_790_000],
  '고리아스 동력원': [257_000_000],
  '마력이 깃든 늑대의 이빨': [1_500_000],
  '거친 마력 가루': [1_000],
  '단단한 늑대의 이빨': [150_000],
};

/** 한 매물에 여러 개씩 올라오는 재료. 나머지는 한 매물에 하나다. */
const BULK = new Set(['거친 마력 가루', '단단한 늑대의 이빨']);

/** 가공한 이빨(100) = 단단한 늑대의 이빨(구슬 1개) 7 + 거친 마력 가루 20. 가공한 이빨은 장비(200) 의 재료다. */
const BRIE_RECIPES = {
  updated: '2026-09-26',
  skills: [{ id: 10013, name: '핸디크래프트', count: 2 }],
  items: {
    5100329: ['단단한 늑대의 이빨', 1],
    5100360: ['단단한 늑대의 이빨(거래 불가)', 0],
    300: ['거친 마력 가루', 1],
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
        [[300], 20],
      ],
    },
    { item: 200, skill: 10013, rank: 16, yield: 1, materials: [[[100], 24]] },
  ],
};

/**
 * 제작법을 읽고 표를 다시 그리는 기다림. 전체 테스트를 한꺼번에 돌리면 기본 1초를 넘길 때가 있다.
 */
const SLOW = { timeout: 5_000 };

/** 제작법 파일만 돌려주고 나머지는 없는 것으로 둔다. */
function stubRecipes() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('recipes.json')
        ? new Response(JSON.stringify(BRIE_RECIPES), { status: 200 })
        : new Response('', { status: 404 }),
    ),
  );
}

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
    window.localStorage.clear();
    resetInventoryCache();
    // 이름 인덱스 파일은 없는 것으로 둔다. 카테고리로 찾는 그림만 빠진다.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.mocked(fetchAuctionList).mockImplementation(async ({ itemName }) => ({
      auction_item: (LISTINGS[itemName ?? ''] ?? []).map((price) => ({
        item_name: itemName ?? '',
        item_display_name: itemName ?? '',
        item_count: BULK.has(itemName ?? '') ? 100 : 1,
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
      '/item/글라스_기브넨의_심장',
    );
  });

  it('브리 레흐 탭은 가진 구슬로 가공해 팔 때의 차익을 계산한다', async () => {
    stubRecipes();
    renderPage('/dungeon-coins?dungeon=brie-lech');

    // 교환 가치가 먼저 보이고, 탭 바로 아래 전환 단추로 계산기를 연다.
    expect(screen.queryByLabelText('가진 구슬')).toBeNull();
    fireEvent.click(screen.getByText('가공해 팔기'));

    // 1,500,000 - 거친 마력 가루 20 x 1,000 = 1,480,000. 구슬 7개로 나누면 211,428.
    expect(await screen.findAllByText('211,428 G', {}, SLOW)).not.toHaveLength(0);
    expect(screen.getAllByText(/1,480,000 G/)).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: '소울 리버레이트 보우' })).toBeNull();
    // 가공 이득: 1,480,000 - 원재료(이빨 7개 x 150,000) = 430,000
    expect(screen.getAllByText(/430,000 G/)).not.toHaveLength(0);

    // 입력하기 전에는 결과 대신 무엇을 넣으면 되는지 알려 준다.
    expect(screen.getByText(/가진 구슬 수를 입력하면/)).toBeInTheDocument();
    expect(screen.getByLabelText('가진 구슬')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('가진 구슬'), { target: { value: '15' } });
    expect(await screen.findAllByText('2,960,000 G', {}, SLOW)).not.toHaveLength(0);
    expect(screen.getByText('14 / 15개')).toBeInTheDocument();
    // 무엇을 몇 번 만들지는 표의 추천 줄이 말한다.
    expect(screen.getAllByText(/2번 제작/)).not.toHaveLength(0);
    expect(screen.queryByText(/가진 구슬 수를 입력하면/)).toBeNull();
  });

  it('가공 계산기는 주소로 바로 열고, 계산기가 없는 던전에는 전환 단추가 없다', async () => {
    renderPage('/dungeon-coins?dungeon=brie-lech&view=craft');
    expect(await screen.findByText('브리 레흐 구슬로 가공해 팔기')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '탈라 가흐' }));
    expect(await screen.findAllByText('1,336,857 G')).not.toHaveLength(0);
    expect(screen.queryByText('가공해 팔기')).toBeNull();
  });

  it('워커가 모아 둔 시세 파일이 있으면 경매장에 이름마다 묻지 않는다', async () => {
    vi.stubEnv('VITE_ICON_BASE_URL', 'https://icons.test');
    const now = Date.now();
    const file = {
      at: now,
      prices: Object.fromEntries(
        ['빛바랜 에너지 회로', '고리아스 동력원'].map((name) => [
          name,
          { at: now, offers: [[name === '고리아스 동력원' ? 257_000_000 : 46_790_000, 1]], complete: true },
        ]),
      ),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url) === 'https://icons.test/prices/dungeon-coins.js'
          ? new Response(JSON.stringify(file), { status: 200 })
          : new Response('', { status: 404 }),
      ),
    );
    renderPage();

    expect(await screen.findAllByText('1,336,857 G')).not.toHaveLength(0);
    expect(screen.getByText(/시세는 방금 모은 값입니다/)).toBeInTheDocument();
    // 파일에 있는 두 이름은 묻지 않고, 없는 이름만 경매장에 묻는다.
    const asked = vi.mocked(fetchAuctionList).mock.calls.map(([params]) => params.itemName);
    expect(asked).not.toContain('빛바랜 에너지 회로');
    expect(asked).not.toContain('고리아스 동력원');
    expect(asked).toContain('달아오른 광두정');
    vi.unstubAllEnvs();
  });

  it('가진 재료를 넣으면 그만큼 구슬과 살 재료를 빼고, 이 브라우저에 남긴다', async () => {
    stubRecipes();
    renderPage('/dungeon-coins?dungeon=brie-lech&view=craft');
    expect(await screen.findAllByText('211,428 G', {}, SLOW)).not.toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /가진 재료/ }));
    const dialog = await screen.findByRole('dialog', {}, SLOW);
    // 구슬로 교환해 둔 이빨 7개: 구슬 없이 한 번 만들 수 있다.
    fireEvent.change(within(dialog).getByLabelText('단단한 늑대의 이빨 가진 개수'), {
      target: { value: '7' },
    });
    // 가진 구슬을 넣지 않아도 가진 재료로 만들 수 있는 만큼을 추천한다.
    expect(await screen.findAllByText(/1번 제작/, {}, SLOW)).not.toHaveLength(0);
    expect(screen.getAllByText(/가진 재료로 1번/)).not.toHaveLength(0);
    expect(screen.getAllByText('추천')).not.toHaveLength(0);
    // 표의 1회 값은 가진 재료를 빼지 않은 그대로다.
    expect(screen.getAllByText('211,428 G')).not.toHaveLength(0);

    // 추천된 줄을 펼치면 추천대로 만들 때 쓰는 재료가 나온다. 가진 이빨 7개로 채워 구슬은 들지 않는다.
    const closeButtons = within(dialog).getAllByRole('button', { name: '닫기' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    fireEvent.click(screen.getAllByRole('button', { name: /펼치기|Expand row/i })[0]);
    expect(await screen.findByText('추천대로 1번 만들 때 드는 재료')).toBeInTheDocument();
    expect(screen.getByText('가진 것 7개, 구슬 0개')).toBeInTheDocument();
    expect(screen.getByText('0 / 0개')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('mabikuma:dungeonCoins:inventory:brie-lech')!)).toEqual({
      5100329: 7,
    });

    fireEvent.click(screen.getByRole('button', { name: /가진 재료/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '초기화' }));
    expect(window.localStorage.getItem('mabikuma:dungeonCoins:inventory:brie-lech')).toBeNull();
    expect(await screen.findByText(/가진 구슬 수를 입력하면/)).toBeInTheDocument();
  }, 60_000); // 창을 열고 닫고 표를 여러 번 다시 그린다. 느린 기계에서 20초를 넘길 수 있다.
});

describe('던전 코인 거래가와 거래량', () => {
  /** 회로 46,790,000 / 35 = 1,336,857(최저가). 동력원 257,000,000 / 200 = 1,285,000. */
  const recent = (mid: number, qty: number) => ({ n: 4, qty, lo: mid, hi: mid, mid, avg: mid, last: '2026-10-01T00:00:00Z' });

  /** 넓은 화면(표가 열로 늘어선다)으로 그린다. jsdom 기본은 좁은 화면이다. */
  function wideScreen() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  beforeEach(() => {
    window.localStorage.clear();
    resetInventoryCache();
    market.available = true;
    market.state = {
      items: {
        // 거래가 기준 35,000,000 / 35 = 1,000,000. 24시간에 5개뿐이라 거래 적음이다.
        '빛바랜 에너지 회로': recent(35_000_000, 5),
        // 240,000,000 / 200 = 1,200,000. 300개 거래됐다.
        '고리아스 동력원': recent(240_000_000, 300),
      },
      isLoading: false,
      failed: false,
      updated: new Date(Date.now() - 8 * 60_000).toISOString(),
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
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

  const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement;

  it('모든 교환품에 거래가 기준 코인당 가치와 24시간 거래량 열이 있다', async () => {
    wideScreen();
    renderPage();
    await screen.findAllByText('1,336,857 G');

    expect(screen.getByRole('columnheader', { name: '최저가 기준 코인당 가치' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '거래가 기준 코인당 가치' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '24시간 거래량' })).toBeInTheDocument();
    expect(within(rowOf('고리아스 동력원')).getByText('1,200,000 G')).toBeInTheDocument();
    expect(within(rowOf('고리아스 동력원')).getByText('300개')).toBeInTheDocument();
    // 거래가 없었던 교환품은 그렇게 적는다.
    // 거래가 기준 열과 거래량 열 둘 다 그렇게 적는다.
    expect(within(rowOf('순도 높은 실리엔 섬유 다발')).getAllByText('거래 없음')).toHaveLength(2);
  });

  it('24시간 거래량이 20개 미만인 교환품에 거래 적음 배지가 붙는다', async () => {
    wideScreen();
    renderPage();
    await screen.findAllByText('1,336,857 G');

    expect(within(rowOf('빛바랜 에너지 회로')).getByText('거래 적음')).toBeInTheDocument();
    expect(within(rowOf('고리아스 동력원')).queryByText('거래 적음')).toBeNull();
  });

  it('기본은 최저가 기준이고, 거래가 기준으로 바꾸면 줄 순서와 가장 이득이 바뀐다', async () => {
    wideScreen();
    renderPage();
    await screen.findAllByText('1,336,857 G');

    expect(within(screen.getAllByRole('row')[1]).getByRole('link').textContent).toBe('빛바랜 에너지 회로');
    expect(within(rowOf('빛바랜 에너지 회로')).getByText('가장 이득')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '거래가 기준' }));

    await screen.findAllByText('1,200,000 G');
    expect(within(screen.getAllByRole('row')[1]).getByRole('link').textContent).toBe('고리아스 동력원');
    expect(within(rowOf('고리아스 동력원')).getByText('가장 이득')).toBeInTheDocument();
    expect(within(rowOf('빛바랜 에너지 회로')).queryByText('가장 이득')).toBeNull();
  });

  it('거래 적음 제외를 켜면 가장 이득이 거래 적음이 아닌 줄로 넘어간다', async () => {
    wideScreen();
    renderPage();
    await screen.findAllByText('1,336,857 G');

    fireEvent.click(screen.getByRole('checkbox', { name: /거래 적음\(20개 미만\)은 가장 이득에서 제외/ }));

    expect(within(rowOf('고리아스 동력원')).getByText('가장 이득')).toBeInTheDocument();
    expect(within(rowOf('빛바랜 에너지 회로')).queryByText('가장 이득')).toBeNull();
    // 줄 순서는 그대로다.
    expect(within(screen.getAllByRole('row')[1]).getByRole('link').textContent).toBe('빛바랜 에너지 회로');
  });

  it('보유 코인을 넣으면 교환품마다 몇 개를 살 수 있는지와 예상 판매액을 보여 준다', async () => {
    wideScreen();
    renderPage();
    await screen.findAllByText('1,336,857 G');

    fireEvent.change(screen.getByLabelText('보유 코인'), { target: { value: '400' } });

    // 회로 35개 → 11개(385), 예상 46,790,000 x 11. 동력원 200개 → 2개, 257,000,000 x 2.
    expect(within(rowOf('빛바랜 에너지 회로')).getByText('11개 교환')).toBeInTheDocument();
    expect(within(rowOf('빛바랜 에너지 회로')).getByText('예상 514,690,000 G')).toBeInTheDocument();
    expect(within(rowOf('고리아스 동력원')).getByText('2개 교환')).toBeInTheDocument();
    expect(within(rowOf('고리아스 동력원')).getByText('예상 514,000,000 G')).toBeInTheDocument();
  });

  it('보유 코인으로 모자라면 코인 부족이라고 적는다', async () => {
    wideScreen();
    renderPage();
    await screen.findAllByText('1,336,857 G');

    fireEvent.change(screen.getByLabelText('보유 코인'), { target: { value: '10' } });

    expect(within(rowOf('빛바랜 에너지 회로')).getByText('코인 부족')).toBeInTheDocument();
  });

  it('표 아래에 거래가의 기준 기간과 갱신 시각을 적는다', async () => {
    renderPage();
    await screen.findAllByText('1,336,857 G');

    expect(screen.getByText(/거래가는 최근 24시간 기준, 8분 전에 갱신\./)).toBeInTheDocument();
  });

  it('좁은 화면에서는 열을 늘리지 않고 이름 아래 줄에 거래가와 거래량을 적는다', async () => {
    renderPage();
    await screen.findAllByText('1,336,857 G');

    expect(screen.queryByRole('columnheader', { name: '24시간 거래량' })).toBeNull();
    expect(within(rowOf('고리아스 동력원')).getByText('거래가 기준 1,200,000 G · 24시간 300개')).toBeInTheDocument();
  });

  it('거래 기록을 조회할 수 없으면 거래 적음으로 치지 않고 모른다고 둔다', async () => {
    market.available = false;
    market.state = { items: {}, isLoading: false, failed: false, updated: null };
    wideScreen();
    renderPage();
    await screen.findAllByText('1,336,857 G');

    expect(screen.queryByText('거래 적음')).toBeNull();
    expect(screen.queryByText('거래 없음')).toBeNull();
    expect(screen.queryByText(/거래가는 최근 24시간 기준/)).toBeNull();
  });

  it('거래 기록을 받지 못해도 거래 적음으로 치지 않는다', async () => {
    market.state = { items: {}, isLoading: false, failed: true, updated: null };
    wideScreen();
    renderPage();
    await screen.findAllByText('1,336,857 G');

    expect(screen.queryByText('거래 적음')).toBeNull();
    expect(screen.queryByText('거래 없음')).toBeNull();
  });
});
