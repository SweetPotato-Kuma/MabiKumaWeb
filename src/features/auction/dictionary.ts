import { useQuery } from '@tanstack/react-query';

/**
 * 아이템 이름 사전.
 *
 * 넥슨 API 에는 아이템 목록 엔드포인트가 없어서, scripts/harvest-auction.mjs 가 경매장을
 * 훑어 모은 이름을 public/data/items 아래 카테고리별 파일로 떨어뜨려 둔다. 자동완성은 그 파일을
 * 읽는다. 서버에 묻는 게 아니라 정적 파일이라 한 번 받으면 다시 받지 않는다.
 *
 * 사전은 "경매장에 올라온 적이 있는" 이름이지 게임의 전체 아이템 목록이 아니다.
 * 그래서 자동완성에 없는 이름도 검색은 되어야 하고, 입력을 막지 않는다.
 */

interface ItemIndexEntry {
  name: string;
  file: string;
  count: number;
}

interface ItemIndex {
  updated: string;
  total: number;
  categories: ItemIndexEntry[];
}

/** 사전은 빌드 산출물과 함께 올라가므로 앱의 base 경로를 따른다. */
function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/items/${path}`;
}

/**
 * 띄어쓰기를 지우고 비교한다. "숏소드" 로 쳐도 "숏 소드" 가 걸려야 한다.
 * 게임 아이템 이름은 띄어쓰기가 일정하지 않아 사용자가 외우고 있을 리 없다.
 */
export function normalizeForSearch(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

const FOREVER = Infinity;

/** 카테고리별 사전 파일 목록. 사전이 아직 수집되지 않았으면 빈 목록으로 둔다. */
export function useItemIndexQuery() {
  return useQuery({
    queryKey: ['itemDictionary', 'index'],
    queryFn: async ({ signal }): Promise<ItemIndex | null> => {
      const response = await fetch(assetUrl('index.json'), { signal });
      // 사전을 아직 한 번도 수집하지 않은 빌드에서는 없는 게 정상이다. 화면을 깨지 않는다.
      if (!response.ok) return null;
      return (await response.json()) as ItemIndex;
    },
    staleTime: FOREVER,
    gcTime: FOREVER,
    retry: false,
  });
}

/** 아이템 정보 화면의 주소. 목록 화면이 이 경로 하나다. */
export const ITEMS_PATH = '/items';

/**
 * 아이템 하나의 상세 주소. 장비면 시뮬레이터가, 아니면 그림과 설명이 열린다.
 * 경매장 상세에서도 이 주소로 넘어온다.
 */
export function itemInfoPath(category: string, name: string): string {
  return `${ITEMS_PATH}?category=${encodeURIComponent(category)}&name=${encodeURIComponent(name)}`;
}
