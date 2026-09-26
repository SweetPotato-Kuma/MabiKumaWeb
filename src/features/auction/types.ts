/** 아이템 세부 옵션 한 줄. */
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

/**
 * 매물 검색 조건.
 *
 * 이름으로 찾을 때는 keyword-search 만 쓴다. auction/list 의 item_name 은 정확한
 * 전체 이름만 받아서(부분 문자열은 OPENAPI00004) 검색어로 쓸 수 없다.
 * keyword-search 는 auction_item_category 를 무시하므로 카테고리는 화면에서 거른다.
 */
export interface AuctionSearchInput {
  /** 비우면 전체. 키워드와 함께 쓰면 받아온 결과를 이 카테고리로 거른다. */
  category: string;
  /** 쉼표나 공백으로 여러 단어. 단어가 이름에 모두 들어간 아이템을 찾는다. */
  keyword: string;
  /**
   * 전체 검색에서 keyword-search 로 나눠 보낼 검색어. 찾기를 누를 때 사전으로 정한다.
   * 비어 있으면 keyword 를 그대로 보낸다.
   */
  keywords?: string[];
  /** 걸린 이름이 너무 많아 keywords 를 다 보내지 못했다. */
  keywordsTruncated?: boolean;
  /**
   * 카테고리와 검색어 없이 상세 검색 조건만으로 찾을 때 차례로 불러올 카테고리.
   * 있으면 keyword-search 대신 이 카테고리들을 훑는다(useAuctionScanQuery).
   */
  scan?: string[];
}
