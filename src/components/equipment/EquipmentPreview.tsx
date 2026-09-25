import type { ReactNode } from 'react';
import { Flex, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { ItemIcon } from '@/components/ItemIcon';
import { enchantRank, stripBrackets } from '@/features/equipment/enchant';
import type { ErgSummary } from '@/features/equipment/erg';
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
  reforge: ReforgeLine[];
  special: { label: string; step: SpecialStep | undefined } | null;
  erg: ErgSummary | null;
}

/** 세공 한 줄. 게임 툴팁처럼 "옵션 (레벨/최대)" 아래에 효과를 적는다. */
export interface ReforgeLine {
  name: string;
  level: number;
  max: number;
  effect: string;
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
  if (row.erg) parts.push(`에르그 ${formatStatValue(row.stat, row.erg, true)}`);
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
 * 게임 툴팁의 한 덩어리. 제목 아래에 효과를 한 줄에 하나씩 들여 적는다. 쉼표로 이어 붙이면 어디서
 * 끊어 읽어야 할지 알 수 없었다.
 */
function Block({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <Flex vertical gap={2}>
      <Text strong>{title}</Text>
      <Flex vertical gap={2} style={{ paddingInlineStart: 12 }}>
        {children}
      </Flex>
    </Flex>
  );
}

/** 인챈트 설명 한 줄. 대괄호로 싸인 부가 규칙(수리비 증가, 능력치 감소)은 게임처럼 붉게 적는다. */
function EnchantLine({ line }: { line: string }) {
  if (!/^\[.*\]$/.test(line)) return <Text className="tnum">{line}</Text>;
  const text = stripBrackets(line);
  // 전용 여부는 이름 옆 표시로 이미 보인다. 붉게 적을 일은 아니다.
  return (
    <Text className="tnum" type={text.includes('전용') ? 'secondary' : 'danger'}>
      {text}
    </Text>
  );
}

/**
 * 장비 미리보기. 고른 것을 모두 합친 장비 한 벌을 게임 툴팁처럼 한 카드에 모은다.
 *
 * 능력치는 한 줄에 하나다. 구성(기본, 유동, 개조, 인챈트, 특별 개조, 에르그)은 이름 옆에 작은 글씨로
 * 붙이고, 길면 말줄임한 뒤 마우스를 올리면 전체가 보인다. 인챈트, 세공, 에르그는 게임 툴팁처럼 제목
 * 아래에 효과를 한 줄에 하나씩 적는다. 카드가 길어지므로 넓은 화면에서는 미리보기 안에서 스크롤한다.
 */
export function EquipmentPreview({
  name,
  card,
  rows,
  enchants,
  upgrades,
  upgradeCount,
  reforge,
  special,
  erg,
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
            <Block
              key={enchant.id}
              title={`[${enchant.slot === 0 ? '접두' : '접미'}] ${enchant.name} (${enchantRank(enchant.level)} 랭크)`}
            >
              {enchant.desc
                // "양손 무기에 인챈트 가능" 은 적용 조건이라 뺀다. 이미 바른 장비라 볼 일이 없다.
                .filter((line) => line && !/인챈트 가능$/.test(line))
                .map((line, index) => (
                  <EnchantLine key={index} line={line} />
                ))}
            </Block>
          ))}

        {special ? (
          <Block title={`특별 개조 ${special.label}`}>
            <Text className="tnum">{describeSpecialStep(special.step)}</Text>
          </Block>
        ) : null}

        {reforge.length ? (
          <Block title="세공">
            {reforge.map((line) => (
              <Flex key={line.name} vertical gap={0}>
                <Text className="tnum">
                  {line.name} ({line.level}/{line.max} 레벨)
                </Text>
                <Text type="secondary" className="tnum" style={{ paddingInlineStart: 12 }}>
                  {line.effect}
                </Text>
              </Flex>
            ))}
          </Block>
        ) : null}

        {erg ? (
          <Block title={`에르그 ${erg.label}`}>
            {erg.base.map((effect, index) => (
              <Text key={`b${index}`} className="tnum">
                {index === 0 ? '기본 효과' : '추가 효과'}: {effect.text}
              </Text>
            ))}
            {erg.dark.map((effect, index) => (
              <Text key={`d${index}`} className="tnum">
                어둠의 에르그: {effect.text}
              </Text>
            ))}
          </Block>
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
