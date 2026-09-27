import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { readRelicPriceCache, type RelicPriceFile } from '@/features/relics/priceFile';
import { RelicSimulatorPage } from '@/pages/RelicSimulatorPage';

/** antd 표를 여러 번 다시 그린다. 느린 기계에서 기본 제한 5초를 넘길 수 있다. */
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/features/itemcard/iconMap', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  iconBaseUrl: () => 'https://cdn.test',
}));

const PRICE_FILE: RelicPriceFile = {
  at: Date.now() - 3 * 60_000,
  idea: [134_000_000, 1],
  offers: [['오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 80_000_000, 2]],
  trades: [],
};

const ARCANA_DATA = {
  updated: '2026-09-22',
  arcanas: [
    {
      id: 6,
      name: '블래스트 랜서',
      awakening: 59107,
      skills: [{ id: 59105, name: '오버 드라이브' }],
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/relic-simulator']}>
          <RelicSimulatorPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

/**
 * 옵션 30종 중 17번째(오버 드라이브), 레벨 10단계 중 7번째가 나오게 한다. 표도 난수를 쓰므로
 * 누르기 바로 앞에서 건다.
 */
function rigOverDriveSeven() {
  return vi
    .spyOn(Math, 'random')
    .mockReturnValueOnce(16.5 / 30)
    .mockReturnValueOnce(6.5 / 10);
}

describe('무리아스의 유물 복원 시뮬레이터', () => {
  let priceResponse: () => Promise<Response>;

  beforeEach(() => {
    priceResponse = async () => new Response(JSON.stringify(PRICE_FILE));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('prices/murias-relics.js')) return priceResponse();
        if (String(url).endsWith('data/arcana.json'))
          return new Response(JSON.stringify(ARCANA_DATA));
        return new Response('', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('뽑은 유물에 모아 둔 시세를 붙이고, 받은 파일을 다음을 위해 남긴다', async () => {
    renderPage();

    expect(screen.getByText(/복원 단추를 누르면/)).toBeInTheDocument();
    expect(await screen.findByText(/3분 전에 모은 경매장 시세입니다/)).toBeInTheDocument();
    rigOverDriveSeven();
    fireEvent.click(screen.getByRole('button', { name: '1번 복원' }));

    const card = screen.getByRole('region', { name: '방금 나온 유물' });
    expect(within(card).getByText('오버 드라이브 폭발 공격 대미지')).toBeInTheDocument();
    expect(within(card).getByText('490% 증가')).toBeInTheDocument();
    expect(within(card).getByText('8,000만 G')).toBeInTheDocument();
    expect(await within(card).findByText('블래스트 랜서')).toBeInTheDocument();
    expect(readRelicPriceCache()?.at).toBe(PRICE_FILE.at);

    fireEvent.click(screen.getByRole('button', { name: /처음부터/ }));
    expect(screen.getByText(/복원 단추를 누르면/)).toBeInTheDocument();
  });

  it('지난번에 받은 시세가 있으면 새 파일을 기다리지 않고 바로 붙인다', () => {
    window.localStorage.setItem('mabikuma:relics:prices', JSON.stringify(PRICE_FILE));
    // 새 파일은 끝나지 않는다.
    priceResponse = () => new Promise(() => {});
    renderPage();

    rigOverDriveSeven();
    fireEvent.click(screen.getByRole('button', { name: '1번 복원' }));
    const card = screen.getByRole('region', { name: '방금 나온 유물' });
    expect(within(card).getByText('8,000만 G')).toBeInTheDocument();
    expect(screen.getByText('새 시세를 받는 중입니다.')).toBeInTheDocument();
  });

  it('시세를 받지 못해도 뽑기는 된다', async () => {
    priceResponse = async () => new Response('', { status: 500 });
    renderPage();

    expect(await screen.findByText(/시세를 받지 못했습니다/)).toBeInTheDocument();
    rigOverDriveSeven();
    fireEvent.click(screen.getByRole('button', { name: '1번 복원' }));
    const card = screen.getByRole('region', { name: '방금 나온 유물' });
    expect(within(card).getByText('490% 증가')).toBeInTheDocument();
  });
});
