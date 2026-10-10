import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type * as Settings from '@/lib/settings';
import { ItemPreview } from '@/components/news/ItemPreview';
import type { ItemPreview as Preview } from '@/features/news/preview';

// 테스트 환경에는 워커 주소가 없다. 있는 것으로 두고 fetch 로 답한다.
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://w.example',
}));

const IMAGE: Preview = {
  name: '나이트메어 판타지아 가발(남성용)',
  kind: 'image',
  url: 'https://icons.example/previews/abc.jpg',
  postId: 4893863,
  title: '나이트메어 판타지아 박스',
};
const VIDEO: Preview = {
  name: '스페셜 나이트메어 판타지아 웨어(남성용)',
  kind: 'video',
  url: 'https://vod.example/1.mp4',
  postId: 4893863,
  title: '나이트메어 판타지아 박스',
};

let requests: URL[];
let reply: (name: string) => Preview | null;

function renderPreview(name: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ItemPreview name={name} />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

beforeEach(() => {
  requests = [];
  reply = (name) => [IMAGE, VIDEO].find((each) => each.name === name) ?? null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      requests.push(url);
      const found = reply(url.searchParams.get('name') ?? '');
      return found ? new Response(JSON.stringify(found)) : new Response('{}', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('공식 미리보기', () => {
  it('그림이 있으면 그림과 글 링크를 보여 준다', async () => {
    renderPreview(IMAGE.name);
    const image = await screen.findByRole('img', { name: `${IMAGE.name} 공식 미리보기` });
    expect(image).toHaveAttribute('src', IMAGE.url);
    expect(screen.getByRole('link', { name: '나이트메어 판타지아 박스' })).toHaveAttribute(
      'href',
      '/news?id=4893863',
    );
    expect(requests[0].pathname).toBe('/news/preview');
    expect(requests[0].searchParams.get('name')).toBe(IMAGE.name);
  });

  it('영상은 소리 없이 바로 반복 재생하고 조작 막대를 둔다', async () => {
    const { container } = renderPreview(VIDEO.name);
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('src', VIDEO.url);
    expect(video).toHaveAttribute('controls');
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
  });

  it('embedded 이면 카드 없이 내용만 그린다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { container } = render(
      <AppProviders>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ItemPreview name={IMAGE.name} embedded />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProviders>,
    );
    await screen.findByRole('img', { name: `${IMAGE.name} 공식 미리보기` });
    expect(container.querySelector('.ant-card')).toBeNull();
    expect(screen.queryByText('공식 미리보기')).toBeNull();
  });

  it('미리보기가 없는 아이템에는 아무것도 그리지 않는다', async () => {
    const { container } = renderPreview('숏 소드');
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(container.querySelector('.ant-card')).toBeNull();
    expect(screen.queryByText('공식 미리보기')).toBeNull();
  });

  it('그림을 받지 못하면 카드를 접는다', async () => {
    renderPreview(IMAGE.name);
    const image = await screen.findByRole('img', { name: `${IMAGE.name} 공식 미리보기` });
    fireEvent.error(image);
    await waitFor(() => expect(screen.queryByText('공식 미리보기')).toBeNull());
  });
});
