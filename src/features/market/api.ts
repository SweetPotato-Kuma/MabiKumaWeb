import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getProxyUrl } from '@/lib/settings';

/**
 * 경매장 시세 기록. 워커가 10분마다 거래 내역을 받아 쌓아 둔 것을 읽는다(worker/market.js).
 *
 * 거래 내역 API 는 최근 1시간만 주므로 "최근 1일" 과 날짜별 그래프는 이 기록으로만 볼 수 있다.
 * 기록은 10분마다 바뀌고 워커도 5분 캐시하므로 여기서도 5분 동안은 다시 묻지 않는다.
 */

/** 기간 하나의 개당 가격 요약. 중위는 거래 건수 기준, 평균은 수량 가중이다. */
export interface PriceSummary {
  /** 거래 건수 */
  n: number;
  /** 거래된 수량 합 */
  qty: number;
  lo: number;
  hi: number;
  mid: number;
  avg: number;
}

export interface RecentSummary extends PriceSummary {
  /** 마지막 거래 시각(ISO) */
  last: string;
}

export interface DailySummary extends PriceSummary {
  /** 한국 시각 날짜 "2026-09-25" */
  date: string;
}

/** 한 시간의 요약. 시간은 한국 시각이다. */
export interface HourlySummary extends PriceSummary {
  /** 한국 시각 날짜 "2026-09-25" */
  date: string;
  /** 0~23 */
  hour: number;
}

export interface MarketItemResponse {
  name: string;
  days: number;
  recent: RecentSummary | null;
  daily: DailySummary[];
  /** 최근 7일 시간별 요약. 거래가 없던 시간은 빠진다. 워커가 예전 모양으로 답하면 없다. */
  hourly?: HourlySummary[];
  /** 기록을 모으기 시작한 날. 그보다 앞은 비어 있는 것이 정상이다. */
  since: string | null;
  /** 마지막으로 받은 시각(ISO) */
  updated: string | null;
}

export interface MarketRecentResponse {
  items: Record<string, RecentSummary>;
  since: string | null;
  updated: string | null;
}

/**
 * 무리아스의 유물 옵션 하나의 거래가 추이(worker/market.js 의 marketRelicSeries). 문장 하나가 레벨 하나라
 * 문장마다 날짜별 거래가를 준다. 문장을 레벨로 읽는 일은 화면이 한다(features/relics/trend.ts).
 */
export interface RelicSeriesResponse {
  option: string;
  days: number;
  /** [문장, 날짜, 거래 건수, 수량, 최저, 중위, 최고, 거래 금액 합] */
  daily: [string, string, number, number, number, number, number, number][];
  /** [문장, 개당 가격, 수량, 거래 시각(ISO)] 새것부터 */
  recent: [string, number, number, string][];
  since: string | null;
  updated: string | null;
}

/** 무리아스의 유물 문장(레벨)마다 최근 1일 통계(marketRelicRecent). */
export interface RelicRecentResponse {
  items: Record<string, RecentSummary>;
  since: string | null;
  updated: string | null;
}

/** 인기 거래 아이템의 집계 기간. 워커의 POPULAR_WINDOWS 와 같다. */
export type PopularWindow = '1h' | '24h' | '7d' | '30d';

export interface PopularRow {
  name: string;
  category: string;
  /** 거래 횟수 */
  n: number;
  /** 거래된 수량 합 */
  qty: number;
  /** 총 거래 금액 */
  total: number;
  /** 수량 가중 개당 평균. 수량을 알 수 없으면 null(0 으로 적지 않는다). */
  avg: number | null;
}

export interface PopularResponse {
  window: PopularWindow;
  /** 집계 기간의 처음과 끝(ISO). 1시간과 24시간은 지금에서 거꾸로, 7일과 30일은 한국 시각 날짜로 센다. */
  from: string;
  to: string;
  /** 기록을 모으기 시작한 날이 집계 기간보다 늦어, 그 날부터의 순위라는 뜻이다. */
  partial: boolean;
  /** 거래 횟수가 많은 순. */
  byCount: PopularRow[];
  /** 총 거래 금액이 많은 순. */
  byTotal: PopularRow[];
  since: string | null;
  /** 마지막으로 받은 시각(ISO) */
  updated: string | null;
}

/** 한 번에 물을 수 있는 이름 수. 워커의 RECENT_MAX_NAMES 와 같다. */
export const RECENT_MAX_NAMES = 60;

const FIVE_MINUTES = 5 * 60 * 1000;

export function canLookupMarket(): boolean {
  return getProxyUrl().length > 0;
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 429)
    throw new Error('조회가 잠시 몰렸습니다. 1분쯤 뒤에 다시 열어 주세요.');
  if (!response.ok) throw new Error(`시세 기록을 받지 못했습니다. (HTTP ${response.status})`);
  return (await response.json()) as T;
}

/**
 * 시세 기록을 받는다. 연결이 끊기거나 워커가 CORS 헤더 없이 터지면 브라우저는 까닭 없이 "Failed to fetch" 만 던진다.
 * 화면에 그대로 보이면 무슨 일인지 알 수 없어 읽을 수 있는 문장으로 바꾼다.
 */
async function fetchMarketJson<T>(url: string | URL, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('시세 기록을 받지 못했습니다. 연결을 확인하고 잠시 뒤 다시 열어 보세요.');
  }
  return readJson<T>(response);
}

export async function fetchMarketItem(
  name: string,
  signal?: AbortSignal,
): Promise<MarketItemResponse> {
  const response = await fetch(`${getProxyUrl()}/market/item?name=${encodeURIComponent(name)}`, {
    headers: { accept: 'application/json' },
    signal,
  });
  return readJson<MarketItemResponse>(response);
}

