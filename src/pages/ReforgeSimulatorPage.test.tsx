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

/** 정교한 세공 도구와 기억의 보석만 매물이 있다. */
const PRICES: Record<string, number> = { '정교한 세공 도구': 3_000_000, '기억의 보석': 500_000 };

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

/**
 * 정교한 표에만 있는 옵션(변신 옵션처럼)이 있는 확률표. 한 번 세공에 가장 낮은 레벨이 나오게 하면
 * 대미지밸런스 5/5(최대), 최대 공격력 3/6(최대 아님), 체력 20/20(최대) 이 붙는다.
 */
const FINE_ONLY_DATA: ReforgeData = {
  ...DATA,
  pools: [
    [
      [0, 5, 5],
      [1, 3, 6],
      [2, 20, 20],
    ],
    [
      [0, 5, 5],
      [2, 20, 20],
    ],
  ],
  tables: { 'fine|1|0': 0, 'radiant|1|0': 1, 'brilliant|1|0': 1 },
};

/** 한계 돌파가 되는 옵션만 있는 확률표. 난수를 0 으로 누르면 늘 한계 돌파 구간에 들어간다. */
const LIMIT_BREAK_DATA: ReforgeData = {
  ...DATA,
  pools: [
    [
      [0, 4, 10, 11, 13],
      [1, 4, 10, 11, 13],
      [2, 4, 10, 11, 13],
    ],
  ],
};

let data: ReforgeData = DATA;

/** 연출이 끝나 통계가 올라갈 때까지 기다리는 시간. 가장 긴 도구 연출에 한계 돌파 빛을 더해도 넉넉하다. */
const FX_WAIT = 4000;

