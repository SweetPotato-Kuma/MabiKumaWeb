import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type * as Settings from '@/lib/settings';
import type {
  NewsEventsResponse,
  NewsListResponse,
  NewsPost,
  NewsPostResponse,
} from '@/features/news/api';
import { HomePage } from '@/pages/HomePage';
import { NewsPage } from '@/pages/NewsPage';

// 테스트 환경에는 워커 주소가 없다. 있는 것으로 두고 fetch 로 답한다.
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://w.example',
}));

/** 2026-10-08 11:37 KST. */
const POSTED = Date.parse('2026-10-08T02:37:00Z') / 1000;

const POSTS: NewsPost[] = [
  {
    id: 4893864,
    board: 'notice',
    category: '공지',
    title: '10/8(목) 정식 서버 점검 안내',
    author: '조이에',
    postedAt: POSTED,
    firstSeen: POSTED + 120,
    editedAt: POSTED + 3600,
    revisions: 2,
    pinned: false,
    deletedAt: null,
  },
  {
    id: 4893871,
    board: 'notice',
    category: '이벤트',
    title: '가갸날 잔치',
    author: '마비노기',
    postedAt: POSTED - 600,
    firstSeen: POSTED,
    editedAt: null,
    revisions: 1,
    pinned: false,
    deletedAt: null,
  },
];

const LIST: NewsListResponse = {
  posts: POSTS,
  total: 2,
  page: 1,
  size: 20,
  collectedAt: POSTED + 3600,
  backfill: { notice: 120, update: 'done' },
};

const POST: NewsPostResponse = {
  post: POSTS[0],
  revisions: [
    {
      rev: 1,
      title: '[공지] 10/8(목) 정식 서버 점검 안내',
      body: '<div class="view_cont"><p>점검 시간: 06:00~11:00</p><script>alert(1)</script></div>',
      seenAt: POSTED + 120,
    },
    {
      rev: 2,
      title: '[공지] 10/8(목) 정식 서버 점검 안내',
      body: '<div class="view_cont"><p>점검 시간: 06:00~11:30</p><p><a href="notice_view.asp?id=4893871">가갸날 잔치</a></p></div>',
      seenAt: POSTED + 3600,
    },
  ],
  source: 'https://mabinogi.nexon.com/page/news/notice_view.asp?id=4893864',
};

const EVENTS: NewsEventsResponse = {
  eventsAt: POSTED,
  events: [
    {
      link: 'https://mabinogi.nexon.com/page/news/event_view.asp?id=4893871',
      postId: 4893871,
      title: '가갸날 잔치',
      summary: '가갸날 세움 100돌 맞이',
      thumb: 'https://ssl.nexon.com/listb_hangul.jpg',
      period: '2026.10.08 11:30:00~2026.10.21 23:59:00',
      startsAt: Date.parse('2026-10-08T02:30:00Z') / 1000,
      endsAt: Date.parse('2026-10-21T14:59:00Z') / 1000,
    },
    {
      link: 'https://connect.mabinogi.nexon.com/',
      postId: null,
      title: '에린 커넥트',
      summary: null,
      thumb: null,
      period: '상시진행',
      startsAt: null,
      endsAt: null,
    },
  ],
};

