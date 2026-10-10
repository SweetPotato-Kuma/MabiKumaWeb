import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemIcon, ItemImage } from '@/components/ItemIcon';
import { forgetItemCards } from '@/features/itemcard/cards';
import { iconMapUrl } from '@/features/itemcard/iconMap';
import type * as Settings from '@/lib/settings';

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://worker.test',
}));

beforeEach(() => {
  forgetItemCards();
  vi.stubEnv('VITE_ICON_BASE_URL', 'https://icons.example');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/**
 * jsdom 은 그림을 실제로 받지 않는다. 받은 것처럼 원래 크기를 심고 load 를 쏜다.
 */
function loadAs(image: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: width });
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: height });
  Object.defineProperty(image, 'complete', { configurable: true, value: true });
  fireEvent.load(image);
}

function renderImage(size: number) {
  const { container } = render(<ItemImage src="https://icons.example/a.png" size={size} />);
  return container.querySelector('img') as HTMLImageElement;
}

describe('ItemImage', () => {
  it('크기를 알기 전에는 숨겨 둔다', () => {
    // 늦게 온 그림이 잘못된 크기로 번쩍이지 않게 한다. 칸은 먼저 잡혀 있다.
    expect(renderImage(48).style.visibility).toBe('hidden');
  });

  it('칸에 들어가는 그림은 원래 크기 그대로 그린다', () => {
    const image = renderImage(48);
    loadAs(image, 48, 48);

    expect(image.style.width).toBe('48px');
    expect(image.style.height).toBe('48px');
    expect(image.style.visibility).toBe('');
  });

  it('작은 그림을 칸만큼 키우지 않는다', () => {
    const image = renderImage(96);
    loadAs(image, 24, 24);

    expect(image.style.width).toBe('24px');
  });

  it('칸보다 긴 그림은 정확히 절반으로 줄인다', () => {
    const image = renderImage(48);
    loadAs(image, 48, 96);

    expect(image.style.width).toBe('24px');
    expect(image.style.height).toBe('48px');
  });

  it('주소가 깨진 그림은 그림 없음 표시로 바꾼다', () => {
    // 빈칸으로 두면 그림이 늦는 것인지 없는 것인지 알 수 없다.
    const { container } = render(<ItemImage src="https://icons.example/broken.png" size={48} />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    const image = container.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toContain('item-missing');
    expect(image.width).toBe(24);
  });
});

describe('아이템 그림 복구', () => {
  const card = (name: string, icon = `${name}.webp`) => ({
    name,
    category: '음식',
    icon,
    iconUrl: `https://icons.example/${icon}`,
    subtitle: '',
    description: '',
    updated: '2026-10-08',
  });
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

  it.each([404, 500])(
    '목록 HTTP %i에서도 화면의 사전 조회 없이 카드로 그림을 복구한다',
    async (status) => {
      const lookup = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).includes('/maps/')) return new Response('', { status });
          lookup(JSON.parse(String(init?.body)));
          return Response.json({ cards: [card('새 음식')] });
        }),
      );
      const view = render(
        <QueryClientProvider client={client()}>
          <ItemIcon category="음식" name="  @새 음식 " size={40} />
        </QueryClientProvider>,
      );

      await waitFor(() =>
        expect(
          view.container.querySelector('img[src="https://icons.example/새 음식.webp"]'),
        ).not.toBeNull(),
      );
      expect(lookup.mock.calls).toEqual([[{ groups: [{ category: '음식', names: ['새 음식'] }] }]]);
    },
  );

  it('카테고리 목록의 빈 그림은 분류 없음의 그림으로 보완한다', async () => {
    const foodMap = await iconMapUrl('음식');
    const fallbackMap = await iconMapUrl('분류 없음');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === foodMap) return Response.json({ items: { '새 음식': [''] } });
      if (String(input) === fallbackMap)
        return Response.json({ items: { '새 음식': ['new.webp'] } });
      throw new Error('불필요한 카드 조회');
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <QueryClientProvider client={client()}>
        <ItemIcon category="음식" name="새 음식" size={40} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        view.container.querySelector('img[src="https://icons.example/new.webp"]'),
      ).not.toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('빈 카테고리도 분류 없음에서 그림을 찾는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ items: { '새 재료': ['new.webp'] } })),
    );
    const view = render(
      <QueryClientProvider client={client()}>
        <ItemIcon category="" name="새 재료" size={40} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        view.container.querySelector('img[src="https://icons.example/new.webp"]'),
      ).not.toBeNull(),
    );
  });

  it('사전에 그림이 없는 아이템은 대신 줄 그림(키트 그림)을 그린다', async () => {
    const queryClient = client();
    queryClient.setQueryData(['itemIconMap', '음식'], new Map());
    queryClient.setQueryData(['itemIconMap', '분류 없음'], new Map());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ cards: [] })),
    );
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ItemIcon category="음식" name="새 의장" fallbackFile="kit.webp" size={40} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        view.container.querySelector('img[src="https://icons.example/kit.webp"]'),
      ).not.toBeNull(),
    );
  });

  it('사전에 그림이 있으면 대신 줄 그림을 쓰지 않는다', async () => {
    const queryClient = client();
    queryClient.setQueryData(
      ['itemIconMap', '음식'],
      new Map([['새 음식', { icon: 'dict.webp', subtitle: '' }]]),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ cards: [] })),
    );
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ItemIcon category="음식" name="새 음식" fallbackFile="kit.webp" size={40} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        view.container.querySelector('img[src="https://icons.example/dict.webp"]'),
      ).not.toBeNull(),
    );
    expect(view.container.querySelector('img[src="https://icons.example/kit.webp"]')).toBeNull();
  });

  it('오래된 그림 주소가 실패하면 새 카드의 주소로 바꾸며 재시도를 반복하지 않는다', async () => {
    const queryClient = client();
    queryClient.setQueryData(
      ['itemIconMap', '음식'],
      new Map([['새 음식', { icon: 'old.png', subtitle: '' }]]),
    );
    const fetchMock = vi.fn(async () => Response.json({ cards: [card('새 음식', 'new.webp')] }));
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ItemIcon category="음식" name="새 음식" card={card('새 음식', 'old.png')} size={40} />
      </QueryClientProvider>,
    );
    fireEvent.error(view.container.querySelector('img') as HTMLImageElement);

    await waitFor(() =>
      expect(
        view.container.querySelector('img[src="https://icons.example/new.webp"]'),
      ).not.toBeNull(),
    );
    fireEvent.error(view.container.querySelector('img') as HTMLImageElement);
    expect(view.container.querySelector('img')?.getAttribute('src')).toContain('item-missing');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('많은 칸이 누락돼도 이름을 중복 조회하지 않고 60개 한도 안에서 묶는다', async () => {
    const queryClient = client();
    queryClient.setQueryData(['itemIconMap', '음식'], new Map());
    queryClient.setQueryData(['itemIconMap', '분류 없음'], new Map());
    const fetchMock = vi.fn(async () => Response.json({ cards: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider client={queryClient}>
        {Array.from({ length: 126 }, (_, index) => (
          <ItemIcon key={index} category="음식" name={`음식 ${index % 125}`} size={40} />
        ))}
      </QueryClientProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const names = fetchMock.mock.calls.flatMap((call) => {
      const [, init] = call as unknown as [string, RequestInit];
      const groups = JSON.parse(String(init.body)).groups as { names: string[] }[];
      const batch = groups.flatMap((group) => group.names);
      expect(batch.length).toBeLessThanOrEqual(60);
      return batch;
    });
    expect(new Set(names).size).toBe(125);
    expect(names.length).toBe(125);
  });
});
