import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import { CoinSimulatorPage } from '@/pages/CoinSimulatorPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

const STONE = '브리 레흐의 잔흔석';

/** 연출이 끝나 통계가 올라갈 때까지 기다리는 시간. 금빛까지 더해도 넉넉하다. */
const FX_WAIT = 4000;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/coin-simulator']}>
          <CoinSimulatorPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

const latest = () => screen.getByRole('region', { name: /^방금 만든 주화/ });

describe('주화 시뮬레이터', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.mocked(fetchAuctionList).mockImplementation(async ({ itemName }) => ({
      auction_item:
        itemName === STONE
          ? [
              {
                item_name: STONE,
                item_display_name: STONE,
                item_count: 10,
                auction_item_category: '기타',
                auction_price_per_unit: 1_000_000,
                date_auction_expire: '2026-10-30T00:00:00Z',
              },
            ]
          : [],
      next_cursor: null,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // "주화 연출" 끄기는 브라우저에 남는다. 다음 테스트는 켠 채로 시작한다.
    window.localStorage.clear();
  });

  it('던전 탭이 있고, 아직 나오지 않은 던전은 고를 수 없다', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: '브리 레흐' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '탈라 가흐 (준비 중)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('만들면 옵션 세 줄과 점수가 붙고, 연출이 끝나면 잔흔석 세 개 값을 쓴 골드로 센다', async () => {
    renderPage();
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    fireEvent.click(screen.getByRole('button', { name: '만들기' }));
    const region = latest();
    expect(within(region).getByText('최대 대미지')).toBeInTheDocument();
    expect(within(region).getByText('20')).toBeInTheDocument();
    expect(within(region).getByText('3.00%')).toBeInTheDocument();
    expect(within(region).getAllByText('최대')).toHaveLength(3);
    // 20 x 1 + 10 x 6 + 20 x 4 = 160, 물리 토템 만점이다.
    expect(within(region).getByText('160점')).toBeInTheDocument();
    expect(within(region).getByText('95% 이상')).toBeInTheDocument();

    // 연출이 도는 동안에는 통계에 넣지 않는다.
    const statistic = (title: string) =>
      screen
        .getByText(title, { selector: '.ant-statistic-title' })
        .closest('.ant-statistic') as HTMLElement;
    expect(within(statistic('95% 이상')).getByText('0')).toBeInTheDocument();
    expect(
      await within(statistic('95% 이상')).findByText('1', {}, { timeout: FX_WAIT }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/브리 레흐의 잔흔석 최저가/)).toBeInTheDocument();
    expect(within(statistic('쓴 골드')).getByText(/300만|3,000,000/)).toBeInTheDocument();
  });

  it('연출을 끄면 만들자마자 통계에 넣는다', () => {
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: '주화 연출' }));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.click(screen.getByRole('button', { name: '만들기' }));
    // 1 + 6 + 4 = 11점, 만점의 50% 에 못 미쳐 등급이 없다.
    expect(within(latest()).getByText('11점')).toBeInTheDocument();
    const made = screen
      .getByText('만든 주화', { selector: '.ant-statistic-title' })
      .closest('.ant-statistic') as HTMLElement;
    expect(within(made).getByText('1')).toBeInTheDocument();
  });

  it('토템을 바꾸면 그 토템의 옵션으로 만든다', () => {
    renderPage();
    fireEvent.click(screen.getByText('지원'));
    fireEvent.click(screen.getByRole('button', { name: '10번 만들기' }));
    const region = latest();
    expect(within(region).getByText('방금 만든 주화 10개')).toBeInTheDocument();
    expect(within(region).getAllByText('힐링 효과')).toHaveLength(10);
  });
});
