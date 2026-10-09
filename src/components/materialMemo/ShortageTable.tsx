import { useMemo, useState } from 'react';
import { Card, Flex, Segmented, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { MemoItem } from '@/components/materialMemo/MemoItem';
import type { RecipeBook } from '@/features/crafting/recipes';
import { shortKinds, type ShortageRow } from '@/features/materialMemo/plan';
import { formatNumber } from '@/lib/format';

const { Text } = Typography;

type Filter = 'short' | 'all';

/** 목표 전체에서 만들지 않고 구해야 하는 재료를 아이템별로 합친 표. */
export function ShortageTable({ book, rows }: { book: RecipeBook; rows: readonly ShortageRow[] }) {
  const [filter, setFilter] = useState<Filter>('short');
  const kinds = shortKinds(rows);
  const shown = useMemo(
    () => (filter === 'short' ? rows.filter((row) => row.short > 0) : rows),
    [rows, filter],
  );

  const columns: TableColumnsType<ShortageRow> = [
    {
      title: '재료',
      key: 'name',
      render: (_value, row) => <MemoItem book={book} itemId={row.itemId} />,
    },
    {
      title: '필요',
      dataIndex: 'required',
      key: 'required',
      width: 90,
      align: 'right',
      className: 'tnum',
      render: (value: number) => formatNumber(value),
    },
    {
      title: '가진 개수',
      dataIndex: 'owned',
      key: 'owned',
      width: 100,
      align: 'right',
      className: 'tnum',
      render: (value: number) => formatNumber(value),
    },
    {
      title: '부족',
      dataIndex: 'short',
      key: 'short',
      width: 90,
      align: 'right',
      render: (value: number) =>
        value > 0 ? (
          <Text strong className="tnum">
            {formatNumber(value)}
          </Text>
        ) : (
          <Text type="success">완료</Text>
        ),
    },
  ];

  return (
    <Card>
      <Flex vertical gap={12}>
        <Flex gap={12} align="center" justify="space-between" wrap>
          <Text strong style={{ fontSize: 16 }}>
            구해야 할 재료
            <Text type="secondary" className="tnum" style={{ fontWeight: 400 }}>
              {' '}
              부족 {formatNumber(kinds)}종 / 전체 {formatNumber(rows.length)}종
            </Text>
          </Text>
          <Segmented<Filter>
            aria-label="재료 보기"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'short', label: '부족한 것' },
              { value: 'all', label: '전체' },
            ]}
          />
        </Flex>
        <Table<ShortageRow>
          size="small"
          rowKey="itemId"
          columns={columns}
          dataSource={shown}
          pagination={shown.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          locale={{ emptyText: <EmptyState size="small" description="부족한 재료가 없습니다" /> }}
        />
      </Flex>
    </Card>
  );
}
