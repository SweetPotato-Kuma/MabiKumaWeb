import { Descriptions, Flex, Select, Typography } from 'antd';
import { formatNumber } from '@/lib/format';
import { selectedUpgrades, upgradeCost, upgradesForSlot } from '@/features/equipment/simulate';
import { describeStats } from '@/features/equipment/stats';
import type { EquipmentRecord, UpgradeDef } from '@/features/equipment/types';

const { Text } = Typography;

interface UpgradePanelProps {
  item: EquipmentRecord;
  upgrades: Record<string, UpgradeDef>;
  slots: (number | null)[];
  gemSlots: (number | null)[];
  onChange: (slots: (number | null)[], gemSlots: (number | null)[]) => void;
}

/** "네리스, 레이널드, 멜레스" 에 이름 모르는 NPC 수를 덧붙인다. */
function npcText(def: UpgradeDef): string {
  const names = def.npcs ?? [];
  const unknown = def.npcUnknown ?? 0;
  if (names.length === 0 && unknown === 0) return '';
  const extra = unknown ? `${names.length ? ' 외 ' : ''}${unknown}명(이름 미확인)` : '';
  return `${names.join(', ')}${extra}`;
}

/** 효과 한 줄. 능력치가 없는 개조(장인 개조, 글로만 적힌 효과)도 무엇인지 알 수 있게 한다. */
function effectText(def: UpgradeDef): string {
  const parts: string[] = [];
  const stats = describeStats(def.stats);
  if (stats) parts.push(stats);
  if (def.options?.length) parts.push(...def.options);
  if (def.lucky) {
    const counts = def.lucky.counts.map(([count]) => count);
    parts.push(`결과가 확률로 정해짐(옵션 ${Math.min(...counts)}~${Math.max(...counts)}개)`);
  }
  return parts.join(', ');
}

/** 비용 한 줄. "숙련 100, 150,000 G, 루비 5cm 이상" */
function costText(def: UpgradeDef): string {
  const parts = [`숙련 ${formatNumber(def.ep)}`];
  if (def.gold) parts.push(`${formatNumber(def.gold)} G`);
  if (def.gems?.length) {
    parts.push(def.gems.map(([name, size]) => `${name} ${size}cm 이상`).join(' 또는 '));
  }
  return parts.join(', ');
}

/**
 * 개조. 칸 하나가 한 줄이다: 칸 이름, 고르는 칸, 고른 개조의 효과와 비용.
 *
 * 칸마다 할 수 있는 개조를 전부 펼쳐 두었더니 무기 하나에 수십 줄이 되어 무엇을 골랐는지 오히려
 * 안 보였다. 고른 것만 한 줄로 두고, 무엇이 있는지는 고르는 칸을 열면 효과, 비용, NPC 까지 보인다.
 * 한 장비의 개조는 대개 같은 NPC 가 해 주므로, 모두 같으면 NPC 는 맨 아래에 한 번만 적는다.
 */
export function UpgradePanel({ item, upgrades, slots, gemSlots, onChange }: UpgradePanelProps) {
  const cost = upgradeCost(selectedUpgrades({ slots, gemSlots }, upgrades));

  const all = [...new Set(item.upgrade?.ids ?? [])]
    .map((id) => upgrades[id])
    .filter((def): def is UpgradeDef => Boolean(def));
  const npcTexts = new Set(all.map(npcText));
  const commonNpc = npcTexts.size === 1 ? [...npcTexts][0] : null;

  const slotRow = (slot: number, gem: boolean) => {
    const current = gem ? gemSlots : slots;
    const candidates = upgradesForSlot(item, upgrades, slot, gem);
    const id = `upgrade-${gem ? 'gem' : 'normal'}-${slot}`;
    const chosen = current[slot] === null ? undefined : upgrades[current[slot] as number];
    const set = (value: number | undefined) => {
      const next = [...current];
      next[slot] = value ?? null;
      if (gem) onChange(slots, next);
      else onChange(next, gemSlots);
    };
    const summary = chosen ? `${effectText(chosen)} (${costText(chosen)})` : '';

    return (
      // 한 줄. 좁은 화면에서는 효과가 고르는 칸 아래로 떨어진다.
      <Flex key={id} align="center" gap={12} wrap style={{ minHeight: 32 }}>
        <label htmlFor={id} style={{ flex: '0 0 84px' }}>
          <Text strong>{gem ? `보석 ${slot + 1}` : `${slot + 1}번째`}</Text>
        </label>
        <Select<number>
          id={id}
          allowClear
          value={current[slot] ?? undefined}
          onChange={set}
          placeholder={candidates.length ? '하지 않음' : '할 수 있는 개조 없음'}
          disabled={candidates.length === 0}
          popupMatchSelectWidth={false}
          style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 280 }}
          options={candidates.map(([upgradeId, def]) => ({
            value: upgradeId,
            label: def.personal ? `${def.name} (전용)` : def.name,
            def,
          }))}
          optionRender={(option) => {
            const def: UpgradeDef = option.data.def;
            const npcs = commonNpc === null ? npcText(def) : '';
            return (
              <Flex vertical style={{ maxWidth: 420, whiteSpace: 'normal' }}>
                <span>{option.data.label}</span>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {effectText(def)}
                </Text>
                {def.lucky ? (
                  <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                    {def.lucky.options.map(([text, percent]) => `${text} ${percent}%`).join(', ')}
                  </Text>
                ) : null}
                <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                  {costText(def)}
                  {npcs ? `, NPC ${npcs}` : ''}
                </Text>
              </Flex>
            );
          }}
        />
        <Text
          className="tnum"
          ellipsis={{ tooltip: summary }}
          style={{ flex: '2 1 240px', minWidth: 0 }}
          type={chosen ? undefined : 'secondary'}
        >
          {chosen
            ? summary
            : candidates.length
              ? `${candidates.length}가지 중에서 고를 수 있습니다`
              : '이 칸에 할 수 있는 개조가 없습니다'}
        </Text>
      </Flex>
    );
  };

  return (
    <Flex vertical gap={10}>
      {slots.map((_, slot) => slotRow(slot, false))}
      {gemSlots.map((_, slot) => slotRow(slot, true))}

      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{ marginTop: 6 }}
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
          ...(commonNpc
            ? [{ key: 'npc', label: '개조 NPC', children: commonNpc, span: 'filled' as const }]
            : []),
        ]}
      />
    </Flex>
  );
}
