import {
  readPersonal,
  writePersonal,
  removePersonal,
  subscribePersonalStorage,
} from '@/lib/personalStorage';
import { useSyncExternalStore } from 'react';
import type { Method } from '@/features/crafting/plan';
import { NO_CHOICES, type TreeChoices } from '@/features/crafting/treeChoices';

/**
 * 재료 메모.
 *
 * 목표 아이템(이름과 목표 개수)의 목록, 줄마다 가진 개수, 줄마다 고른 구하는 방법을 담는다. 줄의 자리 이름
 * (PlanNode.key)은 목표 번호(Goal.id)로 시작하므로 목표를 지울 때 그 목표의 줄만 걷어 낼 수 있다.
 * 비로그인은 이 브라우저에, 로그인하면 계정에도 동기화한다. 저장이 막힌 환경(시크릿 창 등)에서는 이번 방문 동안만 기억한다.
 */
export interface Goal {
  /** 줄의 자리 이름이 되므로 점(.)과 빗금(/)이 없다. */
  id: string;
  /** 아이템 이름. 제작 여부와 상관없이 아이템 사전에 있는 이름이면 된다. */
  name: string;
  /** 목표 개수. */
  quantity: number;
}

export interface MemoState {
  goals: readonly Goal[];
  /** 줄의 자리 이름 -> 가진 개수. 맨 위 줄은 그 목표의 현재 개수다. */
  owned: Readonly<Record<string, number>>;
  choices: TreeChoices;
}

const STORAGE_KEY = 'mabikuma:materialMemo:v2';

/** 목표 개수 상한. 저장값이 부풀지 않게 한다. */
export const MAX_GOALS = 50;
export const MAX_QUANTITY = 99999;

const EMPTY: MemoState = Object.freeze({ goals: [], owned: {}, choices: NO_CHOICES });

type Listener = () => void;

const listeners = new Set<Listener>();

let current: MemoState | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const wholeNumber = (value: unknown, max = MAX_QUANTITY) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(0, number)) : 0;
};

/** 자리 이름이 이 목표의 줄인지. */
const belongsTo = (key: string, id: string) => key === id || key.startsWith(`${id}.`);

/** 저장값은 믿지 않는다. 모양이 틀린 칸은 버리고 나머지를 살린다. 없는 목표의 줄은 버린다. */
export function parseState(raw: unknown): MemoState {
  if (!isRecord(raw) || !Array.isArray(raw.goals)) return EMPTY;
  const goals: Goal[] = [];
  const seen = new Set<string>();
  for (const entry of raw.goals) {
    if (!isRecord(entry) || goals.length >= MAX_GOALS) continue;
    const id = typeof entry.id === 'string' ? entry.id : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!id || /[./]/.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    goals.push({ id, name, quantity: Math.max(1, wholeNumber(entry.quantity)) });
  }
  if (goals.length === 0) return EMPTY;

  const known = (key: string) => goals.some((goal) => belongsTo(key, goal.id));

  const owned: Record<string, number> = {};
  if (isRecord(raw.owned)) {
    for (const [key, value] of Object.entries(raw.owned)) {
      const count = wholeNumber(value);
      if (count > 0 && known(key)) owned[key] = count;
    }
  }

  const methods: Record<string, Method> = {};
  const beadChecked: string[] = [];
  if (isRecord(raw.choices)) {
    if (isRecord(raw.choices.methods)) {
      for (const [key, value] of Object.entries(raw.choices.methods)) {
        if (!known(key)) continue;
        if (value === 'buy' || value === 'npc' || value === 'coin') methods[key] = value;
        else if (typeof value === 'number' && Number.isInteger(value) && value >= 0)
          methods[key] = value;
      }
    }
    if (Array.isArray(raw.choices.beadChecked)) {
      for (const key of raw.choices.beadChecked)
        if (typeof key === 'string' && known(key)) beadChecked.push(key);
    }
  }
  return { goals, owned, choices: { methods, beadChecked } };
}

function read(): MemoState {
  if (current) return current;
  let state = EMPTY;
  try {
    const raw = readPersonal(STORAGE_KEY);
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
    if (clean === EMPTY) removePersonal(STORAGE_KEY);
    else writePersonal(STORAGE_KEY, JSON.stringify(clean));
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

const newId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** 목표를 더하고 그 목표의 번호를 돌려준다. 같은 이름이 이미 있으면 목표 개수만 더한다. 가득 찼으면 null. */
export function addGoal(name: string, quantity: number): string | null {
  const state = read();
  const same = state.goals.find((goal) => goal.name === name);
  if (same) {
    setQuantity(same.id, Math.min(MAX_QUANTITY, same.quantity + Math.max(1, quantity)));
    return same.id;
  }
  if (state.goals.length >= MAX_GOALS) return null;
  const id = newId();
  write({ ...state, goals: [...state.goals, { id, name, quantity: Math.max(1, quantity) }] });
  return id;
}

/** 목표와 그 목표의 가진 개수, 고른 방법을 함께 지운다. */
export function removeGoal(id: string): void {
  const state = read();
  const keep = (key: string) => !belongsTo(key, id);
  write({
    goals: state.goals.filter((goal) => goal.id !== id),
    owned: Object.fromEntries(Object.entries(state.owned).filter(([key]) => keep(key))),
    choices: {
      methods: Object.fromEntries(
        Object.entries(state.choices.methods).filter(([key]) => keep(key)),
      ),
      beadChecked: state.choices.beadChecked.filter(keep),
    },
  });
}

export const clearGoals = () => write(EMPTY);

export function setQuantity(id: string, quantity: number): void {
  const state = read();
  write({
    ...state,
    goals: state.goals.map((goal) =>
      goal.id === id ? { ...goal, quantity: Math.max(1, quantity) } : goal,
    ),
  });
}

export function setOwned(key: string, count: number): void {
  const state = read();
  const owned = { ...state.owned };
  if (count > 0) owned[key] = count;
  else delete owned[key];
  write({ ...state, owned });
}

/** 가진 개수를 모두 비운다. 고른 방법은 남긴다. */
export const clearOwned = () => write({ ...read(), owned: {} });

/** 고른 방법을 바꾼다. 인자에는 지금 고른 것이 들어오고, 새로 고른 것을 돌려준다. */
export function updateChoices(change: (choices: TreeChoices) => TreeChoices): void {
  const state = read();
  write({ ...state, choices: change(state.choices) });
}

/** 테스트가 저장소를 비울 때. */
export function resetMemoCache(): void {
  current = null;
}

subscribePersonalStorage(({ key, external }) => {
  if (!external || (key !== null && key !== STORAGE_KEY)) return;
  current = null;
  for (const listener of listeners) listener();
});
