import { useMemo } from 'react';
import {
  Col,
  Collapse,
  Descriptions,
  Flex,
  Form,
  Row,
  Select,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import { formatNumber } from '@/lib/format';
import { selectedUpgrades, upgradeCost, upgradesForSlot } from '@/features/equipment/simulate';
import { NON_ADDITIVE_STATS, describeStats } from '@/features/equipment/stats';
import type { EquipmentRecord, UpgradeDef } from '@/features/equipment/types';

const { Text } = Typography;

interface UpgradePanelProps {
  item: EquipmentRecord;
  upgrades: Record<string, UpgradeDef>;
  slots: (number | null)[];
  gemSlots: (number | null)[];
  onChange: (slots: (number | null)[], gemSlots: (number | null)[]) => void;
}

/** 칸 번호 표기. 데이터의 "이미 한 횟수" 가 아니라 게임처럼 1 부터 센다. */
function slotText(def: UpgradeDef): string {
  if (def.min === def.max) return `${def.min + 1}`;
  return `${def.min + 1}~${def.max + 1}`;
}

/** 능력치 표에 더하지 않는 칸. 체인 캐스팅은 최소/최대 칸에 스킬 번호가 들어 있다. */
const extraStats = (def: UpgradeDef) => def.stats.filter(([stat]) => NON_ADDITIVE_STATS.has(stat));

const hasExtras = (def: UpgradeDef) =>
  Boolean(def.options?.length || def.lucky || extraStats(def).length);

/** 능력치 말고 글로만 적힌 효과. 장인 개조의 확률도 여기서 보여 준다. */
function ExtraEffects({ def, withStats = false }: { def: UpgradeDef; withStats?: boolean }) {
  if (!hasExtras(def)) return null;
  const stats = withStats ? extraStats(def) : [];
  return (
    <Flex vertical gap={2}>
      {stats.length ? <Text style={{ fontSize: 12 }}>{describeStats(stats)}</Text> : null}
      {def.options?.map((text) => (
        <Text key={text} style={{ fontSize: 12 }}>
          {text}
        </Text>
      ))}
      {def.lucky ? (
        <>
          <Text type="secondary" style={{ fontSize: 12 }}>
            붙는 옵션 수:{' '}
            {def.lucky.counts.map(([count, percent]) => `${count}개 ${percent}%`).join(', ')}
          </Text>
          {def.lucky.options.map(([text, percent]) => (
            <Text key={text} type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {text} ({percent}%)
            </Text>
          ))}
        </>
      ) : null}
    </Flex>
  );
}

function effectSummary(def: UpgradeDef): string {
  const stats = describeStats(def.stats);
  if (stats) return stats;
  if (def.lucky) return '결과가 확률로 정해짐';
  return def.options?.join(', ') ?? '';
}

interface UpgradeRow {
  id: number;
  def: UpgradeDef;
}

/**
 * 개조. 칸마다 할 수 있는 개조가 정해져 있어 칸별 선택으로 둔다.
 * 표로 가로 칸을 늘어놓으면 휴대폰에서 옆으로 한참 밀어야 해서 고르는 칸과 목록을 나눴다.
 */
export function UpgradePanel({ item, upgrades, slots, gemSlots, onChange }: UpgradePanelProps) {
  const chosen = selectedUpgrades({ slots, gemSlots }, upgrades);
  const cost = upgradeCost(chosen);

  const rows = useMemo<UpgradeRow[]>(
    () =>
      [...new Set(item.upgrade?.ids ?? [])]
        .filter((id) => upgrades[id])
        .map((id) => ({ id, def: upgrades[id] }))
        .sort(
          (a, b) =>
            Number(Boolean(a.def.gems)) - Number(Boolean(b.def.gems)) || a.def.min - b.def.min,
        ),
    [item.upgrade?.ids, upgrades],
  );

  const columns: TableColumnsType<UpgradeRow> = [
    {
      title: '개조',
      key: 'name',
      render: (_, { def }) => (
        <Flex vertical gap={2}>
          <span>
            {def.name}
            {def.personal ? (
              <Tag style={{ marginInlineStart: 6 }} bordered={false}>
                전용
              </Tag>
            ) : null}
          </span>
          {def.desc ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {def.desc}
            </Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: '칸',
      key: 'slot',
      align: 'right',
      className: 'tnum',
      render: (_, { def }) => (def.gems?.length ? `보석 ${slotText(def)}` : slotText(def)),
    },
    {
      title: '효과',
      key: 'effect',
      render: (_, { def }) => (
        <Flex vertical gap={2}>
          {def.stats.length ? <span>{describeStats(def.stats)}</span> : null}
          <ExtraEffects def={def} />
        </Flex>
      ),
    },
    {
      title: '비용',
      key: 'cost',
      align: 'right',
      className: 'tnum',
      render: (_, { def }) => (
        <Flex vertical gap={2}>
          <span>숙련 {formatNumber(def.ep)}</span>
          {def.gold ? <span>{formatNumber(def.gold)} G</span> : null}
          {def.gems?.map(([name, size]) => (
            <Text key={name} type="secondary" style={{ fontSize: 12 }}>
              {name} {size}cm 이상
            </Text>
          ))}
        </Flex>
      ),
    },
  ];

  const slotSelect = (slot: number, gem: boolean) => {
    const current = gem ? gemSlots : slots;
    const candidates = upgradesForSlot(item, upgrades, slot, gem);
    const id = `upgrade-${gem ? 'gem' : 'normal'}-${slot}`;
    const set = (value: number | undefined) => {
      const next = [...current];
      next[slot] = value ?? null;
      if (gem) onChange(slots, next);
      else onChange(next, gemSlots);
    };

    return (
      <Col key={id} xs={24} md={12}>
        <Form.Item
          label={gem ? `보석 개조 ${slot + 1}` : `${slot + 1}번째 개조`}
          htmlFor={id}
          style={{ marginBottom: 0 }}
        >
          <Select<number>
            id={id}
            allowClear
            value={current[slot] ?? undefined}
            onChange={set}
            placeholder={candidates.length ? '하지 않음' : '이 칸에 할 수 있는 개조가 없습니다'}
            disabled={candidates.length === 0}
            options={candidates.map(([upgradeId, def]) => ({
              value: upgradeId,
              label: def.name,
              effect: effectSummary(def),
            }))}
            optionRender={(option) => (
              <Flex vertical>
                <span>{option.data.label}</span>
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'normal' }}>
                  {option.data.effect}
                </Text>
              </Flex>
            )}
          />
        </Form.Item>
      </Col>
    );
  };

  const withExtras = chosen.filter(hasExtras);

  return (
    <Flex vertical gap={16}>
      <Form layout="vertical">
        {/* 칸이 많아 두 단으로 나눈다. 768px 미만에서는 한 단으로 떨어진다. */}
        <Row gutter={[16, 12]}>
          {slots.map((_, slot) => slotSelect(slot, false))}
          {gemSlots.map((_, slot) => slotSelect(slot, true))}
        </Row>
      </Form>

      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        items={[
          {
            key: 'ep',
            label: '필요 숙련 합계',
            children: <span className="tnum">{formatNumber(cost.ep)}</span>,
          },
          {
            key: 'gold',
            label: '수수료 합계',
            children: <span className="tnum">{formatNumber(cost.gold)} G</span>,
          },
        ]}
      />

      {withExtras.length > 0 ? (
        <Flex vertical gap={8}>
          <Text strong style={{ fontSize: 13 }}>
            표에 더하지 않은 효과
          </Text>
          {withExtras.map((def, index) => (
            <Flex key={`${def.name}-${index}`} vertical gap={2}>
              <Text style={{ fontSize: 13 }}>{def.name}</Text>
              <ExtraEffects def={def} withStats />
            </Flex>
          ))}
        </Flex>
      ) : null}

      <Collapse
        size="small"
        items={[
          {
            key: 'all',
            label: `이 장비의 개조 전체 (${rows.length}개)`,
            children: (
              <Table<UpgradeRow>
                size="small"
                rowKey="id"
                columns={columns}
                dataSource={rows}
                pagination={false}
                scroll={{ x: 'max-content' }}
              />
            ),
          },
        ]}
      />
    </Flex>
  );
}
