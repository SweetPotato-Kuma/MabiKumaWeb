import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { NpcShopPage } from '@/pages/NpcShopPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/npc-shop']}>
          <NpcShopPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('NPC 상점 화면', () => {
  it('렌더 중에 터지지 않고 제목을 보여 준다', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'NPC 상점 조회' })).toBeInTheDocument();
  });

  it('서버, 채널, NPC 를 고르는 곳이 모두 있다', () => {
    renderPage();

    expect(screen.getByLabelText('서버')).toBeInTheDocument();
    expect(screen.getByLabelText('채널')).toBeInTheDocument();
    expect(screen.getByLabelText('NPC')).toBeInTheDocument();
  });

  it('고르는 칸이 타이핑 가능한 입력처럼 굴지 않는다', () => {
    renderPage();

    /**
     * antd Select 는 showSearch 를 켜면 타이핑 가능한 입력칸을 그린다. 목록에서 고르면
     * 되는 칸이 텍스트 입력처럼 보여 혼란스러웠다. 셋 다 읽기 전용이어야 한다.
     */
    for (const label of ['서버', '채널', 'NPC']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('readonly');
    }
  });
});
