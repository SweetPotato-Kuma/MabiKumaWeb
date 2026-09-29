import { useEffect } from 'react';

/** Ctrl+K(맥은 Cmd+K). 한글 입력 상태에서도 자판 위치(code)로 잡는다. */
export function useSearchShortcut(toggle: () => void) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.code !== 'KeyK' && event.key.toLowerCase() !== 'k') return;
      // 브라우저 주소창 검색 등 기본 동작이 먼저 가로채지 못하게 막는다.
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
}

/** 단축키 안내에 쓰는 글자. 맥은 Cmd 기호를 쓴다. */
export function searchShortcutLabel(): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  return isMac ? '⌘ K' : 'Ctrl K';
}
