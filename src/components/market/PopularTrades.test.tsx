import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/AppProviders';
import { PopularTrades } from '@/components/market/PopularTrades';
import type { PopularResponse, PopularRow } from '@/features/market/api';
import type * as Settings from '@/lib/settings';

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://worker.test',
}));

const row = (name: string, n: number, total: number, avg: number | null, category = '음식'): PopularRow => ({
  name,
  category,
  n,
  qty: n,
  total,
  avg,
});

const many = (count: number): PopularRow[] =>
  Array.from({ length: count }, (_, index) => row(`아이템 ${index + 1}`, 100 - index, 1000 * (100 - index), 1000));

function body(overrides: Partial<PopularResponse> = {}): PopularResponse {
  return {
    window: '24h',
    from: '2026-10-01T03:00:00.000Z',
    to: '2026-10-02T03:00:00.000Z',
    partial: false,
    byCount: [row('낙지', 231, 915_000, 3962), row('깨어난 힘의 정수', 133, 192_000_000, 1_450_000, '기타')],
    byTotal: [row('깨어난 힘의 정수', 133, 192_000_000, 1_450_000, '기타'), row('낙지', 231, 915_000, 3962)],
    since: '2026-09-23',
    updated: '2026-10-02T02:55:00.000Z',
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubPopular(data: PopularResponse | Response) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes('/market/popular')) return Response.json({});
    return data instanceof Response ? data : Response.json({ ...data, window: new URL(url).searchParams.get('window') });
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderChart(onSearch: (name: string) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppProviders>
        <MemoryRouter>
          <PopularTrades onSearch={onSearch} />
        </MemoryRouter>
      </AppProviders>
    </QueryClientProvider>,
  );
}

const popularCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).includes('/market/popular'));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('인기 거래 아이템', () => {
  it('접어 둔 채로는 서버에 묻지 않고, 펼치면 순위를 보여 준다', async () => {
    stubPopular(body());
    renderChart();

    expect(popularCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));

    expect(await screen.findByText('낙지')).toBeInTheDocument();
    expect(popularCalls()).toHaveLength(1);
    expect(String(popularCalls()[0][0])).toContain('window=24h');
    expect(screen.getByRole('button', { name: '인기 거래 아이템 접기' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('펼침 상태를 기억해 다음에 열어 둔다', async () => {
    stubPopular(body());
    const first = renderChart();
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));
    await screen.findByText('낙지');
    first.unmount();

    renderChart();

    expect(await screen.findByText('낙지')).toBeInTheDocument();
  });

  it('거래 횟수 순위와 총 거래 금액 순위를 오간다', async () => {
    stubPopular(body());
    renderChart();
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));
    await screen.findByText('낙지');

    const names = () =>
      screen.getAllByRole('link').map((link) => link.textContent);
    expect(names()).toEqual(['낙지', '깨어난 힘의 정수']);
    expect(screen.getByText(/231회/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('총 거래 금액'));

    await waitFor(() => expect(names()).toEqual(['깨어난 힘의 정수', '낙지']));
  });

  it('기간을 바꾸면 그 기간을 묻는다', async () => {
    stubPopular(body());
    renderChart();
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));
    await screen.findByText('낙지');

    fireEvent.click(screen.getByText('7일'));

    await waitFor(() => expect(popularCalls().some(([input]) => String(input).includes('window=7d'))).toBe(true));
  });

  it('집계 기간과 수집 시각을 적고, 기록을 늦게 모았으면 그 날부터라고 밝힌다', async () => {
    stubPopular(body({ partial: true }));
    renderChart();
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));

    const line = await screen.findByText(/집계 .* ~ .*\(한국 시각\)/);
    expect(line.textContent).toContain('마지막 수집');
    expect(line.textContent).toContain('기록은 2026-09-23부터 모았습니다');
  });

  it('평균을 알 수 없는 줄은 0 골드로 적지 않는다', async () => {
    stubPopular(body({ byCount: [row('깨진 줄', 50, 1_310_000, null)] }));
    renderChart();
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));

    expect(await screen.findByText(/50회/)).toBeInTheDocument();
    expect(screen.queryByText(/개당 평균/)).toBeNull();
  });

  it('처음에는 10위까지만 보이고 단추로 나머지를 본다', async () => {
    stubPopular(body({ byCount: many(30) }));
    renderChart();
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));
    await screen.findByText('아이템 1');

    expect(screen.queryByText('아이템 11')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '30위까지 보기' }));

    expect(screen.getByText('아이템 30')).toBeInTheDocument();
  });

  it('줄의 검색 단추는 그 이름으로 경매장을 찾게 한다', async () => {
    stubPopular(body());
    const onSearch = vi.fn();
    renderChart(onSearch);
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));
    await screen.findByText('낙지');

    fireEvent.click(screen.getByRole('button', { name: '낙지 경매장 검색' }));

    expect(onSearch).toHaveBeenCalledWith('낙지');
  });

  it('이름은 아이템 정보로 가는 링크다', async () => {
    stubPopular(body());
    renderChart();
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));

    const link = await screen.findByRole('link', { name: '낙지' });
    expect(link.getAttribute('href')).toBe('/item/낙지?category=%EC%9D%8C%EC%8B%9D');
  });

  it('거래가 없던 기간은 빈 상태를 보인다', async () => {
    stubPopular(body({ byCount: [], byTotal: [] }));
    renderChart();
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));

    expect(await screen.findByText('이 기간에 거래된 아이템이 없습니다.')).toBeInTheDocument();
  });

  it('받지 못하면 까닭을 알린다', async () => {
    stubPopular(new Response('{}', { status: 500 }));
    renderChart();
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/HTTP 500/)).toBeInTheDocument();
  });
});
