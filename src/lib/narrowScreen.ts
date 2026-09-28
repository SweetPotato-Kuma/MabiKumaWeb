import { useSyncExternalStore } from 'react';

/** antd sm 경계(576px) 미만. 휴대폰 세로 화면이 여기에 든다. */
const QUERY = '(max-width: 575.98px)';

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

/**
 * 휴대폰 폭인가. antd Grid.useBreakpoint 는 첫 렌더에 빈 값을 주므로, 테마처럼 첫 페인트부터
 * 맞아야 하는 곳은 이것을 쓴다. 첫 렌더에 틀린 값으로 그렸다가 바꾸면 토큰을 통째로 다시 계산한다.
 */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
