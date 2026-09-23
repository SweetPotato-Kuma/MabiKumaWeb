import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, useListPagination } from './useListPagination';

describe('useListPagination', () => {
  it('처음에는 10줄씩, 10 20 30 50 100 중에서 고를 수 있다', () => {
    const { result } = renderHook(() => useListPagination('a'));

    expect(DEFAULT_PAGE_SIZE).toBe(10);
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 20, 30, 50, 100]);
    expect(result.current.pagination).toMatchObject({
      current: 1,
      pageSize: 10,
      pageSizeOptions: [10, 20, 30, 50, 100],
      showSizeChanger: true,
    });
  });

  it('쪽을 넘긴다', () => {
    const { result } = renderHook(() => useListPagination('a'));
    act(() => result.current.pagination.onChange?.(3, 10));

    expect(result.current.page).toBe(3);
  });

  it('쪽 크기를 바꾸면 첫 쪽으로 돌아간다', () => {
    // 크기가 바뀌면 같은 쪽 번호가 전혀 다른 줄을 가리킨다.
    const { result } = renderHook(() => useListPagination('a'));
    act(() => result.current.pagination.onChange?.(4, 10));
    act(() => result.current.pagination.onChange?.(4, 50));

    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(50);
  });

  it('새로 찾으면 첫 쪽으로 돌아간다', () => {
    const { result, rerender } = renderHook(({ key }) => useListPagination(key), {
      initialProps: { key: 'a' },
    });
    act(() => result.current.pagination.onChange?.(5, 10));
    rerender({ key: 'b' });

    expect(result.current.page).toBe(1);
  });

  it('쪽이 그대로면 설정 객체도 그대로다', () => {
    // 경매장은 타이핑하는 동안 결과 패널을 메모로 굳혀 둔다. 이 객체가 매번 새로 나오면 깨진다.
    const { result, rerender } = renderHook(() => useListPagination('a'));
    const before = result.current.pagination;
    rerender();

    expect(result.current.pagination).toBe(before);
  });
});
