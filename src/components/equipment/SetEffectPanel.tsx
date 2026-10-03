import { Collapse, Flex, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { describeContribution, type ItemSetEffect } from '@/features/equipment/setEffects';

const { Text } = Typography;

type OtherItem = ItemSetEffect['others'][number];

const OTHER_COLUMNS: TableColumnsType<OtherItem> = [
  {
    title: '장비',
    key: 'name',
    render: (_, row) => <ItemInfoLink name={row.name} />,
  },
  {
    title: '수치',
    key: 'value',
    align: 'right',
    className: 'tnum',
    render: (_, row) => (
      <span style={{ whiteSpace: 'nowrap' }}>{describeContribution(row.contribution)}</span>
    ),
  },
];

function EffectBlock({ effect }: { effect: ItemSetEffect }) {
  const { def, own, others } = effect;
  return (
    <Flex vertical gap={6}>
      <Flex align="baseline" justify="space-between" gap={8} wrap>
        <Text strong>{def.name}</Text>
        <Flex gap={4} wrap>
          <Tag color="processing" className="tnum" style={{ marginInlineEnd: 0 }}>
            {describeContribution(own)}
          </Tag>
          {def.need > 0 ? (
            <Tag className="tnum" style={{ marginInlineEnd: 0 }}>
              발동 {def.need}
            </Tag>
          ) : null}
        </Flex>
      </Flex>
      {def.desc ? (
        <Text type="secondary" className="tnum" style={{ whiteSpace: 'pre-line' }}>
          {def.desc}
        </Text>
      ) : null}
      {others.length ? (
        <Collapse
          size="small"
          items={[
            {
              key: 'others',
              label: <Text className="tnum">같은 효과 장비 {others.length}개</Text>,
              styles: { body: { padding: 0 } },
              children: (
                <Table<OtherItem>
                  size="small"
                  rowKey="name"
                  showHeader={false}
                  columns={OTHER_COLUMNS}
                  dataSource={others}
                  pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true }}
                />
              ),
            },
          ]}
        />
      ) : null}
    </Flex>
  );
}

/**
 * 장비의 세트 효과. 효과마다 이 장비가 주는 수치와 발동 기준, 효과 설명, 같은 효과를 주는 장비를 보여 준다.
 * 같은 효과 장비는 접어 둔다. 많이 쓰이는 효과는 백 개가 넘는다.
 */
export function SetEffectPanel({ effects }: { effects: ItemSetEffect[] }) {
  return (
    <Flex vertical gap={16}>
      {effects.map((effect) => (
        <EffectBlock key={effect.key} effect={effect} />
      ))}
    </Flex>
  );
}
