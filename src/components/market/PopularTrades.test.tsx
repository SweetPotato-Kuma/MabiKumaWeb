import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/AppProviders';
import { PopularTrades } from '@/components/market/PopularTrades';
import type { PopularResponse, PopularRow } from '@/features/market/api';
import type * as Settings from '@/lib/settings';
import { forgetItemCards } from '@/features/itemcard/cards';
import { iconMapUrl } from '@/features/itemcard/iconMap';

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://worker.test',
}));

const row = (
  name: string,
  n: number,
  total: number,
  avg: number | null,
  category = '음식',
): PopularRow => ({
  name,
  category,
  n,
  qty: n,
  total,
  avg,
});

const many = (count: number): PopularRow[] =>
  Array.from({ length: count }, (_, index) =>
    row(`아이템 ${index + 1}`, 100 - index, 1000 * (100 - index), 1000),
  );

function body(overrides: Partial<PopularResponse> = {}): PopularResponse {
  return {
    window: '24h',
    from: '2026-10-01T03:00:00.000Z',
    to: '2026-10-02T03:00:00.000Z',
    partial: false,
    byCount: [
      row('낙지', 231, 915_000, 3962),
      row('깨어난 힘의 정수', 133, 192_000_000, 1_450_000, '기타'),
    ],
    byTotal: [
      row('깨어난 힘의 정수', 133, 192_000_000, 1_450_000, '기타'),
      row('낙지', 231, 915_000, 3962),
    ],
    since: '2026-09-23',
    updated: '2026-10-02T02:55:00.000Z',
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubPopular(data: PopularResponse | Response) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes('/market/popular')) return Response.json({});
    return data instanceof Response
      ? data
      : Response.json({ ...data, window: new URL(url).searchParams.get('window') });
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderChart(onSearch: (name: string) => void = () => {}, tickMs = 60_000) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppProviders>
        <MemoryRouter>
          <PopularTrades onSearch={onSearch} tickMs={tickMs} />
        </MemoryRouter>
      </AppProviders>
    </QueryClientProvider>,
  );
}

const popularCalls = () =>
  fetchMock.mock.calls.filter(([input]) => String(input).includes('/market/popular'));
const expand = () =>
  fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }));
const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

