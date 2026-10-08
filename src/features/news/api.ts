import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getProxyUrl } from '@/lib/settings';

/**
 * 공식 홈페이지 새소식 기록. 워커가 10분마다 모아 둔다(worker/news.js).
 *
 * 공식 홈페이지는 글을 고쳐도 새 글을 올리지 않고 올린 글을 바꾼다. 워커가 올린 지 7일 안 된 글을 다시 읽어
 * 본문이 바뀌면 판(revision)을 하나 더 남기므로, 화면은 판끼리 비교해 무엇이 바뀌었는지 보여 줄 수 있다.
 */

/** 분류. 워커의 CATEGORIES 와 같다. */
export const NEWS_CATEGORIES = ['공지', '점검', '이벤트', '샵', '개발자 노트'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface NewsPost {
  id: number;
  board: 'notice' | 'update';
  category: string;
  title: string;
  author: string | null;
  /** 시각은 모두 초 단위 유닉스 시각이다. */
  postedAt: number;
  firstSeen: number;
  /** 본문이 바뀐 것을 마지막으로 본 시각 */
  editedAt: number | null;
  /** 판 수. 1 이면 처음 받은 그대로다 */
  revisions: number;
  /** 목록 맨 위 고정 글 */
  pinned: boolean;
  /** 공식 홈페이지에서 지워진 것을 본 시각 */
  deletedAt: number | null;
}

/** 지난 글 채우기. 다 채웠으면 'done', 아니면 다음에 읽을 쪽. */
export type BackfillState = 'done' | number;

export interface NewsListResponse {
  posts: NewsPost[];
  total: number;
  page: number;
  size: number;
  collectedAt: number | null;
  backfill: Record<'notice' | 'update', BackfillState>;
}

export interface NewsRevision {
  rev: number;
  title: string;
  /** 공식 홈페이지 본문 칸의 HTML 그대로. 그리기 전에 sanitize.ts 로 거른다 */
  body: string;
  seenAt: number;
}

export interface NewsPostResponse {
  post: NewsPost;
  revisions: NewsRevision[];
  /** 공식 홈페이지의 원래 주소 */
  source: string;
}

export interface NewsEvent {
  link: string;
  /** 받아 둔 이벤트 글이면 그 글 번호 */
  postId: number | null;
  title: string;
  summary: string | null;
  thumb: string | null;
  /** 목록에 적힌 기간 그대로("상시진행" 포함) */
  period: string | null;
  startsAt: number | null;
  endsAt: number | null;
}

export interface NewsEventsResponse {
  events: NewsEvent[];
  eventsAt: number | null;
}

export interface NewsListQuery {
  category: NewsCategory | '';
  q: string;
  edited: boolean;
  page: number;
}

/** 받아 둔 글 한 편의 주소. */
export const newsPostPath = (id: number) => `/news?id=${id}`;

export function canReadNews(): boolean {
  return getProxyUrl().length > 0;
}

async function getJson<T>(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(`${getProxyUrl()}${path}`);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (response.status === 429)
    throw new Error('조회가 잠시 몰렸습니다. 1분쯤 뒤에 다시 열어 주세요.');
  if (response.status === 404) throw new Error('받아 둔 글이 아닙니다.');
  if (!response.ok) throw new Error(`새소식 기록을 받지 못했습니다. (HTTP ${response.status})`);
  return (await response.json()) as T;
}

export function useNewsList(query: NewsListQuery) {
  return useQuery({
    queryKey: ['news', 'list', query],
    queryFn: ({ signal }) =>
      getJson<NewsListResponse>(
        '/news/list',
        {
          category: query.category,
          q: query.q.trim(),
          edited: query.edited ? '1' : '',
          page: query.page > 1 ? String(query.page) : '',
        },
        signal,
      ),
    enabled: canReadNews(),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useNewsPost(id: number | null) {
  return useQuery({
    queryKey: ['news', 'post', id],
    queryFn: ({ signal }) => getJson<NewsPostResponse>('/news/post', { id: String(id) }, signal),
    enabled: canReadNews() && id !== null,
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useNewsEvents() {
  return useQuery({
    queryKey: ['news', 'events'],
    queryFn: ({ signal }) => getJson<NewsEventsResponse>('/news/events', {}, signal),
    enabled: canReadNews(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const pieces = (formatter: Intl.DateTimeFormat, seconds: number) =>
  Object.fromEntries(
    formatter.formatToParts(new Date(seconds * 1000)).map((part) => [part.type, part.value]),
  );

/** 2026.10.08 (한국 시각) */
export function formatNewsDate(seconds: number): string {
  const { year, month, day } = pieces(dateFormatter, seconds);
  return `${year}.${month}.${day}`;
}

/** 2026.10.08 11:37 (한국 시각) */
export function formatNewsDateTime(seconds: number): string {
  const { year, month, day, hour, minute } = pieces(dateTimeFormatter, seconds);
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

/** 이벤트 남은 날. 끝나는 시각이 없으면(상시진행) null. 오늘 끝나면 "오늘 끝". */
export function eventRemaining(event: NewsEvent, now = Date.now()): string | null {
  if (event.endsAt === null) return null;
  const today = formatNewsDate(now / 1000);
  const last = formatNewsDate(event.endsAt);
  if (today === last) return '오늘 끝';
  const days = Math.round(
    (Date.parse(last.replaceAll('.', '-')) - Date.parse(today.replaceAll('.', '-'))) / 86_400_000,
  );
  return days > 0 ? `${days}일 남음` : null;
}
