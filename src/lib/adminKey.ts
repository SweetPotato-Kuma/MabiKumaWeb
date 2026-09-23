import { useCallback, useSyncExternalStore } from 'react';

/**
 * 운영자 키.
 *
 * 무엇을 지키고 무엇을 못 지키는지 분명히 해 둔다.
 *
 * - **지키는 것**: 카드 쓰기. 워커가 이 키를 다시 확인하므로, 키가 없으면 남이 사전에
 *   아무거나 밀어 넣을 수 없다. 이게 진짜 잠금이다.
 * - **못 지키는 것**: 화면 코드. 정적 번들이라 누구나 내려받아 읽을 수 있다. 키 입력칸
 *   뒤에 화면을 숨기는 것은 낯선 사람이 열었을 때 쓸 것이 없게 만드는 정도의 의미다.
 *   그 이상으로 믿지 않는다.
 * - **애초에 공개인 것**: 아이콘과 설명. 사전 화면이 방문자 모두에게 보여 주는 내용이다.
 *
 * 키는 이 브라우저의 localStorage 에만 남는다. `settings.ts` 의 API 키와 같은 방식이다.
 */

const ADMIN_KEY_STORAGE_KEY = 'mabikuma:adminKey';

type Listener = () => void;

const listeners = new Set<Listener>();

function readStorage(): string {
  try {
    return window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY) ?? '';
  } catch {
    // 시크릿 모드 등 localStorage 접근이 막힌 환경
    return '';
  }
}

let cache = typeof window === 'undefined' ? '' : readStorage();

export function getAdminKey(): string {
  return cache;
}

export function setAdminKey(value: string): void {
  cache = value.trim();
  try {
    if (cache) window.localStorage.setItem(ADMIN_KEY_STORAGE_KEY, cache);
    else window.localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
  } catch {
    // 저장이 막혀도 이번 세션 동안은 쓸 수 있게 메모리 값은 남긴다.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 키를 읽고 쓰는 훅. 키가 들어오면 내비와 화면이 한꺼번에 반응한다. */
export function useAdminKey(): readonly [string, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, getAdminKey, getAdminKey);
  const setValue = useCallback((next: string) => {
    setAdminKey(next);
  }, []);
  return [value, setValue] as const;
}

/** 키를 들고 있는지. 내비에 운영자 메뉴를 걸지 말지 정할 때 쓴다. */
export function useHasAdminKey(): boolean {
  return useAdminKey()[0] !== '';
}
