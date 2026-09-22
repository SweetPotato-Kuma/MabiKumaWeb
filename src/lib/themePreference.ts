import { useCallback, useSyncExternalStore } from 'react';
import type { ThemeMode } from '@/app/theme';

const STORAGE_KEY = 'mabikuma:themeMode';

/** 'system' 이 기본. 사용자가 고르면 그 선택이 이 브라우저에만 남는다. */
export type ThemePreference = 'system' | ThemeMode;

type Listener = () => void;

const listeners = new Set<Listener>();

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readStorage(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isPreference(raw) ? raw : 'system';
  } catch {
    // 시크릿 모드 등 localStorage 접근이 막힌 환경
    return 'system';
  }
}

let preference: ThemePreference = typeof window === 'undefined' ? 'system' : readStorage();

/**
 * 스냅샷은 값이 바뀔 때만 갱신한다. useSyncExternalStore 는 같은 상태에서
 * 같은 결과를 돌려받아야 하고, 매번 새로 계산하면 무한 렌더에 빠진다.
 */
let resolvedMode: ThemeMode = 'light';

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function computeResolved(): ThemeMode {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

resolvedMode = computeResolved();

function emit(): void {
  resolvedMode = computeResolved();
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** OS 설정이 바뀌면 'system' 을 고른 사용자 화면도 따라 바뀌어야 한다. */
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', () => {
    if (preference === 'system') emit();
  });
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 저장 실패는 조용히 무시하고 메모리 값만 쓴다.
  }
  emit();
}

export function getResolvedThemeMode(): ThemeMode {
  return resolvedMode;
}

/** 지금 화면에 적용된 라이트/다크. ConfigProvider 가 읽는다. */
export function useResolvedThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getResolvedThemeMode, getResolvedThemeMode);
}

/** 설정 화면에서 쓰는 읽기/쓰기 훅. */
export function useThemePreference(): readonly [ThemePreference, (next: ThemePreference) => void] {
  const value = useSyncExternalStore(subscribe, getThemePreference, getThemePreference);
  const setValue = useCallback((next: ThemePreference) => {
    setThemePreference(next);
  }, []);
  return [value, setValue] as const;
}
