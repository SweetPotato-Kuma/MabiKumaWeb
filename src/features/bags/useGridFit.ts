import { useEffect, useState, type RefObject } from 'react';

interface GridFitOptions {
  /** 칸의 최소 너비. CSS 의 repeat(auto-fill, minmax(이 값, 1fr)) 과 같게 둔다. */
  minColumnWidth: number;
  /** 칸 높이. 카드 높이를 고정해 두어야 줄 수를 셀 수 있다. */
  rowHeight: number;
  gap: number;
  /** 격자 아래에 남겨 둘 높이(쪽 넘기기 버튼 자리). */
  reserveBelow: number;
  /** 화면이 아주 낮아도 이만큼은 보여 준다. */
  minRows: number;
  /** 격자 위의 내용이 바뀌어 격자가 위아래로 움직였을 때 다시 재기 위한 값. */
  layoutKey: unknown;
}

/**
 * 격자 한 쪽에 몇 개를 둘지. 격자가 화면 맨 아래 쪽 넘기기 버튼까지 스크롤 없이 들어가도록
 * 지금 화면 크기로 센다. 1920x1080 에서 맞추라는 요청이었지만 화면마다 높이가 달라 고정값으로는
 * 어딘가에서 넘치거나 비므로, 실제 창 크기로 잰다.
 *
 * 격자 요소가 아직 없으면 null 이다.
 */
export function useGridFit(
  ref: RefObject<HTMLElement | null>,
  options: GridFitOptions,
): number | null {
  const { minColumnWidth, rowHeight, gap, reserveBelow, minRows, layoutKey } = options;
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const width = element.clientWidth;
      const top = element.getBoundingClientRect().top + window.scrollY;
      const columns = Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)));
      const available = window.innerHeight - top - reserveBelow;
      const rows = Math.max(minRows, Math.floor((available + gap) / (rowHeight + gap)));
      setCount(columns * rows);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, minColumnWidth, rowHeight, gap, reserveBelow, minRows, layoutKey]);

  return count;
}
