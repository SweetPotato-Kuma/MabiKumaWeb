import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { BagsPage } from '@/pages/BagsPage';

// 페이지 전체를 그리는 시험이라 다른 시험과 함께 돌면 기본 5초를 넘기기도 한다.
vi.setConfig({ testTimeout: 30_000 });

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
  it('세 파트 모두 R, G, B 채널 입력이 열려 있고 값은 비어 있다', () => {
    renderPage();

    for (const channel of ['R', 'G', 'B']) {
      // 파트마다 채널 입력이 하나씩이라 세 파트에 걸쳐 셋씩 있다.
      expect(screen.getAllByLabelText(`${channel} 최소`)).toHaveLength(3);
      expect(screen.getAllByLabelText(`${channel} 최대`)).toHaveLength(3);
      expect(screen.getAllByLabelText(`${channel} 유사도`)).toHaveLength(3);
    }
    for (const input of screen.getAllByLabelText('R 최소')) expect(input).toHaveValue('');
    expect(screen.queryByRole('button', { name: /조건 지우기/ })).toBeNull();
  });

  it('범위를 넣은 파트에만 지우기 단추가 나타나고, 누르면 비운다', () => {
    renderPage();

    fireEvent.change(screen.getAllByLabelText('R 최소')[0], { target: { value: '200' } });
    const clear = screen.getByRole('button', { name: '파트 A 조건 지우기' });
    expect(screen.queryByRole('button', { name: '파트 B 조건 지우기' })).toBeNull();

    fireEvent.click(clear);

    expect(screen.getAllByLabelText('R 최소')[0]).toHaveValue('');
    expect(screen.queryByRole('button', { name: /조건 지우기/ })).toBeNull();
  });

  it('유사도를 켜면 기준값과 오차, 받아들이는 범위를 보여 준다', () => {
    renderPage();

    fireEvent.click(screen.getAllByLabelText('G 유사도')[1]);
    fireEvent.change(screen.getByLabelText('G 기준값'), { target: { value: '120' } });

    // 오차는 처음에 10% 라 120 ± 25.5 다.
    expect(screen.getByText('94.5~145.5')).toBeInTheDocument();
  });

  it('주소의 채널 조건이 입력칸에 채워진다', () => {
    renderPage('/bags?a=r100-200,g120p10');

    expect(screen.getAllByLabelText('R 최소')[0]).toHaveValue('100');
    expect(screen.getAllByLabelText('R 최대')[0]).toHaveValue('200');
    expect(screen.getByLabelText('G 기준값')).toHaveValue('120');
    expect(screen.getByLabelText('G 오차')).toHaveValue('10');
  });
});