export async function fetchMarketRecent(
  names: string[],
  signal?: AbortSignal,
): Promise<MarketRecentResponse> {
  const response = await fetch(`${getProxyUrl()}/market/recent`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ names }),
    signal,
  });
  return readJson<MarketRecentResponse>(response);
}

export async function fetchMarketPopular(
  window: PopularWindow,
  signal?: AbortSignal,
): Promise<PopularResponse> {
  return fetchMarketJson<PopularResponse>(`${getProxyUrl()}/market/popular?window=${window}`, signal);
}

/** 유물 옵션 하나의 레벨별 거래가 추이. 창을 열 때만 묻는다(enabled). */
export function useRelicSeriesQuery(option: string, enabled = true) {
  return useQuery({
    queryKey: ['market', 'relicSeries', option],
    queryFn: async ({ signal }) => {
      const url = new URL(`${getProxyUrl()}/market/relic-series`);
      url.searchParams.set('option', option);
      return fetchMarketJson<RelicSeriesResponse>(url, signal);
    },
    enabled: enabled && canLookupMarket() && option !== '',
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}

/** 유물 문장(레벨)마다 최근 1일 통계. 경매장이 유물 줄에 그 레벨의 시세를 붙일 때 쓴다. */
export function useRelicRecentQuery(enabled = true) {
  return useQuery({
    queryKey: ['market', 'relicRecent'],
    queryFn: ({ signal }) => fetchMarketJson<RelicRecentResponse>(`${getProxyUrl()}/market/relic-recent`, signal),
    enabled: enabled && canLookupMarket(),
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}

/** 인기 거래 아이템 순위. 펼쳤을 때만 묻는다(enabled). */
export function useMarketPopularQuery(window: PopularWindow, enabled: boolean) {
  return useQuery({
    queryKey: ['market', 'popular', window],
    queryFn: ({ signal }) => fetchMarketPopular(window, signal),
    enabled: enabled && canLookupMarket(),
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}

/** 아이템 하나의 최근 1일 통계와 날짜별 요약. */
export function useMarketItemQuery(name: string, enabled = true) {
  return useQuery({
    queryKey: ['market', 'item', name],
    queryFn: ({ signal }) => fetchMarketItem(name, signal),
    enabled: enabled && canLookupMarket() && name !== '',
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}

/**
 * 이름을 묻는 순서대로 60개씩 끊는다. 목록 뒤에 줄이 더 붙어도 앞 묶음은 그대로라 다시 묻지 않는다.
 */
export function chunkNames(names: readonly string[], size = RECENT_MAX_NAMES): string[][] {
  const unique = [...new Set(names.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

/**
 * 이름 여럿의 최근 1일 통계. 경매장 목록처럼 여러 아이템이 섞인 화면에서 줄마다 붙인다.
 * 거래가 없던 이름은 items 에 없다. isLoading 은 아직 받는 중인 묶음이 있는지다.
 */
export function useMarketRecentQuery(names: readonly string[], enabled = true) {
  const chunks = useMemo(() => chunkNames(names), [names]);
  return useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: ['market', 'recent', chunk],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchMarketRecent(chunk, signal),
      enabled: enabled && canLookupMarket(),
      staleTime: FIVE_MINUTES,
      retry: false,
    })),
    combine: mergeRecent,
  });
}

/**
 * 묶음별 결과를 하나로 합친다. 모듈 수준 함수라 react-query 가 결과가 바뀔 때만 다시 부른다.
 * 그래서 받은 값이 그대로면 같은 객체가 나가고 표도 다시 그려지지 않는다.
 */
function mergeRecent(results: { data?: MarketRecentResponse; isLoading: boolean; isError: boolean }[]): {
  items: Record<string, RecentSummary>;
  isLoading: boolean;
  /** 받지 못한 묶음이 있는지. 거래가 없던 것과 갈라 볼 수 있게 한다. */
  failed: boolean;
  /** 워커가 거래 기록을 마지막으로 받은 시각(ISO). 묶음이 여럿이면 가장 오래된 것이다. 모르면 null. */
  updated: string | null;
} {
  const updates = results.flatMap((result) => (result.data?.updated ? [result.data.updated] : []));
  return {
    items: Object.assign({}, ...results.map((result) => result.data?.items ?? {})) as Record<
      string,
      RecentSummary
    >,
    isLoading: results.some((result) => result.isLoading),
    failed: results.some((result) => result.isError),
    updated: updates.length > 0 ? updates.reduce((oldest, each) => (each < oldest ? each : oldest)) : null,
  };
}

export interface OptionTradesResponse {
  name: string;
  type: string;
  /** 옵션 문장마다 가장 최근 거래. [문장, 개당 가격, 거래 시각(ISO)]. */
  trades: [string, number, string][];
  since: string | null;
  updated: string | null;
}

/**
 * 한 아이템의 옵션 문장마다 가장 최근 거래(worker/market.js 의 marketOptionTrades). 유물 시세가
 * 지금 매물이 없는 레벨에 최종 거래가를 적을 때 쓴다. 기록이 없는 환경에서는 묻지 않는다.
 */
export function useOptionTradesQuery(name: string, type: string, enabled = true) {
  return useQuery({
    queryKey: ['market', 'optionTrades', name, type],
    queryFn: async ({ signal }) => {
      const url = new URL(`${getProxyUrl()}/market/option-trades`);
      url.searchParams.set('name', name);
      url.searchParams.set('type', type);
      return readJson<OptionTradesResponse>(await fetch(url, { signal }));
    },
    enabled: enabled && canLookupMarket(),
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}
