import { useEffect, useMemo, useState } from 'react';
import type { TablePaginationConfig } from 'antd';

/** 한 쪽에 보여 줄 줄 수 선택지. 모든 목록이 같은 선택지를 쓴다. */
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

/** 처음에는 10줄. 한눈에 훑을 수 있는 양이고, 휴대폰에서도 한두 번 내리면 끝난다. */
export const DEFAULT_PAGE_SIZE = 10;

/**
 * 표의 쪽 넘기기.
 *
 * `resetKey` 가 바뀌면 첫 쪽으로 돌아간다. 새로 찾은 결과에서 옛 쪽 번호는 뜻이 없다.
 * 쪽 크기를 바꿔도 첫 쪽으로 돌아간다. 크기가 바뀌면 같은 번호가 전혀 다른 줄을 가리킨다.
 *
 * 설정 객체는 쪽이 바뀔 때만 새로 만든다. 경매장은 타이핑하는 동안 표를 다시 그리지 않도록
 * 결과 패널을 메모로 굳혀 두는데, 이 객체가 렌더마다 새로 나오면 그 메모가 매번 깨진다.
 */
export function useListPagination(resetKey: unknown) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const pagination = useMemo<TablePaginationConfig>(
    () => ({
      current: page,
      pageSize,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      showSizeChanger: true,
      size: 'small',
      onChange: (nextPage, nextSize) => {
        if (nextSize !== pageSize) {
          setPageSize(nextSize);
          setPage(1);
          return;
        }
        setPage(nextPage);
      },
    }),
    [page, pageSize],
  );

  return { page, pageSize, pagination };
}
