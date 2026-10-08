import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import { EchostoneSimulatorPage } from '@/pages/EchostoneSimulatorPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/echostone-simulator']}>
          <EchostoneSimulatorPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

const statistic = (title: string) =>
  screen
    .getByText(title, { selector: '.ant-statistic-title' })
    .closest('.ant-statistic') as HTMLElement;

describe('에코스톤 각성 시뮬레이터', () => {
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

  it('각성하면 능력이 붙고, 연출이 끝난 뒤 고른 각성제 개수가 쌓인다. 연출을 끄면 바로 쌓인다', async () => {
    window.localStorage.removeItem('mabikuma:echostoneFx');
    renderPage();
    const region = screen.getByRole('region', { name: '에코스톤 각성' });
    expect(within(region).getByText('각성 전')).toBeInTheDocument();
    fireEvent.click(within(region).getByRole('button', { name: /^각성$/ }));
    expect(within(region).queryByText('각성 전')).toBeNull();
    expect(within(region).getByRole('region', { name: '각성 능력' })).toHaveTextContent(
      /최대 \d+레벨/,
    );
    // 연출이 도는 동안에는 숫자가 판보다 앞서 가지 않는다.
    expect(within(statistic('각성')).getByText('0')).toBeInTheDocument();
    await waitFor(() => expect(within(statistic('각성')).getByText('1')).toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(within(statistic('일반')).getByText('1')).toBeInTheDocument();

    fireEvent.click(within(region).getByRole('switch', { name: '에코스톤 연출' }));
    expect(window.localStorage.getItem('mabikuma:echostoneFx')).toBe('off');
    fireEvent.click(within(region).getByRole('button', { name: /^각성$/ }));
    expect(within(statistic('각성')).getByText('2')).toBeInTheDocument();
    window.localStorage.removeItem('mabikuma:echostoneFx');
  });

  it('나오는 능력 표에서 목표로 고르면 한 번에 나올 확률과 목표까지 돌리기가 생긴다', () => {
    renderPage();
    const region = screen.getByRole('region', { name: '에코스톤 각성' });
    const auto = within(region).getByRole('button', { name: '목표까지 최대 1,000번' });
    expect(auto).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: /목표로$/ })[0]);
    expect(within(region).getByText(/한 번에/)).toBeInTheDocument();
    expect(auto).toBeEnabled();
    fireEvent.click(auto);
    expect(within(region).getByRole('status')).toHaveTextContent(/목표 능력이 나/);
  });
});
