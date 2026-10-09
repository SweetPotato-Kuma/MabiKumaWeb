import { useMemo } from 'react';
import { Collapse, Flex, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { MaterialIconSlot } from '@/components/crafting/craftTreeCells';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import type { PlanNode } from '@/features/crafting/plan';
import type { RecipeBook } from '@/features/crafting/recipes';
import { materialTotals, type MaterialTotal } from '@/features/materialMemo/totals';
import { formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 한 쪽에 보이는 재료 수. 무거운 장비는 거래되는 재료만 수백 종이 나온다. */
const PAGE_SIZE = 20;

/**
 * 전체 재료. 목표 전체에서 실제로 구해야 하는 재료를 아이템별로 합쳐 전체 개수와 가진 개수만 보여 준다.
 * 기본은 접혀 있다. 시세와 부족 개수는 아래 표에 있다.
 */
export function MaterialSummary({ book, nodes }: { book: RecipeBook; nodes: PlanNode[] }) {
  const totals = useMemo(() => materialTotals(nodes), [nodes]);
  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];

  const columns: TableColumnsType<MaterialTotal> = [
    {
      title: '재료',
      key: 'name',
      render: (_value, row) => {
        const name = book.itemName(row.itemId);
        const category = categoryOf(name);
        const file = book.iconOf(row.itemId);
        return (
          <Flex gap={8} align="center">
            {category || file ? (
              <ItemIcon category={category} name={name} file={file} size={28} />
            ) : (
              <MaterialIconSlot />
            )}
            <ItemInfoLink name={name} category={category} />
          </Flex>
        );
      },
    },
    {
      title: '전체 개수',
      dataIndex: 'required',
      key: 'required',
      width: 120,
      align: 'right',
      className: 'tnum',
      render: (value: number) => formatNumber(value),
    },
    {
      title: '가진 개수',
      dataIndex: 'owned',
      key: 'owned',
      width: 120,
      align: 'right',
      className: 'tnum',
      render: (value: number) => formatNumber(value),
    },
  ];

  return (
    <Collapse
      items={[
        {
          key: 'materials',
          label: (
            <Flex gap={8} align="baseline">
              <Text strong style={{ fontSize: 16 }}>
                전체 재료
              </Text>
              <Text type="secondary" className="tnum">
                {formatNumber(totals.length)}종
              </Text>
            </Flex>
          ),
          children: (
            <Table<MaterialTotal>
              size="small"
              rowKey="itemId"
              columns={columns}
              dataSource={totals}
              pagination={
                totals.length > PAGE_SIZE ? { pageSize: PAGE_SIZE, showSizeChanger: false } : false
              }
            />
          ),
        },
      ]}
    />
  );
}
