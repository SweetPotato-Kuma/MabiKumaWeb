import { useQuery } from '@tanstack/react-query';
import { getProxyUrl } from '@/lib/settings';

/**
 * 키트(확률형 상품) 시뮬레이터.
 *
 * 확률표는 워커가 공식 확률 정보 화면에서 한 시간마다 모아 D1 에 쌓는다(worker/kits.js). 판매가 끝나면 공식 화면에서
 * 사라지므로 저장소가 아니라 그 기록이 원본이다. 화면은 그 전체를 받지 않고 목록(GET /kits/index)과 고른 키트
 * 하나(GET /kits/kit?id=)만 받는다.
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
  /** 키트 이름과 보상 이름 -> 그림 파일 이름. 게임 데이터에서 찾지 못한 이름은 없다. */
  icons?: Record<string, string>;
}

/** 목록의 키트 한 줄. 고르는 데 필요한 것만 있다. */
export interface KitSummary {
  id: string;
  name: string;
  start: string | null;
  end: string | null;
  price: number | null;
  firstSeen?: string;
  /** 키트 상자 그림 파일 이름. */
  icon?: string;
  /** 구성품 수. */
  count: number;
}

export interface KitIndex {
  updated: string | null;
  /** 지금 파는 키트의 id. */
  current: string[];
  /** 최근에 판매를 시작한 것부터. */
  kits: KitSummary[];
}

async function readKits<T>(path: string, signal: AbortSignal): Promise<T> {
  if (!getProxyUrl())
    throw new Error('조회 서버 주소가 설정되지 않아 키트 확률표를 받을 수 없습니다.');
  const response = await fetch(`${getProxyUrl()}${path}`, {
    headers: { accept: 'application/json' },
    signal,
  });
  if (response.status === 429)
    throw new Error('조회가 잠시 몰렸습니다. 1분쯤 뒤에 다시 열어 주세요.');
  if (!response.ok) throw new Error(`키트 확률표를 받지 못했습니다. (HTTP ${response.status})`);
  return (await response.json()) as T;
}

export function useKitIndexQuery() {
  return useQuery({
    queryKey: ['kits', 'index'],
    queryFn: ({ signal }) => readKits<KitIndex>('/kits/index', signal),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useKitQuery(id: string | null) {
  return useQuery({
    queryKey: ['kits', 'kit', id],
    queryFn: ({ signal }) => readKits<Kit>(`/kits/kit?id=${encodeURIComponent(id ?? '')}`, signal),
    enabled: id !== null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** 이름의 그림 파일. 없으면 빈 글자. */
export const kitIconOf = (kit: Kit, name: string) => kit.icons?.[name] ?? '';

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

/**
 * 연출의 겹 수(0~3). 등급이 여럿인 키트에서 첫 등급은 3, 둘째는 2, 셋째는 1, 그 아래는 0 이다.
 * 등급이 없는 키트는 무엇이 드문지 정해 둔 것이 없어 0 으로 둔다.
 */
export function fxTierOf(kit: Kit, item: number): 0 | 1 | 2 | 3 {
  const grade = kit.items[item]?.grade;
  if (kit.grades.length < 2 || grade === undefined) return 0;
  return grade === 0 ? 3 : grade === 1 ? 2 : grade === 2 ? 1 : 0;
}

/** 그 키트를 지금 파는지. */
export const isOnSale = (index: KitIndex, kit: Pick<KitSummary, 'id'>) =>
  index.current.includes(kit.id);
