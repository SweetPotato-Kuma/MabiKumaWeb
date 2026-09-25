import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Flex } from 'antd';

/** 카드가 새 자리로 미끄러지는 시간. 제작 비용 표의 줄과 같은 값이라 함께 움직여 보인다. */
const MOVE_MS = 200;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const MOVE_ID = 'stack-move';

const canAnimate = (element: HTMLElement) =>
  typeof element.animate === 'function' &&
  !(
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

/** 지금 걸린 세로 이동량. 움직이는 중이면 그 순간의 값이다. */
function currentShiftY(element: HTMLElement): number {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === 'none' || typeof DOMMatrixReadOnly === 'undefined') return 0;
  return new DOMMatrixReadOnly(transform).m42;
}

/**
 * 카드를 세로로 쌓고, 위 카드의 높이가 바뀌면 아래 카드가 한 번에 밀리지 않고 미끄러져 오게 한다.
 *
 * 아이템 정보 상세에서 제작 비용 표를 펼치면 표 안의 줄은 미끄러지는데, 그 아래 시세 기록 카드는
 * 한 번에 내려가 덜컹거렸다. 카드 높이는 자식 컴포넌트 안에서 바뀌어 이 컴포넌트는 다시 그려지지
 * 않으므로, ResizeObserver 로 크기가 바뀐 것을 알고 그때 자리를 잰다(FLIP). ResizeObserver 는 배치가
 * 끝나고 그리기 전에 불리므로 새 자리가 한 번 보였다가 튀는 일이 없다.
 *
 * transform 만 움직이고, 움직임 줄이기 설정을 따른다. 화면 규칙상 CSS 파일에 컴포넌트 스타일을
 * 두지 않아 Web Animations API 로 건다.
 */
export function SlidingStack({ gap, children }: { gap: number; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const tops = new WeakMap<Element, number>();

    const measure = (animate: boolean) => {
      const base = container.getBoundingClientRect().top;
      for (const child of Array.from(container.children) as HTMLElement[]) {
        const shift = currentShiftY(child);
        const top = child.getBoundingClientRect().top - base - shift;
        const before = tops.get(child);
        tops.set(child, top);
        if (!animate || before === undefined || Math.abs(before - top) < 1 || !canAnimate(child))
          continue;
        // 지금 걸려 있는 이동만큼 더해, 방금 보이던 자리에서 출발한다.
        child
          .getAnimations()
          .filter((animation) => animation.id === MOVE_ID)
          .forEach((animation) => animation.cancel());
        child.animate(
          [{ transform: `translateY(${before + shift - top}px)` }, { transform: 'none' }],
          { id: MOVE_ID, duration: MOVE_MS, easing: EASING },
        );
      }
    };

    measure(false);
    const resize = new ResizeObserver(() => measure(true));
    const watchChildren = () => {
      for (const child of Array.from(container.children)) resize.observe(child);
    };
    watchChildren();
    // 카드가 새로 붙거나 빠져도(제작법이 있는 아이템으로 넘어갈 때 등) 새 카드를 지켜본다.
    const mutation = new MutationObserver(() => {
      watchChildren();
      measure(true);
    });
    mutation.observe(container, { childList: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);

  return (
    <Flex vertical gap={gap} ref={ref}>
      {children}
    </Flex>
  );
}
