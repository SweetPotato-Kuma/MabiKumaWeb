import { useQuery } from '@tanstack/react-query';

/**
 * 아이템 이름 사전.
 *
 * 넥슨 API 에는 아이템 목록 엔드포인트가 없어서, scripts/harvest-auction.mjs 가 경매장을
 * 훑어 모은 이름을 public/items 아래 카테고리별 파일로 떨어뜨려 둔다. 자동완성은 그 파일을
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

interface ItemShard {
  category: string;
  updated: string;
  count: number;
  items: { name: string; first: string; last: string }[];
}

/** 사전은 빌드 산출물과 함께 올라가므로 앱의 base 경로를 따른다. */
function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}items/${path}`;
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

/**
 * 한 카테고리의 아이템 이름들. 카테고리를 고르지 않았으면 받아 오지 않는다.
 * 전체 사전은 15,000개가 넘어 한꺼번에 받을 이유가 없다.
 */
export function useCategoryItemNamesQuery(category: string) {
  const indexQuery = useItemIndexQuery();
  const entry = indexQuery.data?.categories.find((item) => item.name === category);

  return useQuery({
    queryKey: ['itemDictionary', 'category', entry?.file ?? ''],
    queryFn: async ({ signal }): Promise<string[]> => {
      if (!entry) return [];
      const response = await fetch(assetUrl(entry.file), { signal });
      if (!response.ok) return [];
      const shard = (await response.json()) as ItemShard;
      return shard.items.map((item) => item.name);
    },
    enabled: Boolean(entry),
    staleTime: FOREVER,
    gcTime: FOREVER,
    retry: false,
  });
}

/** 입력한 글자가 들어간 이름을 앞에서부터 고른다. 목록이 길면 고르기 어려우니 잘라 준다. */
export function matchItemNames(names: readonly string[], keyword: string, limit = 20): string[] {
  const needle = normalizeForSearch(keyword);
  if (!needle) return names.slice(0, limit);

  const startsWith: string[] = [];
  const contains: string[] = [];

  for (const name of names) {
    const haystack = normalizeForSearch(name);
    if (haystack.startsWith(needle)) startsWith.push(name);
    else if (haystack.includes(needle)) contains.push(name);

    if (startsWith.length >= limit) break;
  }

  // 앞글자가 맞는 것을 먼저 보여 준다. 사람은 보통 앞에서부터 친다.
  return [...startsWith, ...contains].slice(0, limit);
}
