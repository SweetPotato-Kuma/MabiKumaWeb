import { nexonFetch } from '@/lib/nexonClient';
import type { AuctionHistoryResponse, AuctionListResponse } from './types';

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

/** 최근 1시간 거래 내역 조회 */
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
