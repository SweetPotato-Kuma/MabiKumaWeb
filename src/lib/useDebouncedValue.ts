import { useEffect, useState } from 'react';

/**
 * 값이 잠잠해질 때까지 기다렸다가 넘겨준다.
 *
 * 한 글자마다 무거운 계산이 붙는 곳에서 쓴다. 입력칸 자체는 즉시 반응해야 하므로
 * 입력값이 아니라 그 값을 쓰는 쪽을 늦춘다. 타이머는 값이 바뀔 때마다 정리한다.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
