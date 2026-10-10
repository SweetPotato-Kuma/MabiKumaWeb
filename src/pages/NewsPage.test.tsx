import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type * as Settings from '@/lib/settings';
import type {
  NewsBannersResponse,
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

const BANNERS: NewsBannersResponse = {
  updatedAt: POSTED,
  banners: [
    {
      id: '4893871',
      title: '가갸날 잔치',
      kind: '이벤트',
      image: 'https://ssl.nexon.com/mainb_hangul.jpg',
      link: 'https://mabinogi.nexon.com/page/news/event_view.asp?id=4893871',
      postId: 4893871,
    },
    {
      id: '4893844',
      title: '달에게 소원을 이벤트',
      kind: '업데이트',
      image: 'https://ssl.nexon.com/mainb_moon.jpg',
      link: 'https://mabinogi.nexon.com/page/event/2026/0922_moon/index.asp',
      postId: null,
    },
    {
      id: '4892915',
      title: '에린 커넥트',
      kind: '업데이트',
      image: 'https://ssl.nexon.com/mainb_connect.jpg',
      link: 'https://connect.mabinogi.nexon.com/',
      postId: null,
    },
  ],
};

const DEV_NOTE: NewsPost = {
  ...POSTS[0],
  id: 4893721,
  board: 'update',
  category: '개발자 노트',
  title: '[적용됨] RE:ACTION 2차 업데이트',
  author: '칼룬',
  revisions: 1,
  editedAt: null,
};

const KIT_INDEX = {
  updated: '2026-10-08',
  current: ['official-495'],
  kits: [
    {
      id: 'official-495',
      name: '나이트메어 판타지아 박스',
      start: '2026-10-01',
      end: '2026-10-14',
      price: 1200,
      count: 148,
    },
    {
      id: 'official-492',
      name: '비단 운문 한복 상자',
      start: '2026-09-10',
      end: '2026-09-30',
      price: 1200,
      count: 189,
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
      if (url.pathname === '/news/banners') return new Response(JSON.stringify(BANNERS));
      if (url.pathname === '/kits/index') return new Response(JSON.stringify(KIT_INDEX));
      if (url.pathname === '/news/list') {
        const category = url.searchParams.get('category');
        // 고친 글은 아직 없다.
        if (url.searchParams.get('edited') === '1')
          return new Response(JSON.stringify({ ...LIST, posts: [], total: 0 }));
        if (category === '개발자 노트')
          return new Response(JSON.stringify({ ...LIST, posts: [DEV_NOTE], total: 1 }));
        if (category) {
          const posts = LIST.posts.filter((post) => post.category === category);
          return new Response(JSON.stringify({ ...LIST, posts, total: posts.length }));
        }
      }
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

/**
 * 첫 화면 시험은 역할 질의(getByRole)를 쓰지 않는다. 배너, 새소식, 위젯, 바로가기 스무 장이 한 DOM 에 있어 역할과 이름을
 * 모두 계산하면 한 질의에 수 초가 걸린다. 또 페이드 캐러셀은 보이지 않는 칸에 aria-hidden 을 달아 역할 질의가 못 찾는다.
 */
describe('첫 화면', () => {
  it('이벤트 배너를 공식 메인처럼 넘기고, 처음에는 첫째와 둘째 그림만 받는다', async () => {
    renderAt('/');
    const first = await screen.findByAltText('[이벤트] 가갸날 잔치');
    expect(first).toHaveAttribute('src', 'https://ssl.nexon.com/mainb_hangul.jpg');
    // 받아 둔 새소식 글로 가는 배너는 우리 기록으로 잇는다.
    expect(first.closest('a')).toHaveAttribute('href', '/news?id=4893871');
    expect(screen.getByAltText('[업데이트] 달에게 소원을 이벤트').closest('a')).toHaveAttribute(
      'href',
      'https://mabinogi.nexon.com/page/event/2026/0922_moon/index.asp',
    );
    // 셋째는 아직 받지 않는다. 큰 그림을 한꺼번에 받지 않으려는 것이다.
    expect(screen.queryByAltText('[업데이트] 에린 커넥트')).toBeNull();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    // 하단의 "모두 보기" 단추는 없다.
    expect(screen.queryByText(/모두 보기/)).toBeNull();
  });

  it('다음 배너를 누르면 다음 그림을 받아 두고, 멈춤 단추로 자동 넘김을 끈다', async () => {
    renderAt('/');
    await screen.findByAltText('[이벤트] 가갸날 잔치');
    fireEvent.click(screen.getByLabelText('다음 배너'));
    // 둘째로 넘어가면 그 다음(셋째) 그림을 미리 받는다.
    const third = await screen.findByAltText('[업데이트] 에린 커넥트');
    expect(third.closest('a')).toHaveAttribute('target', '_blank');
    expect(third.closest('a')).toHaveAttribute('href', 'https://connect.mabinogi.nexon.com/');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('배너 자동 넘김 멈춤'));
    expect(screen.getByLabelText('배너 자동 넘김 재생')).toHaveAttribute('aria-pressed', 'true');
  });

  it('새소식 블록은 분류 탭으로 가르고 글은 우리 기록으로 연다', async () => {
    renderAt('/');
    const head = await screen.findByText('새소식', { selector: '.ant-card-head-title' });
    const block = head.closest('.ant-card') as HTMLElement;
    const title = await within(block).findByText('10/8(목) 정식 서버 점검 안내');
    expect(title.closest('a')).toHaveAttribute('href', '/news?id=4893864');

    fireEvent.click(within(block).getByText('이벤트', { selector: '.ant-segmented-item-label' }));
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('category')).toBe('이벤트'));
    await within(block).findByText('가갸날 잔치');
    expect(within(block).queryByText('10/8(목) 정식 서버 점검 안내')).toBeNull();
    expect(within(block).getByText('전체 보기', { exact: false }).closest('a')).toHaveAttribute(
      'href',
      '/news?c=%EC%9D%B4%EB%B2%A4%ED%8A%B8',
    );
  });

  it('위젯은 판매 중인 키트와 개발자 노트를 보이고, 기본으로 꺼 둔 고친 글은 그리지 않는다', async () => {
    renderAt('/');
    const kit = await screen.findByText('나이트메어 판타지아 박스');
    expect(kit.closest('a')).toHaveAttribute('href', '/kit-simulator');
    expect(screen.getByText('10.14까지, 1,200 캐시')).toBeInTheDocument();
    // 판매가 끝난 키트는 위젯에 없다.
    expect(screen.queryByText('비단 운문 한복 상자')).toBeNull();
    const note = await screen.findByText('[적용됨] RE:ACTION 2차 업데이트');
    expect(note.closest('a')).toHaveAttribute('href', '/news?id=4893721');
    // 고친 글 위젯은 기본 배치에서 꺼져 있어 목록을 묻지도 않는다.
    expect(requests.some((url) => url.searchParams.get('edited') === '1')).toBe(false);
    expect(screen.queryByText('고친 글', { selector: '.ant-card-head-title' })).toBeNull();
  });
});
