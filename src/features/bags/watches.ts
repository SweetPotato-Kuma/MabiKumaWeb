import {
  readPersonal,
  writePersonal,
  removePersonal,
  subscribePersonalStorage,
} from '@/lib/personalStorage';
import { useSyncExternalStore } from 'react';
import {
  COLOR_CHANNEL_KEYS,
  describeColorChannel,
  hasColorChannels,
} from '@/features/colorChannels';
import { formatNumber } from '@/lib/format';
import { namesOfSelection, type BagTreeNode } from './groups';
import { narrowParts, scoreBagColors, type NarrowedPart } from './listings';
import { bagConditionParams, readBagConditions, type BagSearchConditions } from './searchParams';

/**
 * 튼튼한 주머니 관심 조건. 이름과 주머니 종류, 파트별 색 조건을 이 브라우저의 localStorage 에 저장한다.
 *
 * 조건은 검색 주소와 같은 글자(bagConditionParams)로 저장하고 같은 검증(readBagConditions)을 거쳐 읽는다. 그래서
 * 저장한 조건을 고르면 검색 조건으로 그대로 옮길 수 있고, 깨진 글자는 주소에서처럼 그 부분만 기본값으로 돌아간다.
 * 서버는 저장하지 않는다. 관심 조건은 어느 서버의 상점과 경매장에도 똑같이 건다.
 */
export interface BagWatch {
  id: string;
  name: string;
  conditions: BagSearchConditions;
}

export const WATCH_NAME_MAX = 30;
/** 저장할 수 있는 개수. 화면 한쪽 칸에 늘어놓으므로 많지 않게 둔다. */
export const WATCH_MAX = 20;

const STORAGE_KEY = 'mabikuma:bagWatches';

/** 주머니도 색도 고르지 않은 조건. 모든 주머니가 맞아 관심 조건으로 쓸 수 없다. */
export function isEmptyCondition(conditions: BagSearchConditions): boolean {
  return (
    conditions.bags.length === 0 &&
    !conditions.parts.some((part) => part.enabled && hasColorChannels(part.channels))
  );
}

/** 조건을 저장할 글자로. 주소에 쓰는 것과 같다. */
export function conditionsToQuery(conditions: BagSearchConditions): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(bagConditionParams(conditions))) {
    if (value === null) continue;
    for (const each of Array.isArray(value) ? value : [value]) params.append(key, each);
  }
  return params.toString();
}

const queryToConditions = (query: string) => readBagConditions(new URLSearchParams(query));

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** 저장된 값을 믿지 않는다. 항목마다 검증하고 읽을 수 없는 것은 버린다. */
export function parseWatches(raw: unknown): BagWatch[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: BagWatch[] = [];
  for (const entry of raw.slice(0, WATCH_MAX)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const value = entry as Record<string, unknown>;
    const id = text(value.id, 40);
    const name = text(value.name, WATCH_NAME_MAX).trim();
    if (!id || !name || seen.has(id)) continue;
    const conditions = queryToConditions(text(value.query, 4000));
    if (isEmptyCondition(conditions)) continue;
    seen.add(id);
    items.push({ id, name, conditions });
  }
  return items;
}

function readStorage(): BagWatch[] {
  try {
    const raw = readPersonal(STORAGE_KEY);
    return raw ? parseWatches(JSON.parse(raw)) : [];
  } catch {
    // 시크릿 모드 등 localStorage 를 못 쓰거나 글자가 깨졌다. 빈 목록으로 시작한다.
    return [];
  }
}

