import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MAX_FRUITLESS_FETCHES, useAutoLoadMore } from './useAutoLoadMore';

type Props = Parameters<typeof useAutoLoadMore>[0];

function base(overrides: Partial<Props> = {}): Props {
  return {
    page: 1,
    pageSize: 10,
    rowCount: 500,
    hasNextPage: true,
    isFetching: false,
    fetchNextPage: vi.fn(() => Promise.resolve()),
    active: true,
    resetKey: 'a',
    ...overrides,
  };
}

describe('useAutoLoadMore', () => {
  it('끝쪽이 아니면 받지 않는다', () => {
    const props = base({ page: 3 });
    renderHook(() => useAutoLoadMore(props));

    expect(props.fetchNextPage).not.toHaveBeenCalled();
  });

  it('끝쪽을 열면 다음 묶음을 받는다', () => {
    const props = base({ page: 50 });
    renderHook(() => useAutoLoadMore(props));

    expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('더 받을 것이 없으면 받지 않는다', () => {
    const props = base({ page: 50, hasNextPage: false });
    renderHook(() => useAutoLoadMore(props));

    expect(props.fetchNextPage).not.toHaveBeenCalled();
  });

  it('보이지 않는 탭은 받지 않는다', () => {
    const props = base({ page: 50, active: false });
    renderHook(() => useAutoLoadMore(props));

    expect(props.fetchNextPage).not.toHaveBeenCalled();
  });

  it('받는 동안 다시 부르지 않는다', () => {
    // 두 번 부르면 react-query 가 앞 요청을 끊고 새로 받는다.
    const fetchNextPage = vi.fn(() => new Promise<void>(() => {}));
    const { rerender } = renderHook((props: Props) => useAutoLoadMore(props), {
      initialProps: base({ page: 50, fetchNextPage }),
    });
    rerender(base({ page: 50, fetchNextPage, isFetching: true }));
    rerender(base({ page: 50, fetchNextPage, isFetching: false }));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('맞는 줄이 늘지 않으면 몇 번 뒤에 멈추고, 이어 가면 다시 받는다', async () => {
    // 검색어가 드물게 걸리는 경우. 끝쪽에 머문 채로 한도를 다 쓰지 않게 한다.
    const fetchNextPage = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useAutoLoadMore(base({ rowCount: 3, fetchNextPage })),
    );

    await waitFor(() => expect(result.current.paused).toBe(true));
    expect(fetchNextPage).toHaveBeenCalledTimes(MAX_FRUITLESS_FETCHES);

    act(() => result.current.resume());
    await waitFor(() => expect(fetchNextPage.mock.calls.length).toBeGreaterThan(MAX_FRUITLESS_FETCHES));
  });

  it('새로 찾으면 멈춤이 풀린다', async () => {
    const fetchNextPage = vi.fn(() => Promise.resolve());
    const { result, rerender } = renderHook((props: Props) => useAutoLoadMore(props), {
      initialProps: base({ rowCount: 3, fetchNextPage }),
    });
    await waitFor(() => expect(result.current.paused).toBe(true));

    rerender(base({ rowCount: 500, fetchNextPage, resetKey: 'b' }));

    expect(result.current.paused).toBe(false);
  });
});
