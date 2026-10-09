import { useSyncExternalStore } from 'react';
import type { Choice } from './plan';

/**
 * 재료 메모의 목표 목록.
 *
 * 목표 아이템마다 개수, 줄별 가진 개수와 고른 방법을 담는다. 계정이 없으므로 이 브라우저에만 남긴다.
 * 저장이 막힌 환경(시크릿 창 등)에서는 이번 방문 동안만 기억한다.
 */
export interface StoredTarget {
  id: string;
  itemId: number;
  count: number;
  recipe?: number;
  works?: number;
  owned: Record<string, number>;
  choices: Record<string, Choice>;
}

export interface MemoState {
  targets: readonly StoredTarget[];
}

const STORAGE_KEY = 'mabikuma:materialMemo';

/** 목표 개수 상한. 저장값이 부풀지 않게 한다. */
export const MAX_TARGETS = 30;
export const MAX_COUNT = 99999;

const EMPTY: MemoState = Object.freeze({ targets: Object.freeze([]) as readonly StoredTarget[] });

type Listener = () => void;

const listeners = new Set<Listener>();

let current: MemoState | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const wholeNumber = (value: unknown, max = MAX_COUNT) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(0, number)) : 0;
};

/** 저장값은 믿지 않는다. 모양이 틀린 칸은 버리고 나머지를 살린다. */
export function parseState(raw: unknown): MemoState {
  if (!isRecord(raw) || !Array.isArray(raw.targets)) return EMPTY;
  const targets: StoredTarget[] = [];
  const seen = new Set<string>();
  for (const entry of raw.targets) {
    if (!isRecord(entry) || targets.length >= MAX_TARGETS) continue;
    const id = typeof entry.id === 'string' ? entry.id : '';
    const itemId = wholeNumber(entry.itemId, Number.MAX_SAFE_INTEGER);
    if (!id || seen.has(id) || itemId <= 0) continue;
    seen.add(id);

    const owned: Record<string, number> = {};
    if (isRecord(entry.owned)) {
      for (const [key, value] of Object.entries(entry.owned)) {
        const count = wholeNumber(value);
        if (count > 0) owned[key] = count;
      }
    }
    const choices: Record<string, Choice> = {};
    if (isRecord(entry.choices)) {
      for (const [key, value] of Object.entries(entry.choices)) {
        if (value === 'gather') choices[key] = 'gather';
        else if (typeof value === 'number' && Number.isInteger(value) && value >= 0)
          choices[key] = value;
      }
    }
    const recipe = Number.isInteger(entry.recipe) && Number(entry.recipe) >= 0 ? Number(entry.recipe) : undefined;
    const works = wholeNumber(entry.works, 99);
    targets.push({
      id,
      itemId,
      count: Math.max(1, wholeNumber(entry.count)),
      ...(recipe !== undefined ? { recipe } : {}),
      ...(works > 0 ? { works } : {}),
      owned,
      choices,
    });
  }
  return targets.length > 0 ? { targets } : EMPTY;
}

function read(): MemoState {
  if (current) return current;
  let state = EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) state = parseState(JSON.parse(raw));
  } catch {
    // 저장이 막혔거나 망가진 값이다. 빈 것으로 시작한다.
  }
  current = state;
  return state;
}

function write(next: MemoState): void {
  const clean = parseState(next);
  current = clean;
  try {
    if (clean === EMPTY) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // 저장이 막힌 환경. 메모리 값만 쓴다.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMemoState(): MemoState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const update = (id: string, change: (target: StoredTarget) => StoredTarget) =>
  write({ targets: read().targets.map((target) => (target.id === id ? change(target) : target)) });

/** 같은 아이템이 이미 있으면 개수만 더한다. 가득 찼으면 false. */
export function addTarget(itemId: number, count: number): boolean {
  const { targets } = read();
  const same = targets.find((target) => target.itemId === itemId);
  if (same) {
    update(same.id, (target) => ({ ...target, count: Math.min(MAX_COUNT, target.count + count) }));
    return true;
  }
  if (targets.length >= MAX_TARGETS) return false;
  write({
    targets: [
      ...targets,
      { id: newId(), itemId, count: Math.max(1, count), owned: {}, choices: {} },
    ],
  });
  return true;
}

export const removeTarget = (id: string) =>
  write({ targets: read().targets.filter((target) => target.id !== id) });

export const clearTargets = () => write(EMPTY);

export const setTargetCount = (id: string, count: number) =>
  update(id, (target) => ({ ...target, count: Math.max(1, count) }));

export const setTargetWorks = (id: string, works: number | undefined) =>
  update(id, (target) => ({ ...target, works }));

/** 목표의 제작법을 바꾸면 줄의 자리가 모두 달라진다. 가진 개수와 고른 방법을 새로 시작한다. */
export const setTargetRecipe = (id: string, recipe: number) =>
  update(id, (target) => ({ ...target, recipe, owned: {}, choices: {} }));

export const setOwned = (id: string, key: string, count: number) =>
  update(id, (target) => {
    const owned = { ...target.owned };
    if (count > 0) owned[key] = count;
    else delete owned[key];
    return { ...target, owned };
  });

export const clearOwned = (id: string) => update(id, (target) => ({ ...target, owned: {} }));

export const setChoice = (id: string, key: string, choice: Choice) =>
  update(id, (target) => ({ ...target, choices: { ...target.choices, [key]: choice } }));

/** 테스트가 저장소를 비울 때. */
export function resetMemoCache(): void {
  current = null;
}
