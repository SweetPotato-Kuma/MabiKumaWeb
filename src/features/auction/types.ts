/** 아이템 세부 옵션 한 줄. 경매장·NPC 상점 응답이 같은 모양을 쓴다. */
export interface ItemOption {
  option_type: string;
  option_sub_type?: string;
  option_value?: string;
  option_value2?: string;
  option_desc?: string;
}

/** 경매장에 올라와 있는 매물 한 건. */
export interface AuctionItem {
  item_name: string;
  item_display_name: string;
  item_count: number;
  auction_item_category: string;
  auction_price_per_unit: number;
  date_auction_expire: string;
  item_option?: ItemOption[];
}

export interface AuctionListResponse {
  auction_item: AuctionItem[];
  next_cursor: string | null;
}

/** 최근 1시간 안에 팔린 거래 한 건. */
export interface AuctionHistoryItem {
  item_name: string;
  item_display_name: string;
  item_count: number;
  auction_item_category: string;
  auction_price_per_unit: number;
  date_auction_buy: string;
  auction_buy_id: string;
  item_option?: ItemOption[];
}

export interface AuctionHistoryResponse {
  auction_history: AuctionHistoryItem[];
  next_cursor: string | null;
}

/** 매물 검색 방식: 카테고리/이름 검색과 키워드 검색은 엔드포인트가 다르다. */
export type AuctionSearchMode = 'list' | 'keyword';

export interface AuctionSearchInput {
  mode: AuctionSearchMode;
  /** mode === 'list' 에서 사용 */
  category: string;
  itemName: string;
  /** mode === 'keyword' 에서 사용. 쉼표로 최대 10개 단어 */
  keyword: string;
}
