import { queryOptions, useQuery } from '@tanstack/react-query';

/**
 * 인챈트 스크롤 사양. public/data/enchant-scrolls.json 한 파일이고 scripts/build-enchant-scrolls.mjs 가 만든다.
 *
 * 게임에는 인챈트별 스크롤 아이템이 없어서 이 이름("인챈트 스크롤 - 올빼미")은 사전이 경매장
 * 표기를 따라 만든 것이다. 한 이름 아래 접두와 접미, 랭크가 다른 인챈트가 둘 이상 있을 수 있다.
 */

export interface ScrollVariant {
  /** 0 접두, 1 접미 */
  slot: 0 | 1;
  /** 1~6 이 F~A 랭크, 7~15 가 9~1 랭크 */
  level: number;
  /** 게임 설명 문장. 적용 조건과 효과가 줄마다 들어 있다 */
  desc: string[];
  /** 이 인챈트가 나오는 던전과 미션 */
  src?: string[];
  /** 출시 제너레이션 */
  gen?: number;
}

export interface ScrollFile {
  scrolls: Record<string, ScrollVariant[]>;
}

/** 접두가 먼저, 같은 쪽에서는 높은 랭크가 먼저. 파일이 이미 이 순서지만 화면이 순서에 기대지 않게 한다. */
export function sortVariants(variants: ScrollVariant[]): ScrollVariant[] {
  return [...variants].sort((a, b) => a.slot - b.slot || b.level - a.level);
}

const SCROLL_NAME = /^(?:전용 )?인챈트 스크롤 - .+$/;

/** 사전 이름이 인챈트 스크롤 사양을 가질 수 있는 모양인지. 파일을 받기 전에 걸러 낸다. */
export function isEnchantScrollName(category: string, name: string): boolean {
  return category === '인챈트 스크롤' && SCROLL_NAME.test(name);
}

export const enchantScrollQueryOptions = queryOptions({
  queryKey: ['enchantScrolls'],
  queryFn: async ({ signal }): Promise<ScrollFile | null> => {
    const response = await fetch(`${import.meta.env.BASE_URL}data/enchant-scrolls.json`, { signal });
    if (!response.ok) return null;
    return (await response.json()) as ScrollFile;
  },
  staleTime: Infinity,
  gcTime: Infinity,
  retry: false,
});

/** 한 이름의 사양. 파일을 받는 중이면 undefined, 파일이 없거나 이름이 없으면 null. */
export function useEnchantScroll(name: string): ScrollVariant[] | null | undefined {
  const query = useQuery(enchantScrollQueryOptions);
  if (query.isPending) return undefined;
  return query.data?.scrolls[name] ?? null;
}
