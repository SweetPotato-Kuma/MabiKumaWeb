import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * 조건에 맞는 줄이 하나도 늘지 않은 채 이만큼 연달아 받으면 멈춘다.
 *
 * 검색어가 드물게 걸리면 끝쪽에 머문 채로 다음 묶음을 계속 받게 된다. 넥슨 쪽 한도를
 * 조용히 다 쓰지 않도록 여기서 끊고, 계속할지는 사용자가 고르게 한다.
 */
export const MAX_FRUITLESS_FETCHES = 3;

interface AutoLoadMoreInput {
  /** 지금 보고 있는 쪽 번호. 1부터. */
  page: number;
  pageSize: number;
  /** 표에 보이는 줄 수. 검색어로 거른 뒤의 수다. */
  rowCount: number;
  hasNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: () => unknown;
  /** 보이지 않는 탭은 받지 않는다. */
  active: boolean;
  /** 바뀌면 멈춤과 셈을 처음으로 돌린다. 새로 찾을 때 넘긴다. */
  resetKey: unknown;
}

/**
 * 끝쪽에 닿으면 다음 묶음을 알아서 받는다.
 *
 * 넥슨 API 는 한 번에 500건씩 커서로 준다. 예전에는 "500개 더 불러오기" 단추를 눌러야
 * 했는데, 쪽 넘기기와 따로 놀아서 끝쪽에서 멈춘 것처럼 보였다. 이제 마지막 쪽을 열면
 * 다음 묶음을 받아 뒤에 쪽이 생긴다. 사용자에게는 쪽이 끝없이 이어지는 것처럼 보인다.
 */
export function useAutoLoadMore({
  page,
  pageSize,
  rowCount,
  hasNextPage,
  isFetching,
  fetchNextPage,
  active,
  resetKey,
}: AutoLoadMoreInput) {
  const [paused, setPaused] = useState(false);
  // 받는 중인지는 isFetching 보다 먼저 안다. 그 틈에 두 번 부르면 react-query 가 앞 요청을 끊는다.
  const busy = useRef(false);
  const misses = useRef(0);
  const rowsAtLastFetch = useRef<number | null>(null);
  // 받기가 끝나면 한 번 더 따져 보게 한다. 결과가 그대로면 react-query 는 다시 그리지 않는다.
  const [settled, setSettled] = useState(0);

  useEffect(() => {
    setPaused(false);
    misses.current = 0;
    rowsAtLastFetch.current = null;
  }, [resetKey]);

  const atLastPage = page * pageSize >= rowCount;

  useEffect(() => {
    if (!active || paused || busy.current || isFetching || !hasNextPage || !atLastPage) return;

    const before = rowsAtLastFetch.current;
    if (before !== null) {
      misses.current = rowCount > before ? 0 : misses.current + 1;
      if (misses.current >= MAX_FRUITLESS_FETCHES) {
        setPaused(true);
        return;
      }
    }

    rowsAtLastFetch.current = rowCount;
    busy.current = true;
    void Promise.resolve(fetchNextPage()).finally(() => {
      busy.current = false;
      setSettled((count) => count + 1);
    });
  }, [active, atLastPage, fetchNextPage, hasNextPage, isFetching, paused, rowCount, settled]);

  /** 멈춘 뒤 사용자가 계속 찾겠다고 할 때. */
  const resume = useCallback(() => {
    misses.current = 0;
    rowsAtLastFetch.current = null;
    setPaused(false);
  }, []);

  // 경매장은 결과 패널을 메모로 굳혀 둔다. 렌더마다 새 객체를 주면 타이핑할 때마다 표가 다시 그려진다.
  const stopped = paused && hasNextPage;
  return useMemo(() => ({ paused: stopped, resume }), [stopped, resume]);
}
