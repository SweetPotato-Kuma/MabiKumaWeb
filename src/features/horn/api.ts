import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ServerName } from '@/features/servers/constants';
import { getProxyUrl } from '@/lib/settings';
import { decodeHornText } from './terms';

/**
 * 거대한 외침의 뿔피리 찾기. 워커가 모아 둔 기록에서 찾는다(worker/horn.js).
 *
 * 넥슨 API 는 서버마다 최근 1,000건만 주므로 지난 글은 이 기록으로만 찾을 수 있다. 워커는 찾을 때
 * 그 서버를 받은 지 1분이 넘었으면 먼저 받으므로, 1분마다 다시 물으면 새 글이 들어온다.
 */

export type HornKind = 'party' | 'buy' | 'sell' | 'chat';

/** 화면의 분류 고르기. 워커의 KIND_FILTERS 와 같다. */
export type HornKindFilter = 'all' | 'noparty' | 'party' | 'buy' | 'sell';

/** 찾을 수 있는 기간(일). 워커의 SEARCH_DAYS 와 같다. */
export const HORN_DAYS = [1, 7, 30, 90] as const;
export type HornDays = (typeof HORN_DAYS)[number];

/** 한 번에 늘리는 줄 수와 상한. 상한은 워커의 SEARCH_MAX_LIMIT 과 같다. */
export const HORN_PAGE = 50;
export const HORN_MAX_LIMIT = 500;

/** 같은 캐릭터가 같은 글을 30분 안에 다시 외친 것은 한 줄로 합쳐져 있다. */
export interface HornPost {
  id: number;
  character: string;
  /** "이름 : " 과 파티 광고의 채널, 인원을 뗀 본문 */
  body: string;
  kind: HornKind;
  channel: number | null;
  /** 파티 광고의 가장 최근 인원 "3/4" */
  members: string | null;
  /** 외친 횟수 */
  times: number;
  /** 처음과 마지막으로 외친 시각(초 단위 유닉스 시각) */
  first: number;
  last: number;
}

export interface HornSearchResponse {
  server: ServerName;
  days: number;
  posts: HornPost[];
  /** 줄 수 상한을 넘어 더 있다 */
  more: boolean;
  /** 그 서버를 마지막으로 받은 시각(ISO) */
  updated: string | null;
  /** 기록을 모으기 시작한 시각(ISO) */
  since: string | null;
}

export interface HornSearch {
  server: ServerName;
  days: HornDays;
  kind: HornKindFilter;
  q: string;
  not: string;
  character: string;
  limit: number;
}

/** 새 글이 들어오는 간격. 워커가 서버를 다시 받는 간격(1분)과 같다. */
export const HORN_REFRESH_MS = 60 * 1000;

export function canSearchHorns(): boolean {
  return getProxyUrl().length > 0;
}

export async function fetchHorns(search: HornSearch, signal?: AbortSignal): Promise<HornSearchResponse> {
  const url = new URL(`${getProxyUrl()}/horn/search`);
  url.searchParams.set('server', search.server);
  url.searchParams.set('days', String(search.days));
  url.searchParams.set('limit', String(search.limit));
  if (search.kind !== 'all') url.searchParams.set('kind', search.kind);
  if (search.q.trim()) url.searchParams.set('q', search.q.trim());
  if (search.not.trim()) url.searchParams.set('not', search.not.trim());
  if (search.character) url.searchParams.set('char', search.character);

  const response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (response.status === 429) {
    throw new Error('조회가 잠시 몰렸습니다. 1분쯤 뒤에 다시 찾아 주세요.');
  }
  if (!response.ok) throw new Error(`뿔피리 기록을 받지 못했습니다. (HTTP ${response.status})`);
  const data = (await response.json()) as HornSearchResponse;
  return { ...data, posts: data.posts.map((post) => ({ ...post, body: decodeHornText(post.body) })) };
}

/**
 * 뿔피리 찾기. live 면 1분마다 다시 묻는다. background 면 탭이 가려져 있어도 묻는다(새 글 알림).
 * 조건을 바꾸는 동안에는 앞 결과를 그대로 두어 표가 깜빡이지 않게 한다.
 */
export function useHornSearch(search: HornSearch, { live, background }: { live: boolean; background: boolean }) {
  return useQuery({
    queryKey: ['horn', search],
    queryFn: ({ signal }) => fetchHorns(search, signal),
    enabled: canSearchHorns(),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchInterval: live ? HORN_REFRESH_MS : false,
    refetchIntervalInBackground: background,
    retry: false,
  });
}
