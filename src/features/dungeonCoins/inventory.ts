import { useCallback, useSyncExternalStore } from 'react';

/**
 * 가공 계산기의 가진 재료.
 *
 * 아이템 번호 -> 개수. 구슬로 이미 교환해 둔 재료와 가진 일반 재료를 함께 담는다. 계산기가 이만큼은
 * 구슬을 쓰지 않고, 사지 않은 것으로 센다. 다음에 와도 다시 넣지 않게 이 브라우저에만 남긴다.
 * 저장이 막힌 환경(시크릿 창 등)에서는 이번 방문 동안만 기억한다.
 */
export type Inventory = Readonly<Record<number, number>>;

const STORAGE_PREFIX = 'mabikuma:dungeonCoins:inventory:';

const EMPTY: Inventory = Object.freeze({});

type Listener = () => void;

const listeners = new Set<Listener>();

/** 던전 키마다 한 벌. 스냅샷은 바뀔 때만 새로 만든다(useSyncExternalStore 가 같은 값을 기대한다). */
const cache = new Map<string, Inventory>();

function sanitize(raw: unknown): Inventory {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const clean: Record<number, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = Number(key);
    const count = Math.floor(Number(value));
    if (Number.isInteger(id) && id > 0 && count > 0) clean[id] = count;
  }
  return Object.keys(clean).length > 0 ? clean : EMPTY;
}

function read(key: string): Inventory {
  const cached = cache.get(key);
  if (cached) return cached;
  let inventory = EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) inventory = sanitize(JSON.parse(raw));
  } catch {
    // 저장이 막혔거나 망가진 값이다. 빈 것으로 시작한다.
  }
  cache.set(key, inventory);
  return inventory;
}

function write(key: string, inventory: Inventory): void {
  const clean = sanitize(inventory);
  cache.set(key, clean);
  try {
    if (clean === EMPTY) window.localStorage.removeItem(STORAGE_PREFIX + key);
    else window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(clean));
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

/** 던전 하나의 가진 재료와, 통째로 바꾸는 함수. 빈 객체를 넘기면 초기화다. */
export function useInventory(key: string): [Inventory, (next: Inventory) => void] {
  const inventory = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
  const setInventory = useCallback((next: Inventory) => write(key, next), [key]);
  return [inventory, setInventory];
}

/** 테스트가 저장소를 비울 때. */
export function resetInventoryCache(): void {
  cache.clear();
}
