import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import type { ReforgeData } from '@/features/reforge/data';
import { ReforgeSimulatorPage } from '@/pages/ReforgeSimulatorPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

/** antd 표를 여러 번 다시 그린다. 느린 기계에서 기본 제한 5초를 넘길 수 있다. */
vi.setConfig({ testTimeout: 20_000 });

/** 옵션이 셋뿐이고 레벨 폭이 한 칸이라 세공 결과가 늘 같다. */
const DATA: ReforgeData = {
  tools: [
    { id: 'fine', name: '정교한 세공 도구', date: '20260723', limitBreakRate: 0.001 },
    { id: 'radiant', name: '영롱한 세공 도구', date: '20260723', limitBreakRate: 0.001 },
    { id: 'brilliant', name: '찬란한 세공 도구', date: '20260723', limitBreakRate: 0.0015 },
  ],
  races: ['공용', '인간/엘프', '인간/자이언트', '인간', '엘프', '자이언트'],
  types: [
    { id: 1, name: '한손 검' },
    { id: 23, name: '모자' },
  ],
  options: [
    '대미지밸런스(1레벨 당 1 % 증가)',
    '최대 공격력(1레벨 당 2 증가)',
    '체력(1레벨 당 1.5 증가)',
  ],
  pools: [
    [
      [0, 5, 5],
      [1, 3, 3],
      [2, 20, 20],
    ],
  ],
  tables: { 'fine|1|0': 0, 'fine|23|0': 0, 'radiant|1|0': 0, 'brilliant|1|0': 0 },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/reforge-simulator']}>
          <ReforgeSimulatorPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('세공 시뮬레이터', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.endsWith('data/reforge.json')) return new Response(JSON.stringify(DATA));
        return new Response('', { status: 404 });
      }),
    );
    // 정교한 세공 도구만 매물이 있다.
    vi.mocked(fetchAuctionList).mockImplementation(async ({ itemName }) => ({
      auction_item:
        itemName === '정교한 세공 도구'
          ? [
              {
                item_name: itemName,
                item_display_name: itemName,
                item_count: 1,
                auction_item_category: '기타',
                auction_price_per_unit: 3_000_000,
                date_auction_expire: '2026-09-30T00:00:00Z',
              },
            ]
          : [],
      next_cursor: null,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(fetchAuctionList).mockReset();
    vi.restoreAllMocks();
  });

  it('세공하면 옵션 세 줄이 붙고 도구 최저가로 쓴 골드를 센다', async () => {
    renderPage();
    const drawOnce = await screen.findByRole('button', { name: '1번 세공' });
    await screen.findByText('경매장 최저가입니다. 게임 데이터는 평균 10분 지연됩니다.');

    fireEvent.click(drawOnce);
    const latest = screen.getByRole('region', { name: '방금 나온 세공' });
    expect(within(latest).getByText('5% 증가')).toBeInTheDocument();
    expect(within(latest).getByText('6 증가')).toBeInTheDocument();
    expect(within(latest).getByText('30 증가')).toBeInTheDocument();
    expect(screen.getByText('300만 G')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '10번 세공' }));
    expect(screen.getByText('3,300만 G')).toBeInTheDocument();
  });

  it('도구 값을 고쳐 넣으면 그 값으로 다시 센다', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '1번 세공' }));
    fireEvent.change(screen.getByLabelText('정교한 세공 도구 한 개 값'), {
      target: { value: '5,000,000' },
    });
    expect(await screen.findByText('500만 G')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '최저가로 되돌리기' })).toBeInTheDocument();
  });

  it('목표를 고르면 한 번에 붙을 확률을 보이고, 채운 세공에 목표 달성을 붙인다', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /목표 옵션 추가/ }));
    // 옵션이 셋뿐이라 목표 옵션은 늘 붙는다.
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '목표 나올 때까지' }));
    const latest = screen.getByRole('region', { name: '방금 나온 세공' });
    expect(within(latest).getByText('목표 달성')).toBeInTheDocument();
  });
});
