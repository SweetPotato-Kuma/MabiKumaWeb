import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { AuctionPage } from '@/pages/AuctionPage';

/**
 * 화면이 실제로 서는지 보는 스모크 테스트.
 *
 * 브라우저 없이 잡을 수 있는 것은 한정되지만, 렌더 중에 터지는 오류와 화면에서
 * 사라진 조작부는 여기서 걸린다. 키도 프록시도 없는 테스트 환경이라 조회 요청은
 * 아예 나가지 않는다. 네트워크를 건드리지 않는다.
 */
function renderPage() {
  // 테스트마다 캐시를 새로 만든다. 재시도를 꺼야 실패가 조용히 늦게 나타나지 않는다.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auction']}>
          <AuctionPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('경매장 화면', () => {
  it('렌더 중에 터지지 않고 제목을 보여 준다', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '경매장 조회' })).toBeInTheDocument();
  });

  it('검색 조작부가 화면에 있다', () => {
    renderPage();

    expect(screen.getByPlaceholderText(/아이템명 검색/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /찾기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /검색 초기화/ })).toBeInTheDocument();
  });

  it('카테고리를 고르는 곳이 있다', () => {
    renderPage();

    // 좁은 화면(jsdom matchMedia 기본값)에서는 트리 대신 Select 로 접힌다.
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('조회 전에는 무엇을 하면 되는지 알려 준다', () => {
    renderPage();

    expect(screen.getByText(/카테고리를 고르거나 아이템명을 입력한 뒤/)).toBeInTheDocument();
  });

  it('검색 조건이 비어 있으면 찾기를 누를 수 없다', () => {
    renderPage();

    /**
     * 카테고리도 검색어도 없으면 보낼 요청이 없다. 눌리게 두면 전체 경매장을
     * 훑는 요청이 나가거나 API 가 거절한다. 어느 쪽이든 사용자에게 도움이 안 된다.
     *
     * 키 유무는 여기서 단언하지 않는다. .env 의 프록시 설정에 따라 달라져서
     * 환경마다 결과가 뒤집히는 테스트가 된다.
     */
    expect(screen.getByRole('button', { name: /찾기/ })).toBeDisabled();
  });
});
