import { Table, type TableColumnsType } from 'antd';
import type { StatRow } from '@/features/equipment/simulate';
import { formatStatRange, formatStatValue, statLabel } from '@/features/equipment/stats';

/**
 * 최종 능력치 표. 기본, 랜덤, 개조를 칸으로 나눠 두어 합계가 어디서 왔는지 바로 보이게 한다.
 * 더한 것이 없는 칸은 비워 둔다. 0 을 적으면 "0 을 더했다" 로 읽힌다.
 */
export function StatTable({ rows }: { rows: StatRow[] }) {
  const columns: TableColumnsType<StatRow> = [
    { title: '능력치', dataIndex: 'stat', key: 'stat', render: (stat: string) => statLabel(stat) },
    {
      title: '기본',
      key: 'base',
      align: 'right',
      className: 'tnum',
      render: (_, row) => (row.base ? formatStatValue(row.stat, row.base) : ''),
    },
    {
      title: '랜덤',
      key: 'random',
      align: 'right',
      className: 'tnum',
      render: (_, row) => (row.random ? formatStatValue(row.stat, row.random, true) : ''),
    },
    {
      title: '개조',
      key: 'upgrade',
      align: 'right',
      className: 'tnum',
      render: (_, row) =>
        row.upgradeMin || row.upgradeMax
          ? formatStatRange(row.stat, row.upgradeMin, row.upgradeMax, true)
          : '',
    },
    {
      title: '합계',
      key: 'total',
      align: 'right',
      className: 'tnum',
      render: (_, row) => <strong>{formatStatRange(row.stat, row.totalMin, row.totalMax)}</strong>,
    },
  ];

  return (
    <Table<StatRow>
      size="small"
      rowKey="stat"
      columns={columns}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 'max-content' }}
      locale={{ emptyText: '이 장비에는 적힌 능력치가 없습니다.' }}
    />
  );
}