describe('세공 시뮬레이터', () => {
  beforeEach(() => {
    data = DATA;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.endsWith('data/reforge.json')) return new Response(JSON.stringify(data));
        return new Response('', { status: 404 });
      }),
    );
    vi.mocked(fetchAuctionList).mockImplementation(async ({ itemName }) => {
      const price = PRICES[itemName ?? ''];
      return {
        auction_item: price
          ? [
              {
                item_name: itemName ?? '',
                item_display_name: itemName ?? '',
                item_count: 1,
                auction_item_category: '기타',
                auction_price_per_unit: price,
                date_auction_expire: '2026-09-30T00:00:00Z',
              },
            ]
          : [],
        next_cursor: null,
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(fetchAuctionList).mockReset();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('세공하면 옵션 세 줄이 붙고 도구 최저가로 쓴 골드를 센다', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '세공하기' }));
    const window = screen.getByRole('region', { name: '세공 창' });
    expect(within(window).getByText('(5/5 레벨 : 5% 증가)')).toBeInTheDocument();
    expect(within(window).getByText('(3/3 레벨 : 6 증가)')).toBeInTheDocument();
    expect(within(window).getByText('(20/20 레벨 : 30 증가)')).toBeInTheDocument();
    // 통계와 기록은 연출이 끝난 뒤에 올라간다. 먼저 올라가면 결과를 미리 알려 버린다.
    expect(screen.getByText('세공 기록 0번')).toBeInTheDocument();
    expect(await screen.findByText('3,000,000 G', {}, { timeout: FX_WAIT })).toBeInTheDocument();
    expect(screen.getByText('세공 기록 1번')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '10번 세공' }));
    expect(screen.getByText('33,000,000 G')).toBeInTheDocument();
  });

  it('끝 레벨은 최대로 강조하고, 세공 기록은 펼쳐야 보인다', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '세공하기' }));
    // 레벨 폭이 한 칸이라 세 줄 모두 끝 레벨이다.
    const window = screen.getByRole('region', { name: '세공 창' });
    expect(within(window).getAllByText('최대')).toHaveLength(3);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByText('세공 기록 1번', {}, { timeout: FX_WAIT }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('기억의 보석은 옵션이 붙은 뒤에 쓸 수 있고, 새 옵션은 적용해야 붙는다', async () => {
    renderPage();
    // 세공할 때마다 작업대를 새로 그려 연출을 다시 돌리므로 보석 칸은 그때그때 찾는다.
    const gem = () => screen.getByRole('button', { name: '기억의 보석 사용' });
    await screen.findByText('도구 0 G, 기억의 보석 0 G');
    expect(gem()).toBeDisabled();

    // 보석을 올리기 전에도 적용 단추와 새 옵션 칸은 자리를 지킨다. 켜고 끌 때 창이 늘고 줄지 않는다.
    expect(screen.getByRole('button', { name: '신규 옵션 적용하기' })).toBeDisabled();
    expect(screen.getByRole('region', { name: '새 옵션' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '세공하기' }));
    expect(gem()).toBeEnabled();
    fireEvent.click(gem());
    expect(gem()).toHaveAttribute('aria-pressed', 'true');
    const apply = screen.getByRole('button', { name: '신규 옵션 적용하기' });
    expect(apply).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '세공하기' }));
    // 도구 둘에 보석 하나.
    expect(await screen.findByText('6,500,000 G', {}, { timeout: FX_WAIT })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '새 옵션' })).toHaveTextContent(
      '(5/5 레벨 : 5% 증가)',
    );
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(screen.getByRole('region', { name: '새 옵션' })).toHaveTextContent('아직 없습니다.');
  });

  it('목표를 고르면 한 번에 붙을 확률을 보이고, 채운 세공에 목표 달성을 붙인다', async () => {
    renderPage();
    // 목표는 세공 창의 목표 옵션 칸에서 고른다. 계산기 창을 열지 않아도 된다.
    fireEvent.click(await screen.findByRole('button', { name: /목표 옵션 추가/ }));
    // 레벨 옆에 그 레벨의 실제 수치를 적는다.
    expect(screen.getByText('5% 증가 이상')).toBeInTheDocument();
    // 옵션이 셋뿐이라 목표 옵션은 늘 붙는다.
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: '세공 횟수별 확률' })).not.toBeInTheDocument();

    // 계산기 창은 고른 목표를 읽어 n 번 세공했을 때의 확률을 센다.
    fireEvent.click(screen.getByRole('button', { name: /특정 세공 기댓값/ }));
    expect(await screen.findByRole('region', { name: '세공 횟수별 확률' })).toHaveTextContent(
      '한 번 이상 나올 확률 100%',
    );

    fireEvent.click(screen.getByRole('button', { name: '목표 나올 때까지' }));
    const window = screen.getByRole('region', { name: '세공 창' });
    expect(within(window).getByText('목표 달성')).toBeInTheDocument();
  });

  it('연출은 세공할 때만 돈다. 끈 채로 세공한 뒤 켜도 지난 세공의 연출은 돌지 않는다', async () => {
    renderPage();
    const reforge = await screen.findByRole('button', { name: '세공하기' });
    fireEvent.click(reforge);
    expect(document.querySelector('.rf-play')).not.toBeNull();

    const toggle = screen.getByRole('switch', { name: '세공 연출' });
    fireEvent.click(toggle);
    expect(document.querySelector('.rf-play')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '세공하기' }));
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(document.querySelector('.rf-play')).toBeNull();
    expect(document.querySelector('.rf-reveal')).toBeNull();
  });

  it('다른 도구의 표에 없는 옵션도 최대가 아니면 최대로 강조하지 않는다', async () => {
    data = FINE_ONLY_DATA;
    renderPage();
    // 옵션은 늘 남은 것 중 첫째, 레벨은 늘 가장 낮은 것.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.click(await screen.findByRole('button', { name: '세공하기' }));
    const window = () => screen.getByRole('region', { name: '세공 창' });
    expect(within(window()).getAllByText('최대')).toHaveLength(2);

    // 찬란한 표에는 최대 공격력이 없다. 그래도 3/6 은 최대가 아니다.
    fireEvent.click(screen.getByText('찬란한'));
    expect(within(window()).getByText('(3/6 레벨 : 6 증가)')).toBeInTheDocument();
    expect(within(window()).getAllByText('최대')).toHaveLength(2);
  });

  it('한계 돌파 줄이 나온 세공에만 번쩍이는 빛이 붙는다', async () => {
    data = LIMIT_BREAK_DATA;
    renderPage();
    const reforge = await screen.findByRole('button', { name: '세공하기' });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    fireEvent.click(reforge);
    expect(document.querySelector('.rf-play')).not.toBeNull();
    expect(document.querySelector('.rf-lb')).toBeNull();

    vi.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.click(screen.getByRole('button', { name: '세공하기' }));
    expect(document.querySelector('.rf-lb')).not.toBeNull();
    expect(document.querySelectorAll('.rf-line--lb')).toHaveLength(3);
  });
});