function writeStorage(items: readonly BagWatch[]): void {
  try {
    writePersonal(
      STORAGE_KEY,
      JSON.stringify(
        items.map((item) => ({
          id: item.id,
          name: item.name,
          query: conditionsToQuery(item.conditions),
        })),
      ),
    );
  } catch {
    // 저장하지 못해도 이 탭 안에서는 바꾼 목록을 쓴다.
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** useSyncExternalStore 는 같은 상태면 같은 배열을 받아야 한다. 바뀔 때만 새로 만든다. */
let snapshot: readonly BagWatch[] = typeof window === 'undefined' ? [] : readStorage();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: readonly BagWatch[]): void {
  snapshot = next;
  writeStorage(next);
  for (const listener of listeners) listener();
}

export function getBagWatches(): readonly BagWatch[] {
  return snapshot;
}

export function useBagWatches(): readonly BagWatch[] {
  return useSyncExternalStore(subscribe, getBagWatches, getBagWatches);
}

export type WatchSaveResult =
  | { ok: true; item: BagWatch }
  | { ok: false; reason: 'empty' | 'name' | 'full' }
  | { ok: false; reason: 'duplicate'; existing: BagWatch };

const sameConditions = (a: BagSearchConditions, b: BagSearchConditions) =>
  conditionsToQuery(a) === conditionsToQuery(b);

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** 새로 저장한다. 조건이 비었거나, 이름이 비었거나, 가득 찼거나, 같은 조건이 이미 있으면 까닭을 돌려준다. */
export function addBagWatch(name: string, conditions: BagSearchConditions): WatchSaveResult {
  const normalized = queryToConditions(conditionsToQuery(conditions));
  if (isEmptyCondition(normalized)) return { ok: false, reason: 'empty' };
  const existing = snapshot.find((item) => sameConditions(item.conditions, normalized));
  if (existing) return { ok: false, reason: 'duplicate', existing };
  const trimmed = name.trim().slice(0, WATCH_NAME_MAX);
  if (!trimmed) return { ok: false, reason: 'name' };
  if (snapshot.length >= WATCH_MAX) return { ok: false, reason: 'full' };
  const item: BagWatch = { id: newId(), name: trimmed, conditions: normalized };
  commit([item, ...snapshot]);
  return { ok: true, item };
}

/**
 * 이름이나 조건을 고친다. 조건을 주면 그 조건으로 바꾸고, 주지 않으면 그대로 둔다. 이름이 비거나 조건이
 * 비었거나, 같은 조건을 가진 다른 관심 조건이 있으면 고치지 않는다.
 */
export function updateBagWatch(
  id: string,
  changes: { name: string; conditions?: BagSearchConditions },
): boolean {
  const current = snapshot.find((item) => item.id === id);
  const name = changes.name.trim().slice(0, WATCH_NAME_MAX);
  if (!current || !name) return false;
  const conditions = changes.conditions
    ? queryToConditions(conditionsToQuery(changes.conditions))
    : current.conditions;
  if (isEmptyCondition(conditions)) return false;
  if (snapshot.some((item) => item.id !== id && sameConditions(item.conditions, conditions)))
    return false;
  commit(snapshot.map((item) => (item.id === id ? { ...item, name, conditions } : item)));
  return true;
}

export function removeBagWatch(id: string): void {
  if (!snapshot.some((item) => item.id === id)) return;
  commit(snapshot.filter((item) => item.id !== id));
}

/** 시험용. 저장소와 목록을 비운다. */
export function resetBagWatchesForTest(): void {
  snapshot = [];
  try {
    removePersonal(STORAGE_KEY);
  } catch {
    // 시험 환경에서만 부른다.
  }
}

// 다른 탭에서 바꾸면 이 탭도 따라 바뀐다.
if (typeof window !== 'undefined') {
  subscribePersonalStorage(({ key, external }) => {
    if (!external || (key !== null && key !== STORAGE_KEY)) return;
    snapshot = readStorage();
    for (const listener of listeners) listener();
  });
}

/** 결과와 맞춰 보기 좋게 푼 관심 조건. */
export interface CompiledWatch {
  id: string;
  name: string;
  bagNames: ReadonlySet<string> | null;
  narrowed: NarrowedPart[];
}

export function compileWatches(
  watches: readonly BagWatch[],
  tree: readonly BagTreeNode[],
): CompiledWatch[] {
  return watches.map((watch) => ({
    id: watch.id,
    name: watch.name,
    bagNames: namesOfSelection(tree, watch.conditions.bags),
    narrowed: narrowParts(
      watch.conditions.parts.map((part) => (part.enabled ? part.channels : null)),
    ),
  }));
}

/** 주머니 하나가 맞는 관심 조건들. */
export function matchingWatches(
  bag: { name: string; colors: readonly string[] },
  watches: readonly CompiledWatch[],
): CompiledWatch[] {
  return watches.filter(
    (watch) =>
      (!watch.bagNames || watch.bagNames.has(bag.name)) &&
      scoreBagColors(bag.colors, watch.narrowed) !== false,
  );
}

const PART_LETTERS = ['A', 'B', 'C'];

/** 관심 조건 한 줄 요약. "주머니 3종, 파트 A R 200~255" 처럼 무엇을 걸었는지만 짧게 적는다. */
export function describeWatch(
  conditions: BagSearchConditions,
  tree: readonly BagTreeNode[],
): string {
  const names = namesOfSelection(tree, conditions.bags);
  const bags = names ? `주머니 ${formatNumber(names.size)}종` : '모든 주머니';
  const parts = conditions.parts.flatMap((part, index) => {
    if (!part.enabled || !hasColorChannels(part.channels)) return [];
    const channels = COLOR_CHANNEL_KEYS.map((key) => describeColorChannel(key, part.channels[key]))
      .filter(Boolean)
      .join(' ');
    return [`파트 ${PART_LETTERS[index]} ${channels}`];
  });
  return [bags, ...parts].join(', ');
}
