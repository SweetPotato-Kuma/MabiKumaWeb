import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import { DUCAT_GEM } from '@/features/taltinFarm/data';
import { resetFarmStateCache } from '@/features/taltinFarm/store';
import { CalculatorPage } from '@/pages/CalculatorPages';
import { TaltinFarmPage } from '@/pages/TaltinFarmPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

vi.mock('@/features/market/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  canLookupMarket: () => true,
  useMarketRecentQuery: () => ({ items: {}, isLoading: false, failed: false, updated: null }),
}));

const P = '탈틴 농장 ';

/** 워커가 모아 둔 시세 파일에 든 개당 최저가. 나머지 이름은 매물이 없다. */
const PRICES: Record<string, number> = {
  [`${P}일반 블랙베리`]: 1_000,
  [`${P}일반 재스민`]: 2_000,
  [`${P}블랙베리 주스`]: 5_000,
  [DUCAT_GEM.name]: 70_000,
};

const SLOW = { timeout: 5_000 };

function renderPage(path = '/taltin-farm-calculator', ui = <TaltinFarmPage />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Suspense fallback={null}>{ui}</Suspense>
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

/** 표에서 이름이 든 줄. */
const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('탈틴 농장 계산기', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFarmStateCache();
    vi.stubEnv('VITE_ICON_BASE_URL', 'https://icons.test');
    const now = Date.now();
    const file = {
      at: now,
      prices: Object.fromEntries(
        Object.entries(PRICES).map(([name, price]) => [name, { at: now, offers: [[price, 10]], complete: true }]),
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
    vi.mocked(fetchAuctionList).mockResolvedValue({ auction_item: [], next_cursor: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.mocked(fetchAuctionList).mockReset();
  });

  it('계산기 목록의 경로로 열린다', async () => {
    renderPage('/taltin-farm-calculator', <CalculatorPage id="taltin-farm" />);
    expect(await screen.findByRole('heading', { name: '탈틴 농장 계산기' }, SLOW)).toBeInTheDocument();
  });

  it('주문에 보상을 고르면 물품 값을 빼서 손익을 보이고, 이 브라우저에 남긴다', async () => {
    renderPage();
    const order = '던바튼 학교 선생님의 주문';
    // 블랙베리 7 x 1,000 + 재스민 5 x 2,000. 시험 화면은 좁아 칸을 합친 줄에 적는다.
    expect(await within(rowOf(order)).findByText(/물품 값 17,000 G/, undefined, SLOW)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: `${order} 보상 1` }));
    fireEvent.click(await screen.findByText('생활 협회 열쇠', { selector: '.ant-select-item-option-content' }));

    expect(within(rowOf(order)).getByText(/보상 가치 25,000 G/)).toBeInTheDocument();
    expect(within(rowOf(order)).getByText('+8,000 G')).toBeInTheDocument();
    // 다음 보상 칸이 열린다.
    expect(screen.getByRole('combobox', { name: `${order} 보상 2` })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('mabikuma:taltinFarm') ?? '{}').rewards).toEqual({
      [order]: [{ key: 'key', qty: 1 }],
    });
  });

  it('고정한 주문은 표 맨 위로 올라간다', async () => {
    renderPage();
    const order = '황금 호박 집중 주문';
    fireEvent.click(await screen.findByRole('button', { name: `${order} 위에 고정` }));
    const firstRow = document.querySelector('.ant-table-tbody tr.ant-table-row') as HTMLElement;
    expect(within(firstRow).getByText(order)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${order} 고정 풀기` })).toHaveAttribute('aria-pressed', 'true');
  });

  it('가공 탭은 가공해 더 남는 것부터 보인다', async () => {
    renderPage('/taltin-farm-calculator?tab=craft');
    const firstRow = await vi.waitFor(() => {
      const row = document.querySelector('.ant-table-tbody tr.ant-table-row') as HTMLElement | null;
      if (!row || !within(row).queryByText('+2,000 G')) throw new Error('아직 시세 전');
      return row;
    }, SLOW);
    expect(within(firstRow).getByText('블랙베리 주스')).toBeInTheDocument();
    expect(within(firstRow).getByText('농작물 3,000 G, 가공품 5,000 G')).toBeInTheDocument();
  });

  it('두카트 탭은 티어드롭 젬스톤으로 비율을 채우고, 직접 넣은 비율이 이긴다', async () => {
    renderPage('/taltin-farm-calculator?tab=ducat');
    // 블랙베리 주스 3,500 두카트 x 2 G - 경매장 5,000 G
    expect(await within(await vi.waitFor(() => rowOf('블랙베리 주스'), SLOW)).findByText(/\+2,000 G/, undefined, SLOW)).toBeInTheDocument();
    const input = screen.getByLabelText('두카트 비율');
    expect(input).toHaveValue('2.00');

    fireEvent.change(input, { target: { value: '3' } });
    expect(await within(rowOf('블랙베리 주스')).findByText('+5,500 G')).toBeInTheDocument();
    expect(screen.getByText('직접 넣은 비율')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '시세로 되돌리기' }));
    expect(await within(rowOf('블랙베리 주스')).findByText('+2,000 G')).toBeInTheDocument();
  });

  it('시세 파일에 있는 이름은 경매장에 묻지 않는다', async () => {
    renderPage();
    await within(rowOf('던바튼 학교 선생님의 주문')).findByText(/물품 값 17,000 G/, undefined, SLOW);
    const asked = vi.mocked(fetchAuctionList).mock.calls.map(([params]) => params.itemName);
    expect(asked).not.toContain(`${P}일반 블랙베리`);
    expect(asked).not.toContain(DUCAT_GEM.name);
  });
});
