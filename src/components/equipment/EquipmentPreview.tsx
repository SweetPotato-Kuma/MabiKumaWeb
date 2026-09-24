import type { ReactNode } from 'react';
import { Flex, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { ItemIcon } from '@/components/ItemIcon';
import { effectSummary, enchantRank } from '@/features/equipment/enchant';
import type { StatRow } from '@/features/equipment/simulate';
import { describeSpecialStep, type SpecialStep } from '@/features/equipment/specialUpgrade';
import {
  NON_ADDITIVE_STATS,
  describeStats,
  formatStatRange,
  formatStatValue,
  statLabel,
} from '@/features/equipment/stats';
import type { EnchantDef, UpgradeDef } from '@/features/equipment/types';
import type { ItemCard } from '@/features/itemcard/cards';

const { Text, Title } = Typography;

export interface EquipmentPreviewProps {
  name: string;
  card: ItemCard | null | undefined;
  rows: StatRow[];
  enchants: EnchantDef[];
  upgrades: UpgradeDef[];
  upgradeCount: { done: number; max: number; gemDone: number; gemMax: number };
  reforgeLines: string[];
  special: { label: string; step: SpecialStep | undefined } | null;
}

/** 한 줄이 어디서 왔는지. 더한 것이 있는 칸만 적는다. */
function breakdown(row: StatRow): string {
  const parts: string[] = [];
  if (row.base) parts.push(`기본 ${formatStatValue(row.stat, row.base)}`);
  if (row.randomRange) {
    const [min, max] = row.randomRange;
    parts.push(
      `유동 ${formatStatValue(row.stat, row.random, true)} (${formatStatRange(row.stat, min, max)})`,
    );
  }
  if (row.upgrade[0] || row.upgrade[1])
    parts.push(`개조 ${formatStatRange(row.stat, ...row.upgrade, true)}`);
  if (row.enchant[0] || row.enchant[1])
    parts.push(`인챈트 ${formatStatRange(row.stat, ...row.enchant, true)}`);
  if (row.special) parts.push(`특별 개조 ${formatStatValue(row.stat, row.special, true)}`);
  return parts.join(', ');
}

/** 제목과 내용을 한 줄에. 내용이 길면 줄을 넘겨 이어 쓴다. */
function Line({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Text>
      <Text strong>{title}</Text> {children}
    </Text>
  );
}

/**
 * 장비 미리보기. 고른 것을 모두 합친 장비 한 벌을 게임 툴팁처럼 한 카드에 모은다.
 *
 * 능력치는 한 줄에 하나다. 구성(기본, 유동, 개조, 인챈트, 특별 개조)은 이름 옆에 작은 글씨로 붙이고,
 * 길면 말줄임한 뒤 마우스를 올리면 전체가 보인다. 인챈트, 세공, 특별 개조도 효과를 쉼표로 이어 한 줄씩
 * 쓴다. 줄마다 늘어놓았더니 카드가 화면보다 길어져 합계와 효과를 한눈에 볼 수 없었다.
 */
export function EquipmentPreview({
  name,
  card,
  rows,
  enchants,
  upgrades,
  upgradeCount,
  reforgeLines,
  special,
}: EquipmentPreviewProps) {
  const prefix = enchants.find((enchant) => enchant.slot === 0);
  const suffix = enchants.find((enchant) => enchant.slot === 1);
  const fullName = [prefix?.name, suffix?.name, name].filter(Boolean).join(' ');
  const personal =
    enchants.some((enchant) => enchant.personal) || upgrades.some((def) => def.personal);
  const upgradeExtras = upgrades.filter(
    (def) =>
      def.options?.length || def.lucky || def.stats.some(([stat]) => NON_ADDITIVE_STATS.has(stat)),
  );

  const columns: TableColumnsType<StatRow> = [
    {
      title: '능력치',
      key: 'stat',
      ellipsis: { showTitle: false },
      render: (_, row) => {
        const parts = breakdown(row);
        return (
          <Flex align="baseline" gap={8} style={{ minWidth: 0 }}>
            <span style={{ flex: '0 0 auto' }}>{statLabel(row.stat)}</span>
            {parts ? (
              <Text
                type="secondary"
                className="tnum"
                ellipsis={{ tooltip: parts }}
                style={{ fontSize: 12, minWidth: 0 }}
              >
                {parts}
              </Text>
            ) : null}
          </Flex>
        );
      },
    },
    {
      title: '합계',
      key: 'total',
      align: 'right',
      width: 96,
      className: 'tnum',
      render: (_, row) => <Text strong>{formatStatRange(row.stat, ...row.total)}</Text>,
    },
  ];

  return (
    <Flex vertical gap={10}>
      <Flex gap={10} align="center">
        <ItemIcon card={card} size={48} />
        <Flex vertical gap={4} style={{ minWidth: 0 }}>
          <Title level={5} style={{ margin: 0 }}>
            {fullName}
          </Title>
          <Flex gap={4} wrap>
            {special ? (
              <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                {special.label}
              </Tag>
            ) : null}
            {upgradeCount.max ? (
              <Tag style={{ marginInlineEnd: 0 }} className="tnum">
                개조 {upgradeCount.done}/{upgradeCount.max}
              </Tag>
            ) : null}
            {upgradeCount.gemMax ? (
              <Tag style={{ marginInlineEnd: 0 }} className="tnum">
                보석 {upgradeCount.gemDone}/{upgradeCount.gemMax}
              </Tag>
            ) : null}
            {personal ? (
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                전용
              </Tag>
            ) : null}
          </Flex>
        </Flex>
      </Flex>

      <Table<StatRow>
        size="small"
        rowKey="stat"
        tableLayout="fixed"
        showHeader={false}
        columns={columns}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: '이 장비에는 적힌 능력치가 없습니다.' }}
      />

      <Flex vertical gap={4}>
        {[prefix, suffix]
          .filter((enchant): enchant is EnchantDef => Boolean(enchant))
          .map((enchant) => (
            <Line
              key={enchant.id}
              title={`${enchant.slot === 0 ? '접두' : '접미'} ${enchant.name} (${enchantRank(enchant.level)} 랭크)`}
            >
              {effectSummary(enchant)}
            </Line>
          ))}

        {reforgeLines.length ? <Line title="세공">{reforgeLines.join(', ')}</Line> : null}

        {special ? (
          <Line title={`특별 개조 ${special.label}`}>{describeSpecialStep(special.step)}</Line>
        ) : null}

        {upgradeExtras.map((def, index) => (
          <Line key={`${def.name}-${index}`} title={def.name}>
            {[
              describeStats(def.stats.filter(([stat]) => NON_ADDITIVE_STATS.has(stat))),
              ...(def.options ?? []),
              def.lucky
                ? `결과가 확률로 정해짐(${def.lucky.options.map(([text]) => text).join(', ')})`
                : '',
            ]
              .filter(Boolean)
              .join(', ')}
          </Line>
        ))}
      </Flex>
    </Flex>
  );
}
