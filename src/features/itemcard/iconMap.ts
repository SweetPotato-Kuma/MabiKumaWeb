import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

/**
 * 카테고리별 그림 목록. `이름 -> 그림 파일, 부제` 만 담긴 작은 파일이다.
 *
 * 표의 그림은 원래 워커에 카드를 묻고(`cards.ts`), 그 답에 든 파일 이름으로 그림을 받았다.
 * 처음 보는 아이템은 그 조회를 한 번 기다려야 해서 그림이 1초 가까이 늦게 떴다. 이 목록은
 * 워커가 카드 칸을 쓸 때 R2 에 같이 써 두고(worker.js 의 writeIconMap), 그림과 같은 CDN 에서
 * 나간다. 화면은 워커를 거치지 않고 가까운 CDN 에서 목록을 받고, 곧바로 그림 10장을 한꺼번에
 * 받는다. 목록에 없는 이름은 카드가 없다는 뜻이라 따로 묻지 않는다.
 *
 * 그림 도메인(`VITE_ICON_BASE_URL`)이 없는 빌드에서는 꺼지고, 예전처럼 카드 조회로 그림을 찾는다.
 * 목록을 받지 못한 카테고리도 마찬가지다.
 */

export interface ItemBrief {
  /** 그림 파일 이름. 내용 해시라 한 번 받으면 1년 동안 다시 받지 않는다. 없으면 빈 문자열. */
  icon: string;
  subtitle: string;
}

type IconMap = ReadonlyMap<string, ItemBrief>;

/** CDN 이 한 시간 붙잡는 값이다. 그보다 자주 다시 받아 봐야 같은 것이 온다. */
const MAP_STALE_MS = 60 * 60 * 1000;

export function iconBaseUrl(): string {
  return String(import.meta.env.VITE_ICON_BASE_URL ?? '').replace(/\/+$/, '');
}

export function isIconMapConfigured(): boolean {
  return iconBaseUrl() !== '';
}

/** 그림 파일의 주소. 워커가 카드에 붙여 주는 iconUrl 과 같은 모양이라 같은 캐시를 쓴다. */
export function iconFileUrl(file: string): string {
  return `${iconBaseUrl()}/${file}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 목록 파일 주소. 워커의 iconMapKey 와 같은 규칙이다. 카테고리 이름에 `/` 가 들어가는 것이 있어
 * (모자/가발) 이름 대신 해시를 쓴다. 확장자가 `.js` 인 이유는 워커 쪽 주석에 있다(CDN 캐시).
 */
export async function iconMapUrl(category: string): Promise<string> {
  return `${iconBaseUrl()}/maps/${(await sha256Hex(category)).slice(0, 8)}.js`;
}

export function parseIconMap(raw: unknown): IconMap {
  const map = new Map<string, ItemBrief>();
  const items = (raw as { items?: Record<string, unknown> } | null)?.items;
  if (!items || typeof items !== 'object') return map;
  for (const [name, value] of Object.entries(items)) {
    if (!Array.isArray(value)) continue;
    map.set(name, { icon: String(value[0] ?? ''), subtitle: String(value[1] ?? '') });
  }
  return map;
}

function iconMapQueryOptions(category: string) {
  return {
    queryKey: ['itemIconMap', category] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<IconMap> => {
      const response = await fetch(await iconMapUrl(category), { signal });
      // 카드를 한 장도 올리지 않은 카테고리는 목록이 없다. 그 안의 이름은 모두 카드가 없다.
      if (response.status === 404) return new Map();
      if (!response.ok) throw new Error(`그림 목록을 받지 못했습니다. (HTTP ${response.status})`);
      return parseIconMap(await response.json());
    },
    enabled: isIconMapConfigured() && category !== '',
    staleTime: MAP_STALE_MS,
    gcTime: Infinity,
    retry: 1,
  };
}

/**
 * 아이템 하나의 그림과 부제. `undefined` 는 아직 모름(받는 중이거나 목록이 꺼짐), `null` 은
 * 목록에 없음(카드가 없음). 같은 카테고리를 여러 칸이 불러도 목록은 한 번만 받는다.
 */
export function useItemBrief(category: string, name: string): ItemBrief | null | undefined {
  const { data } = useQuery(iconMapQueryOptions(category));
  if (!data || !name) return undefined;
  return data.get(name) ?? null;
}

export interface IconMaps {
  brief: (category: string, name: string) => ItemBrief | null | undefined;
  /**
   * 이 카테고리는 목록 없이 카드 조회로 찾아야 하는지. 목록이 꺼졌거나 받지 못했을 때만 그렇다.
   * 받는 중에는 기다린다. 곧 올 목록 대신 워커를 부르면 조회 한도만 깎인다.
   */
  needsLookup: (category: string) => boolean;
}

/** 표처럼 여러 카테고리가 섞인 화면이 쓴다. 보이는 카테고리의 목록을 한꺼번에 받는다. */
export function useIconMaps(categories: readonly string[]): IconMaps {
  const unique = useMemo(() => [...new Set(categories.filter(Boolean))], [categories]);
  const states = useQueries({
    queries: unique.map((category) => iconMapQueryOptions(category)),
    combine: (results) => results.map((result) => ({ data: result.data, failed: result.isError })),
  });

  return useMemo(() => {
    const byCategory = new Map(unique.map((category, index) => [category, states[index]]));
    const configured = isIconMapConfigured();
    return {
      brief: (category, name) => {
        const map = byCategory.get(category)?.data;
        return map ? (map.get(name) ?? null) : undefined;
      },
      needsLookup: (category) => !configured || Boolean(byCategory.get(category)?.failed),
    };
  }, [unique, states]);
}
