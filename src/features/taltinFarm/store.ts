import { useCallback, useSyncExternalStore } from 'react';
import { FARM_ORDERS, MAX_REWARD_QTY, MAX_REWARD_SLOTS, REWARD_ITEMS } from './data';
import type { RewardPick } from './value';

/**
 * 탈틴 농장 계산기의 내 입력. 주문마다 고른 납품 보상, 고정한 주문, 보상 가치를 이 브라우저에만 남긴다.
 * 주문을 이름으로 적어 두어 주문 목록 순서가 바뀌어도 엉뚱한 주문에 붙지 않는다.
 * 저장이 막힌 환경(시크릿 창 등)에서는 이번 방문 동안만 기억한다.
 */
export interface FarmState {
  /** 주문 이름 -> 보상 칸들. */
  rewards: Readonly<Record<string, readonly RewardPick[]>>;
  /** 위에 고정한 주문 이름. */
  pinned: readonly string[];
  /** 보상 키 -> 가치(골드). 기본값과 다른 것만. */
  rewardValues: Readonly<Record<string, number>>;
}

const STORAGE_KEY = 'mabikuma:taltinFarm';

const EMPTY: FarmState = Object.freeze({ rewards: {}, pinned: [], rewardValues: {} });

const ORDER_NAMES = new Set(FARM_ORDERS.map((order) => order.name));
const REWARD_KEYS = new Set(REWARD_ITEMS.map((reward) => reward.key));

type Listener = () => void;

const listeners = new Set<Listener>();
let cache: FarmState | undefined;

function sanitizePicks(raw: unknown): RewardPick[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_REWARD_SLOTS).flatMap((pick): RewardPick[] => {
    if (!pick || typeof pick !== 'object') return [];
    const { key, qty } = pick as { key?: unknown; qty?: unknown };
    const count = Math.floor(Number(qty));
    if (typeof key !== 'string' || !REWARD_KEYS.has(key)) return [];
    return [{ key, qty: Number.isFinite(count) ? Math.min(MAX_REWARD_QTY, Math.max(0, count)) : 0 }];
  });
}

export function sanitizeFarmState(raw: unknown): FarmState {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const source = raw as Partial<Record<keyof FarmState, unknown>>;
  const rewards: Record<string, RewardPick[]> = {};
  if (source.rewards && typeof source.rewards === 'object') {
    for (const [name, picks] of Object.entries(source.rewards)) {
      const clean = sanitizePicks(picks);
      if (ORDER_NAMES.has(name) && clean.length > 0) rewards[name] = clean;
    }
  }
  const pinned = Array.isArray(source.pinned)
    ? [...new Set(source.pinned.filter((name): name is string => typeof name === 'string' && ORDER_NAMES.has(name)))]
    : [];
  const rewardValues: Record<string, number> = {};
  if (source.rewardValues && typeof source.rewardValues === 'object') {
    for (const [key, value] of Object.entries(source.rewardValues)) {
      const gold = Math.floor(Number(value));
      if (REWARD_KEYS.has(key) && Number.isFinite(gold) && gold >= 0) rewardValues[key] = gold;
    }
  }
  if (Object.keys(rewards).length === 0 && pinned.length === 0 && Object.keys(rewardValues).length === 0) return EMPTY;
  return { rewards, pinned, rewardValues };
}

function read(): FarmState {
  if (cache) return cache;
  let state = EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) state = sanitizeFarmState(JSON.parse(raw));
  } catch {
    // 저장이 막혔거나 망가진 값이다. 빈 것으로 시작한다.
  }
  cache = state;
  return state;
}

function write(next: FarmState): void {
  const clean = sanitizeFarmState(next);
  cache = clean;
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

/** 내 입력과, 지금 값을 받아 다음 값을 돌려주는 함수로 고치는 함수. */
export function useFarmState(): [FarmState, (update: (previous: FarmState) => FarmState) => void] {
  const state = useSyncExternalStore(subscribe, read, () => EMPTY);
  const update = useCallback((change: (previous: FarmState) => FarmState) => write(change(read())), []);
  return [state, update];
}

/** 테스트가 저장소를 비울 때. */
export function resetFarmStateCache(): void {
  cache = undefined;
}
