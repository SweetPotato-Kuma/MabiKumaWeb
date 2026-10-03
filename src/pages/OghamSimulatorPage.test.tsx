import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import { OghamSimulatorPage } from '@/pages/OghamSimulatorPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

vi.setConfig({ testTimeout: 20_000 });

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/ogham-simulator']}>
          <OghamSimulatorPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

const statistic = (title: string) =>
  screen
    .getByText(title, { selector: '.ant-statistic-title' })
    .closest('.ant-statistic') as HTMLElement;

describe('오검 워드 옵션 시뮬레이터', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.mocked(fetchAuctionList).mockResolvedValue({ auction_item: [], next_cursor: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('빈 칸에 워드를 넣고 재설정하면 세 줄이 붙고 비용이 쌓인다', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '1번 칸 비어 있음' }));
    const picker = await screen.findByRole('dialog');
    fireEvent.click(within(picker).getByRole('button', { name: '베헤, 아르카나 옵션' }));

    const panel = screen.getByRole('region', { name: '고른 워드' });
    expect(within(panel).getAllByText('재설정 전')).toHaveLength(3);
    fireEvent.click(within(panel).getByRole('button', { name: '재설정' }));
    expect(within(panel).queryByText('재설정 전')).toBeNull();
    expect(within(statistic('재설정')).getByText('1')).toBeInTheDocument();
    expect(within(statistic('오검 파편')).getByText('1')).toBeInTheDocument();

    // 한 줄을 잠그면 다음 재설정은 불타래가 든다.
    fireEvent.click(within(panel).getByRole('button', { name: '1번째 줄 잠그기' }));
    fireEvent.click(within(panel).getByRole('button', { name: '재설정' }));
    expect(within(statistic('불타래')).getByText('1')).toBeInTheDocument();
    expect(within(statistic('오검 파편')).getByText('4')).toBeInTheDocument();
  });

  it('조합 워드를 한 번에 넣으면 가운데에 조합이 발동한다', () => {
    renderPage();
    expect(screen.getByRole('status', { name: '발동한 조합 없음' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '빈 칸에 넣기' })[0]);
    expect(
      screen.getByRole('status', { name: /^발동한 조합 라이트닝 스매시 뇌신/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1번 칸 베헤' })).toBeInTheDocument();
  });

  it('목표 옵션을 고르면 한 번에 나올 확률을 보여 준다', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '1번 칸 비어 있음' }));
    const picker = await screen.findByRole('dialog');
    fireEvent.click(within(picker).getByRole('button', { name: '콜' }));
    const panel = screen.getByRole('region', { name: '고른 워드' });
    fireEvent.mouseDown(within(panel).getByRole('combobox', { name: '목표 옵션' }));
    fireEvent.click(await screen.findByTitle('스매시 대미지 배율 증가 (최대 20)'));
    expect(within(panel).getByRole('button', { name: '목표 옵션 기댓값' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '목표까지 최대 1,000번' })).toBeEnabled();
  });
});
