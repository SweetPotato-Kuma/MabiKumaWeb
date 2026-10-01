import { queryOptions, useQuery } from '@tanstack/react-query';

/**
 * 인챈트 스크롤 사양. public/data/enchant-scrolls.json 한 파일이고 scripts/build-enchant-scrolls.mjs 가 만든다.
 *
 * 게임에는 인챈트별 스크롤 아이템이 없어서 이 이름("인챈트 스크롤 - 올빼미")은 사전이 경매장
 * 표기를 따라 만든 것이다. 한 이름 아래 접두와 접미, 랭크가 다른 인챈트가 둘 이상 있을 수 있다.
 *
 * 인챈트는 이름이 둘이다. 경매장이 보여 주는 쪽(두 번째)이 이름이고, 첫 번째 이름은 alt 에 있다.
 * 인챈트를 바른 시기에 따라 어느 쪽 이름이든 보일 수 있어 둘 다 같은 인챈트를 가리킨다.
 *
 * 스크롤에 붙는 "전용", "개방된 전용" 은 같은 인챈트의 거래 상태다(개방된은 거래 제한을 한 번 더 푼 것).
 * 그래서 사양은 인챈트 이름으로 찾고, 스크롤 종류는 보지 않는다.
 */

export interface ScrollVariant {
  /** 0 접두, 1 접미 */
  slot: 0 | 1;
  /** 1~6 이 F~A 랭크, 7~15 가 9~1 랭크 */
  level: number;
  /** 게임 설명 문장. 적용 조건과 효과가 줄마다 들어 있다 */
  desc: string[];
  /** 이 인챈트의 다른 이름(첫 번째 이름) */
  alt?: string;
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

const SCROLL_NAME = /^(.*인챈트 스크롤) - (.+)$/;

/**
 * "전용 인챈트 스크롤 - 올빼미" -> { base: "전용 인챈트 스크롤", enchant: "올빼미" }. 아니면 null.
 * "개방된 전용", "8주년 전용" 처럼 앞에 말이 붙은 스크롤도 같은 모양이다.
 */
export function parseScrollName(name: string): { base: string; enchant: string } | null {
  const match = SCROLL_NAME.exec(name);
  return match ? { base: match[1], enchant: match[2] } : null;
}

export const isEnchantScrollName = (name: string) => parseScrollName(name) !== null;

/** 경매장 옵션의 랭크 글자. F~A 는 1~6, 숫자 n 은 16 - n. 모르는 글자는 null. */
function levelOfRank(rank: string): number | null {
  const letter = 'FEDCBA'.indexOf(rank);
  if (rank.length === 1 && letter >= 0) return letter + 1;
  const digit = Number(rank);
  return Number.isInteger(digit) && digit >= 1 && digit <= 9 ? 16 - digit : null;
}

/**
 * 경매장 옵션 "인챈트 종류"(접미, "다크호스 (랭크 8)") 가 가리키는 인챈트. 모양이 다르면 null.
 */
export function parseEnchantKind(
  subType: string | null | undefined,
  value: string | null | undefined,
): { enchant: string; slot: 0 | 1; level: number } | null {
  const match = /^(.*) \(랭크 (.+)\)$/.exec(value ?? '');
  const level = match ? levelOfRank(match[2]) : null;
  if (!match || level === null || (subType !== '접두' && subType !== '접미')) return null;
  return { enchant: match[1], slot: subType === '접두' ? 0 : 1, level };
}

const indexes = new WeakMap<ScrollFile, Map<string, ScrollVariant[]>>();

/** 인챈트 이름(두 이름 모두) -> 사양들. 일반 스크롤과 전용 스크롤에 같은 사양이 있으면 하나로 합친다. */
function indexOf(file: ScrollFile): Map<string, ScrollVariant[]> {
  const cached = indexes.get(file);
  if (cached) return cached;

  const index = new Map<string, ScrollVariant[]>();
  const seen = new Map<string, Set<string>>();
  const add = (enchant: string, variant: ScrollVariant) => {
    const key = `${variant.slot}:${variant.level}:${variant.desc.join('\n')}`;
    const keys = seen.get(enchant) ?? new Set<string>();
    if (keys.has(key)) return;
    keys.add(key);
    seen.set(enchant, keys);
    index.set(enchant, [...(index.get(enchant) ?? []), variant]);
  };
  for (const [name, variants] of Object.entries(file.scrolls)) {
    const parsed = parseScrollName(name);
    if (!parsed) continue;
    for (const variant of variants) {
      add(parsed.enchant, variant);
      if (variant.alt) add(variant.alt, variant);
    }
  }
  indexes.set(file, index);
  return index;
}

/**
 * 인챈트 이름(첫 번째든 두 번째든)의 사양. kind 를 주면(접두/접미와 랭크) 맞는 것만 남기되, 맞는 것이
 * 하나도 없으면 이름이 같은 사양을 모두 돌려준다.
 */
export function findScrollVariants(
  file: ScrollFile,
  enchant: string,
  kind?: { slot: 0 | 1; level: number },
): ScrollVariant[] {
  const all = indexOf(file).get(enchant) ?? [];
  if (!kind) return all;
  const exact = all.filter((variant) => variant.slot === kind.slot && variant.level === kind.level);
  return exact.length > 0 ? exact : all;
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

/**
 * 스크롤 이름의 사양. 파일을 받는 중이면 undefined, 파일이 없거나 이름이 없으면 null.
 * 이름 뒤의 인챈트로 찾으므로 사전에 없는 "개방된 전용 인챈트 스크롤 - 올빼미" 도 같은 사양이 나온다.
 */
export function useEnchantScroll(
  name: string,
  kind?: { slot: 0 | 1; level: number },
): ScrollVariant[] | null | undefined {
  const query = useQuery(enchantScrollQueryOptions);
  if (query.isPending) return undefined;
  const parsed = parseScrollName(name);
  if (!query.data || !parsed) return null;
  const variants = findScrollVariants(query.data, parsed.enchant, kind);
  return variants.length > 0 ? variants : null;
}