beforeEach(() => {
  window.localStorage.clear();
  forgetItemCards();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('인기 거래 아이템 띠', () => {
  it.each(['이름 누락', '빈 그림'])(
    'CDN 목록의 %s을 카드 조회로 보완해 띠와 펼친 목록에 그린다',
    async (missing) => {
      vi.stubEnv('VITE_ICON_BASE_URL', 'https://icons.example');
      const foodMap = await iconMapUrl('음식');
      const fallbackMap = await iconMapUrl('분류 없음');
      const rows = [row('낙지', 231, 915_000, 3962), row('문어', 200, 800_000, 4000)];
      const cards = rows.map(({ name, category }) => ({
        name,
        category,
        subtitle: '',
        description: '',
        updated: '2026-10-08',
        icon: `${name}.webp`,
        iconUrl: `https://icons.example/${name}.webp`,
      }));
      const lookup = vi.fn();
      fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/market/popular')) return Response.json(body({ byCount: rows }));
        if (url === foodMap)
          return Response.json({ items: missing === '빈 그림' ? { 낙지: [''], 문어: [''] } : {} });
        if (url === fallbackMap) return Response.json({ items: {} });
        if (url.endsWith('/item-card/lookup')) {
          lookup(JSON.parse(String(init?.body)));
          return Response.json({ cards });
        }
        throw new Error(`Unexpected URL: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const view = renderChart();

      await waitFor(() =>
        expect(
          view.container.querySelector('img[src="https://icons.example/낙지.webp"]'),
        ).not.toBeNull(),
      );
      expand();
      await waitFor(() =>
        expect(
          view.container.querySelector('img[src="https://icons.example/문어.webp"]'),
        ).not.toBeNull(),
      );
      expect(lookup.mock.calls).toEqual([
        [{ groups: [{ category: '음식', names: ['낙지', '문어'] }] }],
      ]);
    },
  );

  it('목록에 그림이 있으면 카드 조회 없이 표시한다', async () => {
    vi.stubEnv('VITE_ICON_BASE_URL', 'https://icons.example');
    const foodMap = await iconMapUrl('음식');
    const rows = [row('낙지', 231, 915_000, 3962)];
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/market/popular')) return Response.json(body({ byCount: rows }));
      if (url === foodMap) return Response.json({ items: { 낙지: ['낙지.webp'] } });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = renderChart();

    await waitFor(() =>
      expect(
        view.container.querySelector('img[src="https://icons.example/낙지.webp"]'),
      ).not.toBeNull(),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/item-card/lookup'))).toBe(
      false,
    );
  });

  it('접힌 채로 1위를 한 줄로 보여 준다', async () => {
    stubPopular(body());
    renderChart();

    expect(await screen.findByText('낙지')).toBeInTheDocument();
    expect(screen.getByText('231회')).toBeInTheDocument();
    // 두 번째 순위는 아직 보이지 않는다.
    expect(screen.queryByText('깨어난 힘의 정수')).toBeNull();
    expect(String(popularCalls()[0][0])).toContain('window=24h');
  });

  it('시간이 지나면 다음 순위가 올라오고, 앞 순위는 밀려 나간 뒤 사라진다', async () => {
    stubPopular(body({ byCount: many(5) }));
    renderChart(() => {}, 200);
    await screen.findByText('아이템 1');

    expect(await screen.findByText('아이템 2')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('아이템 1')).toBeNull());
  });

  it('끝 순위 다음에는 1위로 돌아온다', async () => {
    stubPopular(body());
    renderChart(() => {}, 80);

    await screen.findByText('깨어난 힘의 정수');
    await waitFor(() => expect(screen.queryByText('낙지')).toBeInTheDocument());
  });

  it('마우스를 올리고 있는 동안은 넘기지 않는다', async () => {
    stubPopular(body());
    const { container } = renderChart(() => {}, 40);
    await screen.findByText('낙지');
    const strip = container.querySelector('.pt-ticker')?.parentElement
      ?.parentElement as HTMLElement;

    fireEvent.mouseEnter(strip);
    await wait(300);

    expect(screen.getByText('낙지')).toBeInTheDocument();
    expect(screen.queryByText('깨어난 힘의 정수')).toBeNull();
  });

  it('움직임 줄이기 설정이면 넘기지 않고 1위만 보인다', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      stubPopular(body());
      renderChart(() => {}, 40);
      await screen.findByText('낙지');

      await wait(300);

      expect(screen.queryByText('깨어난 힘의 정수')).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });

  it('총 거래 금액 순위로 바꾸면 띠도 그 순위를 보인다', async () => {
    stubPopular(body());
    renderChart();
    await screen.findByText('낙지');
    expand();
    fireEvent.click(screen.getByText('총 거래 금액'));
    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 접기' }));

    expect(await screen.findByText('깨어난 힘의 정수')).toBeInTheDocument();
    expect(screen.getByText(/^총 /)).toBeInTheDocument();
  });

  it('받지 못했거나 거래가 없으면 아무것도 그리지 않는다', async () => {
    stubPopular(new Response('{}', { status: 500 }));
    const failed = renderChart();
    await waitFor(() => expect(popularCalls().length).toBeGreaterThan(0));
    await waitFor(() => expect(failed.container.textContent).toBe(''));
    failed.unmount();

    stubPopular(body({ byCount: [], byTotal: [] }));
    const empty = renderChart();
    await waitFor(() => expect(popularCalls().length).toBeGreaterThan(0));
    await waitFor(() => expect(empty.container.textContent).toBe(''));
  });
});

describe('인기 거래 아이템 펼침', () => {
  it('띠를 누르면 10위까지 목록이 펼쳐지고, 다시 누르면 접힌다', async () => {
    stubPopular(body({ byCount: many(30) }));
    renderChart();
    await screen.findByText('아이템 1');

    expand();

    expect(await screen.findAllByRole('link')).toHaveLength(10);
    expect(screen.queryByText('아이템 11')).toBeNull();
    expect(screen.getByRole('button', { name: '인기 거래 아이템 접기' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: '인기 거래 아이템 접기' }));
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('띠의 어디를 눌러도 펼쳐진다. 오른쪽 끝 화살표까지 갈 필요가 없다', async () => {
    stubPopular(body());
    renderChart();

    fireEvent.click(await screen.findByText('인기 거래'));

    expect(await screen.findByRole('link', { name: '낙지' })).toBeInTheDocument();
  });

  it('펼친 머리줄을 눌러도 접힌다', async () => {
    stubPopular(body());
    renderChart();
    await screen.findByText('낙지');
    expand();

    fireEvent.click(await screen.findByText('인기 거래 아이템'));

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' })).toBeInTheDocument();
  });

  it('키보드로도 Enter 와 Space 로 펼치고 접는다', async () => {
    stubPopular(body());
    renderChart();
    await screen.findByText('낙지');

    fireEvent.keyDown(screen.getByRole('button', { name: '인기 거래 아이템 펼치기' }), {
      key: 'Enter',
    });
    expect(await screen.findByRole('link', { name: '낙지' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: '인기 거래 아이템 접기' }), { key: ' ' });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('펼침 상태는 기억하지 않는다', async () => {
    stubPopular(body());
    const first = renderChart();
    await screen.findByText('낙지');
    expand();
    first.unmount();

    renderChart();

    await screen.findByText('낙지');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('거래 횟수 순위와 총 거래 금액 순위를 오간다', async () => {
    stubPopular(body());
    renderChart();
    await screen.findByText('낙지');
    expand();

    const names = () => screen.getAllByRole('link').map((link) => link.textContent);
    expect(names()).toEqual(['낙지', '깨어난 힘의 정수']);
    expect(screen.getByText(/231회/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('총 거래 금액'));

    await waitFor(() => expect(names()).toEqual(['깨어난 힘의 정수', '낙지']));
  });

  it('기간을 바꾸면 그 기간을 묻는다', async () => {
    stubPopular(body());
    renderChart();
    await screen.findByText('낙지');
    expand();

    fireEvent.click(screen.getByText('7일'));

    await waitFor(() =>
      expect(popularCalls().some(([input]) => String(input).includes('window=7d'))).toBe(true),
    );
  });

  it('집계 기간과 수집 시각을 적고, 기록을 늦게 모았으면 그 날부터라고 밝힌다', async () => {
    stubPopular(body({ partial: true }));
    renderChart();
    await screen.findByText('낙지');
    expand();

    const line = await screen.findByText(/집계 .* ~ .*\(한국 시각\)/);
    expect(line.textContent).toContain('마지막 수집');
    expect(line.textContent).toContain('기록은 2026-09-23부터 모았습니다');
  });

  it('평균을 알 수 없는 줄은 0 골드로 적지 않는다', async () => {
    stubPopular(body({ byCount: [row('깨진 줄', 50, 1_310_000, null)] }));
    renderChart();
    await screen.findByText('깨진 줄');
    expand();

    expect(await screen.findByText(/50회/)).toBeInTheDocument();
    expect(screen.queryByText(/개당 평균/)).toBeNull();
  });

  it('줄의 검색 단추는 그 이름으로 경매장을 찾게 한다', async () => {
    stubPopular(body());
    const onSearch = vi.fn();
    renderChart(onSearch);
    await screen.findByText('낙지');
    expand();

    fireEvent.click(await screen.findByRole('button', { name: '낙지 경매장 검색' }));

    expect(onSearch).toHaveBeenCalledWith('낙지');
  });

  it('유물 옵션 줄은 이름과 검색 단추 모두 경매장의 그 옵션 매물로 간다', async () => {
    const relic: PopularRow = {
      ...row(
        '무리아스의 유물 - 오버 드라이브 폭발 공격 대미지',
        40,
        800_000_000,
        20_000_000,
        '유물',
      ),
      item: '무리아스의 유물',
      relic: '오버 드라이브 폭발 공격 대미지',
    };
    stubPopular(body({ byCount: [relic] }));
    const onSearch = vi.fn();
    renderChart(onSearch);
    await screen.findByText(relic.name);
    expand();

    const link = await screen.findByRole('link', { name: relic.name });
    expect(link.getAttribute('href')).toBe(
      `/auction?category=${encodeURIComponent('유물')}&relic=${encodeURIComponent('오버 드라이브 폭발 공격 대미지').replace(/%20/g, '+')}`,
    );
    fireEvent.click(screen.getByRole('button', { name: `${relic.name} 경매장 검색` }));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('이름은 아이템 정보로 가는 링크다', async () => {
    stubPopular(body());
    renderChart();
    await screen.findByText('낙지');
    expand();

    const link = await screen.findByRole('link', { name: '낙지' });
    expect(link.getAttribute('href')).toBe('/item/낙지?category=%EC%9D%8C%EC%8B%9D');
  });

  it('펼친 채로 거래가 없는 기간을 만나도 닫히지 않고 까닭을 보인다', async () => {
    stubPopular(body());
    renderChart();
    await screen.findByText('낙지');
    expand();
    stubPopular(body({ byCount: [], byTotal: [] }));

    fireEvent.click(screen.getByText('7일'));

    expect(await screen.findByText('이 기간에 거래된 아이템이 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인기 거래 아이템 접기' })).toBeInTheDocument();
  });

  it('펼친 채로 받지 못하면 까닭을 알린다', async () => {
    stubPopular(body());
    renderChart();
    await screen.findByText('낙지');
    expand();
    stubPopular(new Response('{}', { status: 500 }));

    fireEvent.click(screen.getByText('30일'));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/HTTP 500/)).toBeInTheDocument();
  });
});
