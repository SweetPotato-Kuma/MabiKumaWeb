import '@testing-library/jest-dom/vitest';

/**
 * jsdom 에는 matchMedia 가 없다. antd 의 반응형(Grid.useBreakpoint)과 테마 추종이
 * 이걸 부르므로, 없으면 화면을 렌더하는 테스트가 전부 터진다.
 * 기본값은 "조건에 맞지 않음"으로 둔다. 테스트가 좁은 화면을 가정하게 된다.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

/** antd 의 일부 컴포넌트가 크기 관측을 쓴다. jsdom 에는 없어서 비워 둔다. */
if (typeof window !== 'undefined' && typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * findBy, waitFor 의 기본 기다림은 1초다. 느린 기계에서는 화면이 그보다 늦게 그려진다. 화면을 그리는 시험(jsdom)에만 건다.
 * 요소가 정말 없을 때는 이만큼 늦게 실패할 뿐이다.
 */
if (typeof window !== 'undefined') {
  const { configure } = await import('@testing-library/react');
  configure({ asyncUtilTimeout: 5_000 });
}
