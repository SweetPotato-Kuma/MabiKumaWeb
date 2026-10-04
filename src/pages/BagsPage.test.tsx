import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { BagsPage } from '@/pages/BagsPage';

function renderPage(url = '/bags') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <BagsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('튼튼한 주머니 파트별 색 조건', () => {
  it('처음에는 파트 A 만 켜져서 펼쳐 있고, B 와 C 는 꺼져서 접혀 있다', () => {
    renderPage();

    expect(screen.getByRole('checkbox', { name: '파트 A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '파트 B' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '파트 C' })).not.toBeChecked();
    // 펼친 파트는 A 하나뿐이라 채널 입력도 한 벌이다. 값은 미리 들어 있지 않다.
    for (const channel of ['R', 'G', 'B']) {
      expect(screen.getAllByLabelText(`${channel} 최소`)).toHaveLength(1);
      expect(screen.getAllByLabelText(`${channel} 유사도`)).toHaveLength(1);
    }
    expect(screen.getByLabelText('R 최소')).toHaveValue('');
    expect(screen.getByRole('button', { name: '파트 B 조건 펼치기' })).toBeInTheDocument();
  });

  it('파트를 켜면 펼쳐서 바로 채울 수 있고, 끄면 접힌다', () => {
    renderPage();

    fireEvent.click(screen.getByRole('checkbox', { name: '파트 B' }));
    expect(screen.getAllByLabelText('R 최소')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '파트 B 조건 접기' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '파트 B' }));
    expect(screen.getAllByLabelText('R 최소')).toHaveLength(1);
  });

  it('접은 파트는 건 조건을 머리줄에 적는다', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('R 최대'), { target: { value: '255' } });
    fireEvent.click(screen.getByRole('button', { name: '파트 A 조건 접기' }));

    expect(screen.queryByLabelText('R 최소')).toBeNull();
    expect(screen.getByText('R 200~255')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '파트 A 조건 펼치기' }));
    expect(screen.getByLabelText('R 최소')).toHaveValue('200');
  });

  it('끈 파트는 펼쳐 봐도 입력이 잠기고 값은 그대로 남는다', () => {
    renderPage('/bags?b=r10-20');

    fireEvent.click(screen.getByRole('checkbox', { name: '파트 B' }));
    fireEvent.click(screen.getByRole('button', { name: '파트 B 조건 펼치기' }));

    const [, second] = screen.getAllByLabelText('R 최소');
    expect(second).toBeDisabled();
    expect(second).toHaveValue('10');
  });

  it('범위를 넣은 파트에만 지우기 단추가 나타나고, 누르면 비운다', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: /조건 지우기/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: '파트 A 조건 지우기' }));

    expect(screen.getByLabelText('R 최소')).toHaveValue('');
  });

  it('유사도를 켜면 기준값과 오차, 받아들이는 범위를 보여 준다', () => {
    renderPage();

    fireEvent.click(screen.getByLabelText('G 유사도'));
    fireEvent.change(screen.getByLabelText('G 기준값'), { target: { value: '120' } });

    // 오차는 처음에 10% 라 120 ± 25.5 다.
    expect(screen.getByText('94.5~145.5')).toBeInTheDocument();
  });

  it('주소의 조건이 켜짐과 입력칸에 나타난다', () => {
    renderPage('/bags?a=r100-200,g120p10&b=on');

    expect(screen.getAllByLabelText('R 최소')[0]).toHaveValue('100');
    expect(screen.getByLabelText('G 기준값')).toHaveValue('120');
    expect(screen.getByRole('checkbox', { name: '파트 B' })).toBeChecked();
    // 켠 파트는 펼쳐 있어서 B 의 입력도 보인다.
    expect(screen.getAllByLabelText('R 최소')).toHaveLength(2);
  });

  it('주소로 파트 A 를 끄면 접혀서 나온다', () => {
    renderPage('/bags?a=-');

    expect(screen.getByRole('checkbox', { name: '파트 A' })).not.toBeChecked();
    expect(screen.queryByLabelText('R 최소')).toBeNull();
  });
});

describe('튼튼한 주머니 상점 교체', () => {
  it('상점이 에린 하루마다 바뀐다는 안내 옆에 교체까지 남은 시간이 나온다', () => {
    renderPage();

    expect(screen.getByText(/에린 하루\(현실 36분\)마다 바뀝니다/)).toBeInTheDocument();
    expect(screen.getByText(/상점 교체까지 (\d+분 )?\d+초 남음/)).toBeInTheDocument();
  });
});

describe('튼튼한 주머니 그림 보기의 쪽 크기', () => {
  /** 주머니 35개가 든 한 채널. 이름과 색을 모두 다르게 둔다. */
  const bags = Array.from({ length: 35 }, (_, index) => ({
    n: `튼튼한 주머니 ${index + 1}`,
    c: [index.toString(16).padStart(2, '0').repeat(3)],
    p: 1000 + index,
    t: '골드',
  }));
  const done = {
    server: '울프',
    status: 'done' as const,
    done: 1,
    total: 1,
    channels: [
      {
        server: '울프',
        channel: 1,
        nextUpdate: new Date(Date.now() + 10 * 60_000).toISOString(),
        npcs: [{ npc: '상인 라누', bags }],
      },
    ],
    failedChannels: [],
    nextUpdate: Date.now() + 10 * 60_000,
  };

  it('쪽 크기를 직접 고를 수 있고, 고르면 그 개수로 쪽이 나뉘며, 화면에 맞춤으로 돌아간다', async () => {
    vi.resetModules();
    vi.doMock('@/features/bags/useBagSearch', () => ({
      useBagSearch: () => ({ state: done, search: vi.fn() }),
    }));
    const { BagsPage: Page } = await import('@/pages/BagsPage');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <AppProviders>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/bags?server=울프']}>
            <Page />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProviders>,
    );

    // 쪽 크기 고르기가 보인다. 아직 고르지 않았으니 화면에 맞춤 단추는 없다.
    const sizeChanger = await screen.findByRole('combobox', { name: /쪽당|페이지|개씩|page size/i });
    expect(screen.queryByRole('button', { name: '화면에 맞춤' })).toBeNull();

    fireEvent.mouseDown(sizeChanger);
    // 선택지는 10, 20, 30, 50, 100 이다. 10 은 100 과 앞이 같아 정확히 맞춘다.
    const options = await screen.findAllByTitle(/^\d+/);
    fireEvent.click(options.find((option) => /^10(\D|$)/.test(option.getAttribute('title') ?? '')) as HTMLElement);

    // 10개씩이라 35개가 4쪽이다.
    expect(await screen.findByRole('button', { name: '화면에 맞춤' })).toBeInTheDocument();
    expect(screen.getByTitle('4')).toBeInTheDocument();
    expect(screen.queryByTitle('5')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '화면에 맞춤' }));
    expect(screen.queryByRole('button', { name: '화면에 맞춤' })).toBeNull();
    vi.doUnmock('@/features/bags/useBagSearch');
  });
});
