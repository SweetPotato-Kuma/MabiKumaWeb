import { useQuery } from '@tanstack/react-query';
import { fetchAuctionList } from '@/features/auction/api';
import type { AuctionItem } from '@/features/auction/types';
import type { ColorChannels } from '@/features/colorChannels';
import { isSturdyBag } from './groups';
import { narrowParts, scoreBagColors } from './listings';

/**
 * 경매장에 올라온 튼튼한 주머니.
 *
 * 경매장 카테고리 "주머니" 에는 튼튼한 주머니 42종과 함께 일반 주머니(양털 주머니, 고급 가죽 주머니, 커다란
 * 양털 주머니 등)도 있다. 카테고리 하나를 쪽 끝까지 받은 뒤 튼튼한 주머니만 남긴다. 일반 주머니는 이 화면이 찾는
 * 것이 아니고 색칠 지도에도 없다. 경매장은 서버를 가리지 않으므로 서버를 고르지 않는다. 색은 매물의 옵션 "아이템 색상" 에
 * 파트마다 "r,g,b" 로 들어 있다.
 */
export const BAG_AUCTION_CATEGORY = '주머니';

/** 한 번에 받는 쪽 수의 상한. 한 쪽이 수백 건이라 이만큼이면 올라온 주머니가 다 들어온다. */
const MAX_PAGES = 10;
const FIVE_MINUTES = 5 * 60 * 1000;

const PARTS = ['A', 'B', 'C'] as const;

export interface AuctionBagListing {
  key: string;
  name: string;
  /** 파트 A, B, C 순서의 6자리 16진수. 매물에 없는 파트는 빠진다. */
  colors: string[];
  /** 개당 가격. */
  price: number;
  count: number;
  /** 판매 마감 시각(ISO). */
  expire: string;
  /** 건 조건의 바라는 값에 가까운 정도(0~100). 조건이 없으면 null. */
  score: number | null;
  comparedParts: number[];
}

const hex2 = (value: number) => value.toString(16).padStart(2, '0');

/** "12,34,56" 을 "0c2238" 로. 읽을 수 없으면 null. */
function rgbTextToHex(value: string | undefined): string | null {
  const parts = (value ?? '').split(',').map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return null;
  return parts.map(hex2).join('');
}

/** 매물의 파트별 색. 파트 A 부터 차례로, 처음 빠진 파트에서 멈춘다. */
export function bagColorsOf(item: AuctionItem): string[] {
  const options = item.item_option ?? [];
  const colors: string[] = [];
  for (const part of PARTS) {
    const option = options.find(
      (entry) => entry.option_type === '아이템 색상' && entry.option_sub_type === `파트 ${part}`,
    );
    const hex = rgbTextToHex(option?.option_value);
    if (!hex) break;
    colors.push(hex);
  }
  return colors;
}

interface AuctionListingOptions {
  /** 볼 주머니 이름. null 이면 모든 주머니. */
  bagNames: ReadonlySet<string> | null;
  /** 파트 A, B, C 의 채널별 조건. NPC 상점과 같은 규칙으로 거른다. */
  parts: readonly (ColorChannels | null)[];
}

/** 받은 매물에서 조건에 든 주머니만, 조건이 있으면 가까운 순으로, 없으면 싼 순으로 늘어놓는다. */
export function buildAuctionBagListings(
  items: readonly AuctionItem[],
  options: AuctionListingOptions,
): AuctionBagListing[] {
  const narrowed = narrowParts(options.parts);
  const comparedParts = narrowed.map((entry) => entry.part);
  const rows: AuctionBagListing[] = [];
  items.forEach((item, index) => {
    if (!isSturdyBag(item.item_name)) return;
    if (options.bagNames && !options.bagNames.has(item.item_name)) return;
    const colors = bagColorsOf(item);
    const score = scoreBagColors(colors, narrowed);
    if (score === false) return;
    rows.push({
      key: `${item.item_name}|${item.date_auction_expire}|${index}`,
      name: item.item_name,
      colors,
      price: item.auction_price_per_unit,
      count: item.item_count,
      expire: item.date_auction_expire,
      score,
      comparedParts,
    });
  });
  rows.sort((a, b) => {
    if (narrowed.length > 0) {
      const byScore = (b.score ?? 0) - (a.score ?? 0);
      if (byScore !== 0) return byScore;
    }
    return a.price - b.price || a.name.localeCompare(b.name, 'ko');
  });
  return rows;
}

export interface AuctionBagsResult {
  items: AuctionItem[];
  /** 쪽 상한에 걸려 끝까지 받지 못했다. */
  truncated: boolean;
  /** 받은 시각. */
  at: number;
}

/** "주머니" 카테고리를 쪽 끝까지(많아야 MAX_PAGES 쪽) 받는다. */
export async function fetchAuctionBags(signal?: AbortSignal): Promise<AuctionBagsResult> {
  const items: AuctionItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await fetchAuctionList({ category: BAG_AUCTION_CATEGORY, cursor }, signal);
    items.push(...(response.auction_item ?? []));
    if (!response.next_cursor) return { items, truncated: false, at: Date.now() };
    cursor = response.next_cursor;
  }
  return { items, truncated: true, at: Date.now() };
}

/** 경매장 주머니 매물. 5분 동안은 다시 받지 않는다. */
export function useAuctionBags(enabled: boolean) {
  return useQuery({
    queryKey: ['bags', 'auction'],
    queryFn: ({ signal }) => fetchAuctionBags(signal),
    enabled,
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}
