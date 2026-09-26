import { useQuery } from '@tanstack/react-query';

/**
 * 상세 검색 자동완성의 기본 이름. 게임 데이터의 세공 능력 이름과 인챈트 이름이다.
 *
 * 자동완성은 불러온 매물의 이름을 먼저 쓰지만, 매물을 불러오기 전에는 비어 있다. 그때도 칸을
 * 누르면 이름이 나오도록 scripts/build-option-names.mjs 가 뽑아 둔 정적 파일을 함께 쓴다.
 */
export interface OptionNames {
  updated: string;
  reforges: string[];
  enchants: { prefix: string[]; suffix: string[] };
}

export function useOptionNamesQuery() {
  return useQuery({
    queryKey: ['auction', 'optionNames'],
    queryFn: async ({ signal }): Promise<OptionNames | null> => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/option-names.json`, { signal });
      // 파일이 없는 빌드에서는 불러온 매물의 이름만으로 자동완성한다.
      if (!response.ok) return null;
      return (await response.json()) as OptionNames;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
