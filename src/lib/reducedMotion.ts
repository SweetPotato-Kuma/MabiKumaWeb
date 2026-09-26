import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function media(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

function subscribe(listener: () => void): () => void {
  const list = media();
  list?.addEventListener('change', listener);
  return () => list?.removeEventListener('change', listener);
}

const getSnapshot = () => media()?.matches ?? false;

/** OS 의 움직임 줄이기 설정. 켜고 끄면 새로고침 없이 따라간다. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
