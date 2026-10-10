import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { RootLayout } from './RootLayout';

vi.mock('@/components/AccountPanel', () => ({ AccountPanel: () => null }));
vi.mock('@/features/account/store', () => ({
  useAccountState: () => ({ phase: 'loading', generation: 0, message: '' }),
}));

it('계정 데이터를 기다리는 동안에도 본문을 표시하고 입력을 받는다', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <AppProviders>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Routes>
            <Route element={<RootLayout />}>
              <Route path="/" element={<input aria-label="본문 입력" />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
  const input = screen.getByRole('textbox', { name: '본문 입력' });
  fireEvent.change(input, { target: { value: '계속 사용' } });
  expect(input).toHaveValue('계속 사용');
  expect(screen.queryByText('계정 데이터를 불러오는 중입니다.')).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});
