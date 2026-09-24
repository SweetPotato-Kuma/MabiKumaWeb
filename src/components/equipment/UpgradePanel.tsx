import { Descriptions, Flex, Radio, Tag, Typography, theme } from 'antd';
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

/** 표에 더하지 않는 효과. 체인 캐스팅은 최소/최대 칸에 스킬 번호가 들어 있다. */
const extraStats = (def: UpgradeDef) => def.stats.filter(([stat]) => NON_ADDITIVE_STATS.has(stat));

/** "네리스, 레이널드, 멜레스" 에 이름 모르는 NPC 수를 덧붙인다. */
function npcText(def: UpgradeDef): string {
  const names = def.npcs ?? [];
  const unknown = def.npcUnknown ?? 0;
  if (names.length === 0 && unknown === 0) return '';
  const extra = unknown ? `${names.length ? ' 외 ' : ''}${unknown}명(이름 미확인)` : '';
  return `${names.join(', ')}${extra}`;
}

/** 개조 하나의 설명. 효과, 비용, 보석, 해 주는 NPC. */
function UpgradeOption({ def }: { def: UpgradeDef }) {
  const stats = def.stats.filter(([stat]) => !NON_ADDITIVE_STATS.has(stat));
  const extras = extraStats(def);
  const npcs = npcText(def);

  return (
    <Flex vertical gap={2} style={{ minWidth: 0 }}>
      <span>
        <Text strong>{def.name}</Text>
        {def.personal ? (
          <Tag bordered={false} style={{ marginInlineStart: 6 }}>
            전용
          </Tag>
        ) : null}
      </span>
      {stats.length ? <span>{describeStats(stats)}</span> : null}
      {extras.length ? <span>{describeStats(extras)}</span> : null}
      {def.options?.map((text) => (
        <span key={text}>{text}</span>
      ))}
      {def.lucky ? (
        <Flex vertical gap={0}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            결과가 확률로 정해집니다. 붙는 옵션 수{' '}
            {def.lucky.counts.map(([count, percent]) => `${count}개 ${percent}%`).join(', ')}
          </Text>
          {def.lucky.options.map(([text, percent]) => (
            <Text key={text} type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {text} ({percent}%)
            </Text>
          ))}
        </Flex>
      ) : null}
      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
        숙련 {formatNumber(def.ep)}
        {def.gold ? `, ${formatNumber(def.gold)} G` : ''}
        {def.gems?.length
          ? `, 보석 ${def.gems.map(([name, size]) => `${name} ${size}cm 이상`).join(' 또는 ')}`
          : ''}
      </Text>
      {npcs ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          NPC {npcs}
        </Text>
      ) : null}
    </Flex>
  );
}

/**
 * 개조. 칸마다 할 수 있는 개조를 전부 펼쳐 두고 그 자리에서 고른다.
 *
 * 전에는 칸마다 드롭다운을 두고 전체 목록을 따로 접어 두었는데, 무엇이 있는지 보려면 펼쳐서 옆으로
 * 밀어야 했다. 칸별 목록 하나로 합치면 "몇 번째에 무엇을 할 수 있나" 와 "무엇을 골랐나" 가 한곳에 있다.
 */
export function UpgradePanel({ item, upgrades, slots, gemSlots, onChange }: UpgradePanelProps) {
  const { token } = theme.useToken();
  const cost = upgradeCost(selectedUpgrades({ slots, gemSlots }, upgrades));

  const slotGroup = (slot: number, gem: boolean) => {
    const current = gem ? gemSlots : slots;
    const candidates = upgradesForSlot(item, upgrades, slot, gem);
    const titleId = `upgrade-slot-${gem ? 'gem' : 'normal'}-${slot}`;
    const set = (value: number) => {
      const next = [...current];
      next[slot] = value === 0 ? null : value;
      if (gem) onChange(slots, next);
      else onChange(next, gemSlots);
    };

    return (
      <Flex key={titleId} vertical gap={8}>
        <Text strong id={titleId}>
          {gem ? `보석 개조 ${slot + 1}` : `${slot + 1}번째 개조`}
        </Text>
        {candidates.length === 0 ? (
          <Text type="secondary">이 칸에 할 수 있는 개조가 없습니다.</Text>
        ) : (
          <Radio.Group
            aria-labelledby={titleId}
            value={current[slot] ?? 0}
            onChange={(event) => set(Number(event.target.value))}
            style={{ width: '100%' }}
          >
            <Flex vertical gap={6}>
              <Radio value={0}>하지 않음</Radio>
              {candidates.map(([id, def]) => {
                const chosen = current[slot] === id;
                return (
                  <Radio
                    key={id}
                    value={id}
                    style={{
                      alignItems: 'flex-start',
                      padding: '8px 10px',
                      marginInlineEnd: 0,
                      borderRadius: token.borderRadius,
                      border: `1px solid ${chosen ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
                      background: chosen ? token.colorPrimaryBg : undefined,
                    }}
                  >
                    <UpgradeOption def={def} />
                  </Radio>
                );
              })}
            </Flex>
          </Radio.Group>
        )}
      </Flex>
    );
  };

  return (
    <Flex vertical gap={20}>
      {slots.map((_, slot) => slotGroup(slot, false))}
      {gemSlots.map((_, slot) => slotGroup(slot, true))}

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
    </Flex>
  );
}
