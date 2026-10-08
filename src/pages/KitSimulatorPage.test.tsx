import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type { Kit, KitIndex } from '@/features/kits/kits';
import { KitSimulatorPage } from '@/pages/KitSimulatorPage';

const KITS: Kit[] = [
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
];

/** 화면이 받는 목록. 키트마다 고르는 데 필요한 것만 있다. */
const INDEX: KitIndex = {
  updated: '2026-10-08',
  current: ['official-495'],
  kits: KITS.map(({ id, name, start, end, price, items }) => ({
    id,
    name,
    start,
    end,
    price,
    count: items.length,
  })),
};

/** 목록과 키트 한 파일을 주소로 갈라 돌려준다. */
const serve = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  const body = url.endsWith('/index.json')
    ? INDEX
    : KITS.find((kit) => url.endsWith(`/${kit.id}.json`));
  return body
    ? new Response(JSON.stringify(body), { status: 200 })
    : new Response('', { status: 404 });
});

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
    vi.stubGlobal('fetch', serve);
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
    // 구성품 표는 접혀 있다. 펼치면 그린다.
    expect(screen.queryByRole('button', { name: /목표로$/ })).toBeNull();
    fireEvent.click(screen.getByText('구성품 확률 2종'));
    fireEvent.click(
      await screen.findByRole('button', { name: '찬란한 나이트메어 판타지아 데몬 윙 목표로' }),
    );
    expect(within(region).getByText('10%')).toBeInTheDocument();
    fireEvent.click(auto);
    expect(within(region).getByRole('status')).toHaveTextContent(/목표 아이템이 나/);
  });

  it('한 번 열기 연출이 도는 동안에는 연 횟수에 넣지 않고, 끝나면 넣는다. 연출을 끄면 바로 넣는다', async () => {
    window.localStorage.removeItem('mabikuma:kitFx');
    renderPage();
    const region = await screen.findByRole('region', { name: '키트 열기' });
    fireEvent.click(within(region).getByRole('button', { name: /^1번 열기$/ }));
    expect(within(statistic('연 횟수')).getByText('0')).toBeInTheDocument();
    expect(within(region).getByText('여는 중')).toBeInTheDocument();
    await waitFor(() => expect(within(statistic('연 횟수')).getByText('1')).toBeInTheDocument(), {
      timeout: 4000,
    });

    // 다시 열면 연출하는 동안 목록은 누르기 전 모습(한 줄) 그대로다. 줄이 빠졌다 들어오며 들썩이지 않는다.
    const list = within(region).getByRole('region', { name: '이번에 나온 아이템' });
    const lines = () => list.querySelectorAll('.kt-line').length;
    expect(lines()).toBe(1);
    fireEvent.click(within(region).getByRole('button', { name: /^1번 열기$/ }));
    expect(lines()).toBe(1);
    await waitFor(() => expect(lines()).toBe(2), { timeout: 4000 });

    fireEvent.click(within(region).getByRole('switch', { name: '키트 연출' }));
    expect(window.localStorage.getItem('mabikuma:kitFx')).toBe('off');
    fireEvent.click(within(region).getByRole('button', { name: /^1번 열기$/ }));
    expect(within(statistic('연 횟수')).getByText('3')).toBeInTheDocument();
    window.localStorage.removeItem('mabikuma:kitFx');
  });
});
