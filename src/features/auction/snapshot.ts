import { getProxyUrl } from '@/lib/settings';
import type { AuctionItem, ItemOption } from './types';

/**
 * 워커가 모아 둔 장비 매물(worker/auctionSnapshot.js).
 *
 * 상세 검색은 매물을 전부 받아 걸러야 하는데, 넥슨 API 는 한 쪽 500건을 앞 쪽의 커서로만 넘겨서
 * 모자/가발 하나에 6초가 넘게 걸렸다. 워커가 10분마다 장비 카테고리를 전부 받아 CDN 에 올려 두고,
 * 화면은 필요한 카테고리 파일만 받아 거른다. 파일 하나가 압축해 300KB 안팎이다.
 *
 * 모아 둔 것이라 그 사이 팔린 매물이 섞일 수 있다. 화면은 모은 시각을 함께 보여 준다.
 */

/** 카테고리 하나의 파일. at 은 그 카테고리를 받기 시작한 시각(ms)이다. */
export interface SnapshotEntry {
  file: string;
  at: number;
  count: number;
}

export interface SnapshotManifest {
  at: number;
  /** 파일 주소의 앞부분. 워커가 붙여 준다. */
  base: string;
  categories: Record<string, SnapshotEntry>;
}

/** 줄인 옵션 한 줄. [종류, 세부, 값, 값2, 설명] 이고 끝의 빈 칸은 없다. */
type CompactOption = [string, (string | null)?, (string | null)?, (string | null)?, (string | null)?];

/** 줄인 매물 한 건. [원래 이름(보이는 이름과 같으면 0), 보이는 이름, 수량, 개당 가격, 만료(초), 옵션]. */
type CompactItem = [string | 0, string, number, number, number, CompactOption[]];

export interface SnapshotFile {
  category: string;
  at: number;
  items: CompactItem[];
}

/**
 * 이보다 묵은 카테고리가 있으면 모아 둔 것을 쓰지 않고 실시간으로 받는다. 크론이 10분마다 도니
 * 두세 번 연달아 실패했다는 뜻이다. 그만큼 묵은 매물을 보여 주느니 느려도 새것이 낫다.
 */
export const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;

export function canUseSnapshot(): boolean {
  return getProxyUrl().length > 0;
}

export async function fetchSnapshotManifest(signal?: AbortSignal): Promise<SnapshotManifest | null> {
  const response = await fetch(`${getProxyUrl()}/auction/snapshot`, {
    headers: { accept: 'application/json' },
    signal,
  });
  // 아직 모은 적이 없다. 실시간으로 받으면 된다.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`모아 둔 매물 목록을 받지 못했습니다. (HTTP ${response.status})`);
  return (await response.json()) as SnapshotManifest;
}

export async function fetchSnapshotFile(url: string, signal?: AbortSignal): Promise<AuctionItem[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`모아 둔 매물을 받지 못했습니다. (HTTP ${response.status})`);
  return decodeSnapshotItems((await response.json()) as SnapshotFile);
}

function decodeOption(row: CompactOption): ItemOption {
  const option: ItemOption = { option_type: row[0] };
  if (row[1] != null) option.option_sub_type = row[1];
  if (row[2] != null) option.option_value = row[2];
  if (row[3] != null) option.option_value2 = row[3];
  if (row[4] != null) option.option_desc = row[4];
  return option;
}

/** 줄인 매물을 넥슨 API 응답과 같은 모양으로 되돌린다. 표와 상세 검색은 그 모양만 안다. */
export function decodeSnapshotItems(file: SnapshotFile): AuctionItem[] {
  return file.items.map(([name, display, count, price, expire, options]) => ({
    item_name: name === 0 ? display : name,
    item_display_name: display,
    item_count: count,
    auction_item_category: file.category,
    auction_price_per_unit: price,
    date_auction_expire: new Date(expire * 1000).toISOString(),
    item_option: options.map(decodeOption),
  }));
}

/** "방금" 또는 "N분 전에". 모은 시각을 문장 앞에 붙인다. */
export function snapshotAgeLabel(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60000);
  return minutes < 1 ? '방금' : `${minutes}분 전에`;
}

/**
 * 이 카테고리들을 모아 둔 것으로 찾을 수 있으면 받을 파일 주소를, 아니면 null 을 준다.
 * 하나라도 없거나 너무 묵었으면 null 이다. 섞어 쓰면 어디까지가 옛것인지 알 수 없다.
 */
export function snapshotFilesFor(
  manifest: SnapshotManifest | null | undefined,
  categories: readonly string[],
  now = Date.now(),
): { category: string; url: string; at: number }[] | null {
  if (!manifest?.base || categories.length === 0) return null;
  const files = [];
  for (const category of categories) {
    const entry = manifest.categories[category];
    if (!entry || now - entry.at > SNAPSHOT_MAX_AGE_MS) return null;
    files.push({ category, url: `${manifest.base}/${entry.file}`, at: entry.at });
  }
  return files;
}
