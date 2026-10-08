import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type { KitArchive } from '@/features/kits/kits';
import { KitSimulatorPage } from '@/pages/KitSimulatorPage';

const ARCHIVE: KitArchive = {
  updated: '2026-10-08',
  current: ['official-495'],
  kits: [
    {
      id: 'official-495',
      name: '나이트메어 판타지아 박스',
      start: '2026-10-01',
      end: '2026-10-14',
      price: 1200,
      grades: [
        { name: 'S 등급', chance: 0.1 },
        { name: 'C 등급', chance: 0.9 },
      ],
      items: [
        { name: '찬란한 나이트메어 판타지아 데몬 윙', chance: 0.1, grade: 0 },
        { name: '베인 풍선(5번)', chance: 0.9, grade: 1 },
      ],
    },
    {
      id: 'archive-2017-01-12',
      name: '이세계 동화집',
      start: '2017-01-12',
      end: null,
      price: null,
      grades: [],
      items: [{ name: '동화 속 날개', chance: 1 }],
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/kit-simulator']}>
          <KitSimulatorPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

const statistic = (title: string) =>
  screen
    .getByText(title, { selector: '.ant-statistic-title' })
    .closest('.ant-statistic') as HTMLElement;

describe('키트 시뮬레이터', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(ARCHIVE), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('지금 파는 키트를 먼저 고르고, 열면 연 횟수와 쓴 캐시가 쌓인다', async () => {
    renderPage();
    const region = await screen.findByRole('region', { name: '키트 열기' });
    expect(within(region).getByText('판매 중')).toBeInTheDocument();
    fireEvent.click(within(region).getByRole('button', { name: /10번 열기/ }));
    expect(within(statistic('연 횟수')).getByText('10')).toBeInTheDocument();
    expect(within(statistic('쓴 캐시')).getByText('12,000')).toBeInTheDocument();
    // 등급별 횟수의 합은 연 횟수와 같다.
    const graded = ['S 등급 10%', 'C 등급 90%'].map((title) =>
      Number(within(statistic(title)).getByText(/^\d+$/).textContent),
    );
    expect(graded[0] + graded[1]).toBe(10);
    expect(within(region).queryByText('열기 전')).toBeNull();
  });

  it('구성품 표에서 목표로 고르면 한 번에 나올 확률과 목표까지 열기가 생긴다', async () => {
    renderPage();
    const region = await screen.findByRole('region', { name: '키트 열기' });
    const auto = within(region).getByRole('button', { name: '목표까지 최대 1,000번' });
    expect(auto).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: '찬란한 나이트메어 판타지아 데몬 윙 목표로' }),
    );
    expect(within(region).getByText('10%')).toBeInTheDocument();
    fireEvent.click(auto);
    expect(within(region).getByRole('status')).toHaveTextContent(/목표 아이템이 나/);
  });
});
