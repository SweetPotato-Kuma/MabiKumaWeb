import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type * as Settings from '@/lib/settings';
import type { HornPost, HornSearchResponse } from '@/features/horn/api';
import { HornPage } from '@/pages/HornPage';

// 테스트 환경에는 워커 주소가 없다. 있는 것으로 두고 fetch 로 답한다.
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://w.example',
}));

vi.setConfig({ testTimeout: 20_000 });
/** antd 표를 처음 그리는 데 느린 기계에서 1초를 넘긴다. */
configure({ asyncUtilTimeout: 5_000 });

const NOW_SECONDS = Math.floor(Date.now() / 1000);

const POSTS: HornPost[] = [
  {
    id: 2,
    character: '재물',
    body: '새우엘 각2통 16릴 탈라 가흐',
    kind: 'party',
    channel: 15,
    members: '5/8',
    times: 42,
    first: NOW_SECONDS - 600,
    last: NOW_SECONDS - 5,
  },
  {
    id: 1,
    character: '은하수',
    body: '신비 보랏빛가방 1100 팝니다',
    kind: 'sell',
    channel: null,
    members: null,
    times: 1,
    first: NOW_SECONDS - 30,
    last: NOW_SECONDS - 30,
  },
];

let requests: URL[];
let reply: (url: URL) => HornSearchResponse;

function renderPage(path = '/horn') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <HornPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

beforeEach(() => {
  requests = [];
  reply = (url) => ({
    server: '류트',
    days: 1,
    posts: POSTS,
    more: url.searchParams.get('limit') === '50',
    updated: new Date().toISOString(),
    since: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      requests.push(url);
      return new Response(JSON.stringify(reply(url)));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('뿔피리 찾기', () => {
  it('묶인 글을 채널, 인원, 횟수와 함께 보여 준다', async () => {
    renderPage();

    const row = (await screen.findByText('새우엘 각2통 16릴 탈라 가흐')).closest('tr')!;
    expect(within(row).getByText('파티')).toBeInTheDocument();
    expect(within(row).getByText('15채널')).toBeInTheDocument();
    expect(within(row).getByText('5/8명')).toBeInTheDocument();
    expect(within(row).getByText(/^42번 · /)).toBeInTheDocument();
    expect(screen.getByText('팝니다')).toBeInTheDocument();
    expect(requests[0].searchParams.get('server')).toBe('류트');
    expect(requests[0].searchParams.get('days')).toBe('1');
  });

  it('검색어를 적으면 잠시 뒤 찾고, 걸린 곳을 칠한다', async () => {
    renderPage();
    await screen.findByText('새우엘 각2통 16릴 탈라 가흐');

    fireEvent.change(screen.getByLabelText('검색어'), { target: { value: '탈라가흐' } });

    await waitFor(() => expect(requests.at(-1)?.searchParams.get('q')).toBe('탈라가흐'));
    const mark = await screen.findByText('탈라 가흐', { selector: 'mark' });
    expect(mark).toBeInTheDocument();
  });

  it('이름을 누르면 그 캐릭터의 글만 찾고, 거르기 단추로 푼다', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '은하수' }));

    await waitFor(() => expect(requests.at(-1)?.searchParams.get('char')).toBe('은하수'));
    fireEvent.click(screen.getByRole('button', { name: '캐릭터 은하수 거르기 풀기' }));

    await waitFor(() => expect(requests.at(-1)?.searchParams.has('char')).toBe(false));
  });

  it('더 있으면 50개 더 보기로 줄 수를 늘린다', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '50개 더 보기' }));
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('limit')).toBe('100'));
  });

  it('주소에 담긴 조건으로 찾는다', async () => {
    renderPage('/horn?server=%EC%9A%B8%ED%94%84&days=7&kind=sell&q=%EB%B6%95%EB%A7%88%EC%A0%95');
    await screen.findByText('신비 보랏빛가방 1100 팝니다');
    const url = requests[0];
    expect(url.searchParams.get('server')).toBe('울프');
    expect(url.searchParams.get('days')).toBe('7');
    expect(url.searchParams.get('kind')).toBe('sell');
    expect(url.searchParams.get('q')).toBe('붕마정');
    expect(screen.getByLabelText('검색어')).toHaveValue('붕마정');
  });

  it('찾은 것이 없으면 조건을 바꾸라고 한다', async () => {
    reply = () => ({ server: '류트', days: 1, posts: [], more: false, updated: null, since: null });
    renderPage('/horn?q=%EC%97%86%EB%8A%94%EB%A7%90');
    expect(
      await screen.findByText('조건에 맞는 뿔피리가 없습니다. 기간을 늘리거나 검색어를 줄여 보세요.'),
    ).toBeInTheDocument();
  });
});
