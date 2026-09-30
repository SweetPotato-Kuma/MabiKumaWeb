import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type * as Settings from '@/lib/settings';
import type { HornPost, HornSearchResponse } from '@/features/horn/api';
import { getSettings, resetSettingsForTest, updateSettings } from '@/lib/userSettings';
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
  window.localStorage.clear();
  resetSettingsForTest();
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
  window.localStorage.clear();
  resetSettingsForTest();
});

describe('뿔피리 찾기', () => {
  it('묶인 글을 채널, 인원, 횟수와 함께 보여 준다', async () => {
    renderPage();

    const row = (await screen.findByText('새우엘 각2통 16릴 탈라 가흐')).closest('tr')!;
    expect(within(row).getByText('파티')).toBeInTheDocument();
    expect(within(row).getByText('15채널')).toBeInTheDocument();
    expect(within(row).getByText('5/8명')).toBeInTheDocument();
    expect(within(row).getByText(/부터 42번 외침$/)).toBeInTheDocument();
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

describe('캐릭터당 최신 1건만', () => {
  /** 같은 캐릭터 "디에" 가 문구를 바꿔 가며 세 번 외친 글과 다른 캐릭터의 글. */
  const character = (id: number, body: string, agoSeconds: number, who = '디에') => ({
    id,
    character: who,
    body,
    kind: 'party' as const,
    channel: 3,
    members: '3/8',
    times: 1,
    first: NOW_SECONDS - agoSeconds,
    last: NOW_SECONDS - agoSeconds,
  });

  beforeEach(() => {
    reply = () => ({
      server: '류트',
      days: 1,
      posts: [
        character(11, '크심 숙련팟 세1 딜2', 60),
        character(12, '재물 파티 구함', 90, '재물'),
        character(13, '크심 숙련팟 세1 딜1', 300),
        character(14, '크심 숙련팟 세1', 900),
      ],
      more: false,
      updated: new Date().toISOString(),
      since: null,
    });
  });

  it('꺼져 있으면 같은 캐릭터의 글이 모두 보인다', async () => {
    renderPage();

    expect(await screen.findByText('크심 숙련팟 세1 딜2')).toBeInTheDocument();
    expect(screen.getByText('크심 숙련팟 세1 딜1')).toBeInTheDocument();
    expect(screen.getByText('크심 숙련팟 세1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다른 글/ })).toBeNull();
  });

  it('켜면 캐릭터마다 가장 최근 글만 남고 나머지는 외 N건으로 접힌다', async () => {
    renderPage('/horn?latest=1');

    expect(await screen.findByText('크심 숙련팟 세1 딜2')).toBeInTheDocument();
    expect(screen.getByText('재물 파티 구함')).toBeInTheDocument();
    expect(screen.queryByText('크심 숙련팟 세1 딜1')).toBeNull();
    expect(screen.queryByText('크심 숙련팟 세1')).toBeNull();
    expect(screen.getByRole('button', { name: /디에 다른 글 2건 펼치기/ })).toHaveTextContent('외 2건');
  });

  it('외 N건을 누르면 그 캐릭터의 다른 글이 펼쳐지고, 다시 누르면 접힌다', async () => {
    renderPage('/horn?latest=1');
    fireEvent.click(await screen.findByRole('button', { name: /디에 다른 글 2건 펼치기/ }));

    expect(await screen.findByText('크심 숙련팟 세1 딜1')).toBeInTheDocument();
    expect(screen.getByText('크심 숙련팟 세1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /디에 다른 글 2건 접기/ }));
    // 접히는 줄은 움직임이 끝날 때까지 남을 수 있어 단추 상태로 본다.
    expect(await screen.findByRole('button', { name: /디에 다른 글 2건 펼치기/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('토글을 켜면 주소와 저장소에 남고, 개수 줄이 캐릭터 수를 알린다', async () => {
    const { container } = renderPage();
    await screen.findByText('크심 숙련팟 세1 딜2');

    fireEvent.click(screen.getByRole('switch', { name: '캐릭터당 최신 1건만' }));

    await waitFor(() => expect(getSettings().hornLatestOnly).toBe(true));
    expect(await screen.findByText(/4건 · 캐릭터 2명/)).toBeInTheDocument();
    expect(container.querySelector('[aria-checked="true"]')).not.toBeNull();
  });

  it('주소에 값이 없으면 마지막에 고른 값(저장소)으로 시작한다', async () => {
    updateSettings({ hornLatestOnly: true });
    renderPage();

    expect(await screen.findByRole('button', { name: /디에 다른 글 2건 펼치기/ })).toBeInTheDocument();
  });

  it('주소의 latest=0 은 저장소보다 우선한다', async () => {
    updateSettings({ hornLatestOnly: true });
    renderPage('/horn?latest=0');

    expect(await screen.findByText('크심 숙련팟 세1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /다른 글/ })).toBeNull();
  });
});

describe('뿔피리 표기', () => {
  it('제외 단어 라벨과 표시 범위 문구를 쓴다', async () => {
    renderPage();
    await screen.findByText('새우엘 각2통 16릴 탈라 가흐');

    expect(screen.getByLabelText('제외 단어')).toBeInTheDocument();
    expect(screen.queryByText('뺄 말')).toBeNull();
    // 더 있으면 전체 건수를 모르므로 지금 보여 주는 범위만 말한다.
    expect(screen.getByText('최근 2건 표시 중')).toBeInTheDocument();
    expect(screen.queryByText(/이상/)).toBeNull();
  });

  it('더 없으면 건수만 적는다', async () => {
    reply = () => ({ server: '류트', days: 1, posts: POSTS, more: false, updated: new Date().toISOString(), since: null });
    renderPage();

    expect(await screen.findByText('2건')).toBeInTheDocument();
  });

  it('분류 배지마다 색이 다르다', async () => {
    renderPage();
    const party = await screen.findByText('파티');
    const sell = screen.getByText('팝니다');

    expect(party.closest('.ant-tag')).not.toBeNull();
    expect((party.closest('.ant-tag') as HTMLElement).style.color).not.toBe('');
    expect((party.closest('.ant-tag') as HTMLElement).style.color).not.toBe(
      (sell.closest('.ant-tag') as HTMLElement).style.color,
    );
  });

  it('채널와 인원 배지는 분류 색을 쓰지 않는다', async () => {
    renderPage();
    const channel = await screen.findByText('15채널');

    expect((channel.closest('.ant-tag') as HTMLElement).style.color).toBe('');
  });

  it('인원이 가득 찬 파티는 흐리게 표시한다', async () => {
    reply = () => ({
      server: '류트',
      days: 1,
      posts: [
        { id: 21, character: '가득', body: '꽉 찬 파티', kind: 'party', channel: 1, members: '8/8', times: 1, first: NOW_SECONDS - 5, last: NOW_SECONDS - 5 },
        { id: 22, character: '여유', body: '자리 있는 파티', kind: 'party', channel: 1, members: '3/8', times: 1, first: NOW_SECONDS - 6, last: NOW_SECONDS - 6 },
      ],
      more: false,
      updated: new Date().toISOString(),
      since: null,
    });
    renderPage();

    const full = (await screen.findByText('꽉 찬 파티')).closest('div[class*="ant-flex"]') as HTMLElement;
    const open = screen.getByText('자리 있는 파티').closest('div[class*="ant-flex"]') as HTMLElement;

    expect(full.style.opacity).toBe('0.55');
    expect(open.style.opacity).toBe('');
  });
});
