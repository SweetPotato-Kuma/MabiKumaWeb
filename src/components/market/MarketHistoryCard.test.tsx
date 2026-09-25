import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { MarketHistoryCard } from '@/components/market/MarketHistoryCard';
import type { MarketItemResponse } from '@/features/market/api';
import { kstDate } from '@/features/market/series';
import type * as Settings from '@/lib/settings';

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://worker.test',
}));

function stubMarket(body: MarketItemResponse) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => Response.json(body));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderCard(name: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppProviders>
        <MarketHistoryCard name={name} />
      </AppProviders>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const today = kstDate(Date.now());
const yesterday = kstDate(Date.now(), 1);

describe('시세 기록 카드', () => {
  it('최근 1일 요약과 그래프를 보여 준다', async () => {
    const fetchMock = stubMarket({
      name: '낙지',
      days: 30,
      recent: {
        n: 283,
        qty: 2830,
        lo: 900,
        hi: 1500,
        mid: 1100,
        avg: 1150,
        last: new Date().toISOString(),
      },
      daily: [
        { date: yesterday, n: 250, qty: 2500, lo: 800, hi: 1400, mid: 1000, avg: 1050 },
        { date: today, n: 120, qty: 1200, lo: 900, hi: 1500, mid: 1100, avg: 1150 },
      ],
      since: yesterday,
      updated: new Date().toISOString(),
    });

    renderCard('낙지');

    expect(await screen.findByText('283건')).toBeInTheDocument();
    expect(screen.getByText('1,100 G')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /최근 30일 날짜별 중위 가격/ })).toBeInTheDocument();
    // 기록을 모으기 시작한 날이 그래프 기간 안이면 그 앞이 비어 있다고 알린다.
    expect(screen.getByText(new RegExp(`${yesterday}부터 모았습니다`))).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://worker.test/market/item?name=${encodeURIComponent('낙지')}`,
    );
  });

  it('거래가 없던 아이템은 없다고 말한다', async () => {
    stubMarket({
      name: '없는 것',
      days: 30,
      recent: null,
      daily: [],
      since: '2026-01-01',
      updated: null,
    });

    renderCard('없는 것');

    expect(await screen.findByText('최근 1일 동안 거래된 기록이 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('아직 이 아이템이 거래된 기록이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/부터 모았습니다/)).not.toBeInTheDocument();
  });
});
