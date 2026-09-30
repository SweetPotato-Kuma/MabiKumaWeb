import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

describe('튼튼한 주머니 파트별 유사도 검색', () => {
  it('파트마다 유사도 단추가 있고, 채널 범위를 넣으면 단추에 건 조건이 보인다', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '파트 A 유사도 검색' }));
    const popover = await screen.findByRole('tooltip');
    fireEvent.change(within(popover).getByLabelText('R 최소'), { target: { value: '200' } });
    fireEvent.change(within(popover).getByLabelText('R 최대'), { target: { value: '255' } });

    expect(screen.getByRole('button', { name: '파트 A 유사도 검색' })).toHaveTextContent('R 200~255');
  });

  it('유사도를 켜면 기준값과 오차, 받아들이는 범위를 보여 준다', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '파트 A 유사도 검색' }));
    const popover = await screen.findByRole('tooltip');
    fireEvent.click(within(popover).getByLabelText('G 유사도'));
    fireEvent.change(within(popover).getByLabelText('G 기준값'), { target: { value: '120' } });

    expect(await within(popover).findByText('94.5~145.5')).toBeInTheDocument();
  });

  it('주소의 채널 조건이 단추에 나타난다', () => {
    renderPage('/bags?af=r100-200,g120p10');

    expect(screen.getByRole('button', { name: '파트 A 유사도 검색' })).toHaveTextContent(
      'R 100~200 G 120 ±10%',
    );
  });

  it('검색에서 뺀 파트는 유사도 단추도 쓸 수 없다', () => {
    renderPage();

    // 기본으로 파트 B, C 는 검색에서 빠져 있다.
    expect(screen.getByRole('button', { name: '파트 B 유사도 검색' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '파트 A 유사도 검색' })).toBeEnabled();
  });
});