let requests: URL[];

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/news" element={<NewsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname === '/news/post') {
        return url.searchParams.get('id') === '4893864'
          ? new Response(JSON.stringify(POST))
          : new Response('{}', { status: 404 });
      }
      if (url.pathname === '/news/events') return new Response(JSON.stringify(EVENTS));
      return new Response(JSON.stringify(LIST));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('새소식 목록', () => {
  it('일부 갱신 실패를 정상 수집으로 표시하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ...LIST, failedSteps: ['notice'] }))),
    );
    renderAt('/news');
    expect(
      await screen.findByText('일부 갱신을 완료하지 못했습니다. 다음 수집에서 다시 시도합니다.'),
    ).toBeInTheDocument();
  });
  it('글마다 분류와 날짜, 고친 횟수를 보여 주고 지난 글을 채우는 중이라고 알린다', async () => {
    renderAt('/news');
    const title = await screen.findByRole('link', { name: '10/8(목) 정식 서버 점검 안내' });
    expect(title).toHaveAttribute('href', '/news?id=4893864');
    const row = title.closest('li')!;
    expect(within(row).getByText('공지')).toBeInTheDocument();
    expect(within(row).getByText('고침 1')).toBeInTheDocument();
    expect(within(row).getByText('2026.10.08')).toBeInTheDocument();
    expect(screen.getByText('지난 글을 채우는 중')).toBeInTheDocument();
  });

  it('분류를 고르거나 제목을 찾으면 그 조건으로 다시 묻는다', async () => {
    renderAt('/news');
    await screen.findByText('가갸날 잔치');

    // 시험 환경은 좁은 화면이라 분류는 고르기 상자다.
    fireEvent.mouseDown(screen.getByLabelText('분류'));
    fireEvent.click(await screen.findByTitle('고친 글'));
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('edited')).toBe('1'));

    fireEvent.mouseDown(screen.getByLabelText('분류'));
    fireEvent.click(await screen.findByTitle('점검'));
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('category')).toBe('점검'));
    expect(requests.at(-1)?.searchParams.has('edited')).toBe(false);

    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '패치' } });
    fireEvent.click(screen.getByRole('button', { name: /찾기/ }));
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('q')).toBe('패치'));
  });
});

describe('새소식 글 한 편', () => {
  it('마지막 판의 본문을 걸러 그리고 받아 둔 글 링크는 우리 기록으로 잇는다', async () => {
    const { container } = renderAt('/news?id=4893864');
    expect(
      await screen.findByRole('heading', { name: '10/8(목) 정식 서버 점검 안내' }),
    ).toBeInTheDocument();
    expect(screen.getByText('점검 시간: 06:00~11:30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '가갸날 잔치' })).toHaveAttribute(
      'href',
      '/news?id=4893871',
    );
    expect(screen.getByRole('link', { name: /공식 홈페이지/ })).toHaveAttribute(
      'href',
      POST.source,
    );
    expect(container.querySelector('.news-body script')).toBeNull();
  });

  it('바뀐 곳을 고르면 앞 판에서 지운 줄과 더한 줄을 보여 준다', async () => {
    renderAt('/news?id=4893864');
    await screen.findByText('점검 시간: 06:00~11:30');

    fireEvent.click(screen.getByText('바뀐 곳'));
    const removed = await screen.findByRole('listitem', { name: '지운 줄' });
    expect(removed).toHaveTextContent('점검 시간: 06:00~11:00');
    expect(within(removed).getByText('06:00~11:00', { selector: 'del' })).toBeInTheDocument();
    const added = screen.getAllByRole('listitem', { name: '더한 줄' });
    expect(added.map((line) => line.textContent)).toEqual([
      '+점검 시간: 06:00~11:30',
      '+가갸날 잔치',
    ]);
  });

  it('처음 판을 고르면 그 판의 본문을 보여 주고 바뀐 곳은 고를 수 없다', async () => {
    renderAt('/news?id=4893864&rev=1');
    expect(await screen.findByText('점검 시간: 06:00~11:00')).toBeInTheDocument();
    expect(screen.getByText('바뀐 곳').closest('.ant-segmented-item')).toHaveClass(
      'ant-segmented-item-disabled',
    );
  });

  it('받아 둔 글이 아니면 공식 홈페이지로 가는 길을 준다', async () => {
    renderAt('/news?id=1');
    expect(await screen.findByText('받아 둔 글이 아닙니다.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /공식 홈페이지에서 보기/ })).toHaveAttribute(
      'href',
      'https://mabinogi.nexon.com/page/news/notice_view.asp?id=1',
    );
  });
});

describe('첫 화면의 새소식', () => {
  it('진행 중인 이벤트와 최근 새소식을 보여 준다', async () => {
    renderAt('/');
    const event = await screen.findByText('가갸날 세움 100돌 맞이');
    expect(event.closest('a')).toHaveAttribute('href', '/news?id=4893871');
    expect(screen.getByText('10.08 ~ 10.21')).toBeInTheDocument();
    expect(screen.getByText('상시진행')).toBeInTheDocument();
    expect(screen.getByText('에린 커넥트').closest('a')).toHaveAttribute(
      'href',
      'https://connect.mabinogi.nexon.com/',
    );
    expect(
      await screen.findByRole('link', { name: '10/8(목) 정식 서버 점검 안내' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /전체 보기/ })).toHaveAttribute('href', '/news');
  });
});
