import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { ItemInfoDetail } from '@/components/ItemInfoDetail';
import type * as Settings from '@/lib/settings';

// 대부분의 시험은 워커가 없는 환경이다. 미리보기 시험만 주소를 둔다.
const proxy = vi.hoisted(() => ({ url: '' }));

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => proxy.url,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  proxy.url = '';
});

function renderDetail(item: { category: string; name: string }) {
  return render(
    <AppProviders>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <ItemInfoDetail category={item.category} name={item.name} />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('장비가 아닌 아이템의 상세', () => {
  it('이름과 카테고리를 경매장 상세와 같은 자리에 보여 준다', async () => {
    renderDetail({ category: '포션', name: '생명력 50 포션' });

    expect(await screen.findByRole('heading', { name: '생명력 50 포션' })).toBeInTheDocument();
    expect(screen.getByText('포션')).toBeInTheDocument();
  });

  it('설명이 없으면 없다고 말해 준다', async () => {
    // 테스트 환경에는 카드 저장소가 없다. 빈칸으로 두지 않고 이유를 적는다.
    renderDetail({ category: '포션', name: '생명력 50 포션' });

    expect(await screen.findByText(/아직 설명이 없습니다/)).toBeInTheDocument();
  });

  it('그 아이템의 시세로 바로 갈 수 있다', async () => {
    renderDetail({ category: '포션', name: '생명력 50 포션' });

    const link = (await screen.findByRole('button', { name: /시세 보기/ })).closest('a');
    expect(link?.getAttribute('href')).toBe(
      `/auction?keyword=${encodeURIComponent('생명력 50 포션')}&category=${encodeURIComponent('포션')}`,
    );
  });
});

describe('공식 미리보기 자리', () => {
  it('설명 아래, 시세 보기 단추 위에 그림을 둔다', async () => {
    proxy.url = 'https://w.example';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input));
        if (url.pathname === '/news/preview')
          return Response.json({
            name: '생명력 50 포션',
            kind: 'image',
            url: 'https://icons.example/previews/a.webp',
            postId: 1,
            title: '박스',
          });
        return new Response('{}', { status: 404 });
      }),
    );
    renderDetail({ category: '포션', name: '생명력 50 포션' });

    const image = await screen.findByRole('img', { name: '생명력 50 포션 공식 미리보기' });
    const button = screen.getByRole('button', { name: /시세 보기/ });
    expect(image.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 카드 안에 들어 있고 따로 "공식 미리보기" 카드로 떨어지지 않는다.
    expect(screen.queryByText('공식 미리보기')).toBeNull();
  });
});
