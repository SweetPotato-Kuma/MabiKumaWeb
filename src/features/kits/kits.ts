import { useQuery } from '@tanstack/react-query';

/**
 * 키트(확률형 상품) 시뮬레이터.
 *
 * 확률표는 scripts/build-kits.mjs 가 공식 확률 정보 화면에서 주기적으로 모아 public/data/kits.json 에 쌓는다.
 * 아이템 확률은 키트 전체에 대한 확률이라 한 번 열 때 그 확률대로 아이템 하나가 나온다. 등급 확률은 그 등급
 * 아이템 확률의 합이라 따로 뽑지 않는다.
 */

export interface KitGrade {
  name: string;
  /** 그 등급이 나올 확률(0~1). 표에 없으면 null. */
  chance: number | null;
}

export interface KitItem {
  name: string;
  /** 한 번 열 때 이 아이템이 나올 확률(0~1). */
  chance: number;
  /** grades 의 자리. 등급이 없는 키트는 비어 있다. */
  grade?: number;
  /** 지정 색상 상품의 색(16진수 6자리). */
  colors?: string[];
  /** 한 번에 여러 개 나오면 그 개수. */
  count?: number;
}

export interface Kit {
  id: string;
  name: string;
  /** 판매 시작일과 끝나는 날(YYYY-MM-DD). 모르면 null. */
  start: string | null;
  end: string | null;
  /** 한 번 여는 값(캐시). 모르면 null. */
  price: number | null;
  /** 처음 모은 날. 시작일을 모를 때 대신 줄 세운다. */
  firstSeen?: string;
  grades: KitGrade[];
  items: KitItem[];
}

export interface KitArchive {
  updated: string | null;
  /** 지금 파는 키트의 id. */
  current: string[];
  /** 최근에 판매를 시작한 것부터. */
  kits: Kit[];
}

export function useKitArchiveQuery() {
  return useQuery({
    queryKey: ['kits', 'archive'],
    queryFn: async ({ signal }): Promise<KitArchive> => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/kits.json`, { signal });
      if (!response.ok) throw new Error(`키트 확률표를 받지 못했습니다. (HTTP ${response.status})`);
      return (await response.json()) as KitArchive;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export type RandomSource = () => number;

/** 아이템 확률을 누적한 표. 확률 합이 100%에서 조금 어긋나도(반올림) 합으로 나눠 맞춘다. */
export function cumulative(kit: Kit): number[] {
  const total = kit.items.reduce((sum, item) => sum + item.chance, 0);
  let running = 0;
  return kit.items.map((item) => (running += item.chance / total));
}

/** 한 번 연다. 나온 아이템의 자리. */
export function openOnce(table: readonly number[], random: RandomSource = Math.random): number {
  const roll = random();
  let low = 0;
  let high = table.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (roll < table[middle]) high = middle;
    else low = middle + 1;
  }
  return low;
}

export interface KitRun {
  /** 이번에 나온 아이템 자리. 많이 열면 끝의 몇 개만 남긴다. */
  recent: number[];
  /** 자리마다 이번에 나온 횟수. */
  counts: Map<number, number>;
  opened: number;
  hit: boolean;
}

/** 이번에 연 것 가운데 화면에 남길 마지막 개수. */
export const RECENT_LIMIT = 10;

/**
 * times 번 연다. target 이 있으면 그 아이템이 나오는 순간 멈춘다(그때 times 는 상한).
 */
export function openKit(
  kit: Kit,
  times: number,
  target: number | null = null,
  random: RandomSource = Math.random,
): KitRun {
  const table = cumulative(kit);
  const counts = new Map<number, number>();
  const recent: number[] = [];
  for (let opened = 1; opened <= times; opened += 1) {
    const item = openOnce(table, random);
    counts.set(item, (counts.get(item) ?? 0) + 1);
    recent.push(item);
    if (recent.length > RECENT_LIMIT) recent.shift();
    if (target !== null && item === target) return { recent, counts, opened, hit: true };
  }
  return { recent, counts, opened: times, hit: target === null };
}

/** 같은 키트에서 여러 번 연 횟수를 합친다. */
export function addCounts(total: ReadonlyMap<number, number>, more: ReadonlyMap<number, number>) {
  const next = new Map(total);
  for (const [item, count] of more) next.set(item, (next.get(item) ?? 0) + count);
  return next;
}

/** 등급 자리마다 나온 횟수. 등급이 없는 아이템은 세지 않는다. */
export function countByGrade(kit: Kit, counts: ReadonlyMap<number, number>): number[] {
  const byGrade = kit.grades.map(() => 0);
  for (const [item, count] of counts) {
    const grade = kit.items[item]?.grade;
    if (grade !== undefined && grade < byGrade.length) byGrade[grade] += count;
  }
  return byGrade;
}

/** 키트의 가장 높은 등급(표의 첫 등급) 아이템인지. 금빛으로 칠한다. */
export const isTopGrade = (kit: Kit, item: number) =>
  kit.grades.length > 1 && kit.items[item]?.grade === 0;

/** 그 키트를 지금 파는지. */
export const isOnSale = (archive: KitArchive, kit: Kit) => archive.current.includes(kit.id);
