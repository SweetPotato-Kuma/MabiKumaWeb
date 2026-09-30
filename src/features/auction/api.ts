import { nexonFetch } from '@/lib/nexonClient';
import { getProxyUrl } from '@/lib/settings';
import type { AuctionHistoryResponse, AuctionListResponse, TradeHistoryResponse } from './types';

/** 현재 판매 중인 매물 검색 (카테고리 / 아이템 이름) */
export function fetchAuctionList(
  params: { category?: string; itemName?: string; cursor?: string },
  signal?: AbortSignal,
): Promise<AuctionListResponse> {
  return nexonFetch<AuctionListResponse>(
    '/mabinogi/v1/auction/list',
    {
      auction_item_category: params.category,
      item_name: params.itemName,
      cursor: params.cursor,
    },
    signal,
  );
}

/** 현재 판매 중인 매물 키워드 검색 (쉼표로 최대 10개 단어) */
export function fetchAuctionKeywordSearch(
  params: { keyword: string; cursor?: string },
  signal?: AbortSignal,
): Promise<AuctionListResponse> {
  return nexonFetch<AuctionListResponse>(
    '/mabinogi/v1/auction/keyword-search',
    {
      keyword: params.keyword,
      cursor: params.cursor,
    },
    signal,
  );
}

/** 최근 1시간 거래 내역 조회. 워커가 없을 때만 쓰는 폴백이다(fetchTradeHistory 참고). */
export function fetchAuctionHistory(
  params: { category?: string; itemName?: string; cursor?: string },
  signal?: AbortSignal,
): Promise<AuctionHistoryResponse> {
  return nexonFetch<AuctionHistoryResponse>(
    '/mabinogi/v1/auction/history',
    {
      auction_item_category: params.category,
      item_name: params.itemName,
      cursor: params.cursor,
    },
    signal,
  );
}

/**
 * 워커가 10분마다 받아 D1 에 쌓아 둔 거래 원본에서 조건에 맞는 거래를 새것부터 훑는다
 * (worker/market.js 의 /market/history). 최근 1시간이 아니라 워커가 쌓기 시작한 날부터 볼 수 있다.
 *
 * 카테고리와 이름 모두 콤마로 여럿을 보낼 수 있다. 카테고리는 하나를 고르거나(상세 검색은
 * 여러 카테고리를 훑는다), 이름은 사전에서 검색어와 맞는 실제 이름들(matchingNames)이다.
 */
export function fetchTradeHistory(
  params: { categories?: string[]; names?: string[]; cursor?: string; limit?: number },
  signal?: AbortSignal,
): Promise<TradeHistoryResponse> {
  const url = new URL(`${getProxyUrl()}/market/history`);
  if (params.categories?.length) url.searchParams.set('category', params.categories.join(','));
  if (params.names?.length) url.searchParams.set('name', params.names.join(','));
  if (params.cursor) url.searchParams.set('cursor', params.cursor);
  if (params.limit) url.searchParams.set('limit', String(params.limit));

  return fetch(url, { headers: { accept: 'application/json' }, signal }).then(async (response) => {
    if (response.status === 429) throw new Error('조회가 잠시 몰렸습니다. 1분쯤 뒤에 다시 시도해 주세요.');
    if (!response.ok) throw new Error(`거래 내역을 받지 못했습니다. (HTTP ${response.status})`);
    return (await response.json()) as TradeHistoryResponse;
  });
}
