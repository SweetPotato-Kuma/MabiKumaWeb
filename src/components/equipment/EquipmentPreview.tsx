import type { ReactNode } from 'react';
import { Flex, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { ItemIcon } from '@/components/ItemIcon';
import { EnchantEffects } from '@/components/equipment/EnchantPanel';
import { enchantRank } from '@/features/equipment/enchant';
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Flex vertical gap={4}>
      <Text strong style={{ fontSize: 13 }}>
        {title}
      </Text>
      {children}
    </Flex>
  );
}

/**
 * 장비 미리보기. 고른 것을 모두 합친 장비 한 벌을 게임 툴팁처럼 한 카드에 모은다.
 *
 * 능력치는 두 칸으로 둔다. 구성(기본, 유동, 개조, 인챈트, 특별 개조)을 칸마다 늘어놓으면
 * 휴대폰에서 옆으로 밀어야 한다. 합계 옆에 구성을 작은 글씨로 접어 넣으면 줄이 늘 뿐 옆으로는 늘지 않는다.
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
      render: (_, row) => {
        const parts = breakdown(row);
        return (
          <Flex vertical gap={0}>
            <span>{statLabel(row.stat)}</span>
            {parts ? (
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
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
      className: 'tnum',
      render: (_, row) => <Text strong>{formatStatRange(row.stat, ...row.total)}</Text>,
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex gap={12} align="flex-start">
        <ItemIcon card={card} size={64} />
        <Flex vertical gap={6} style={{ minWidth: 0 }}>
          <Title level={5} style={{ margin: 0 }}>
            {fullName}
          </Title>
          <Flex gap={6} wrap>
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
                보석 개조 {upgradeCount.gemDone}/{upgradeCount.gemMax}
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
        columns={columns}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: '이 장비에는 적힌 능력치가 없습니다.' }}
      />

      {prefix || suffix ? (
        <Section title="인챈트">
          {[prefix, suffix]
            .filter((enchant): enchant is EnchantDef => Boolean(enchant))
            .map((enchant) => (
              <Flex key={enchant.id} vertical gap={2}>
                <Text className="tnum">
                  {enchant.slot === 0 ? '접두' : '접미'} {enchant.name} (
                  {enchantRank(enchant.level)} 랭크)
                </Text>
                <div style={{ paddingInlineStart: 12 }}>
                  <EnchantEffects enchant={enchant} />
                </div>
              </Flex>
            ))}
        </Section>
      ) : null}

      {reforgeLines.length ? (
        <Section title="세공">
          {reforgeLines.map((line, index) => (
            <Text key={`${line}-${index}`} className="tnum">
              {line}
            </Text>
          ))}
        </Section>
      ) : null}

      {special ? (
        <Section title="특별 개조">
          <Text className="tnum">
            {special.label}: {describeSpecialStep(special.step)}
          </Text>
        </Section>
      ) : null}

      {upgradeExtras.length ? (
        <Section title="표에 더하지 않은 개조 효과">
          {upgradeExtras.map((def, index) => (
            <Flex key={`${def.name}-${index}`} vertical gap={0}>
              <Text>{def.name}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {[
                  describeStats(def.stats.filter(([stat]) => NON_ADDITIVE_STATS.has(stat))),
                  ...(def.options ?? []),
                  def.lucky
                    ? `결과가 확률로 정해짐: ${def.lucky.options.map(([text]) => text).join(', ')}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
            </Flex>
          ))}
        </Section>
      ) : null}
    </Flex>
  );
}
