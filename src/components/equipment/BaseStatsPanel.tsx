import { Button, Flex, InputNumber, Slider, Typography } from 'antd';
import {
  compareStats,
  formatStatRange,
  formatStatValue,
  statLabel,
} from '@/features/equipment/stats';
import type { EquipmentRecord } from '@/features/equipment/types';

const { Text } = Typography;

interface BaseStatsPanelProps {
  item: EquipmentRecord;
  /** 랜덤 능력치마다 고른 몫(기본값에 더해지는 값) */
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
}

interface Line {
  stat: string;
  base: number;
  /** 랜덤 폭. 없으면 고정 값 */
  random?: [number, number];
}

/**
 * 기본 성능. 기본 능력치와 랜덤 능력치를 합친 실제 장비 스펙을 보여 준다.
 *
 * 랜덤 능력치를 "+0~10" 으로만 적으면 결국 몇이 되는지 머릿속으로 더해야 한다. 그래서 폭을
 * 기본값에 얹은 값(139~149)으로 적고, 고르는 칸도 그 값으로 움직인다. 안에서는 더해지는 몫만 들고 있다.
 */
export function BaseStatsPanel({ item, values, onChange }: BaseStatsPanelProps) {
  const base = item.base ?? {};
  const random = new Map(
    (item.random ?? []).map(([stat, min, max]) => [stat, [min, max] as [number, number]]),
  );
  const lines: Line[] = [...new Set([...Object.keys(base), ...random.keys()])]
    .sort(compareStats)
    .map((stat) => ({ stat, base: base[stat] ?? 0, random: random.get(stat) }));

  const setAll = (pick: 'min' | 'max') =>
    onChange(
      Object.fromEntries(
        (item.random ?? []).map(([stat, min, max]) => [stat, pick === 'min' ? min : max]),
      ),
    );

  if (lines.length === 0) {
    return <Text type="secondary">이 장비에는 적힌 기본 능력치가 없습니다.</Text>;
  }

  return (
    <Flex vertical gap={12}>
      {random.size > 0 ? (
        <Flex gap={8} wrap align="center">
          <Text type="secondary" style={{ fontSize: 12 }}>
            랜덤 능력치는 제작하거나 얻을 때 폭 안에서 정해집니다.
          </Text>
          <Button size="small" onClick={() => setAll('min')}>
            모두 최소
          </Button>
          <Button size="small" onClick={() => setAll('max')}>
            모두 최대
          </Button>
        </Flex>
      ) : null}

      {lines.map(({ stat, base: baseValue, random: range }) => {
        if (!range) {
          return (
            <Flex key={stat} justify="space-between" gap={8}>
              <span>{statLabel(stat)}</span>
              <Text strong className="tnum">
                {formatStatValue(stat, baseValue)}
              </Text>
            </Flex>
          );
        }

        const [min, max] = range;
        const bonus = values[stat] ?? min;
        const set = (total: number | null) => {
          if (total === null || !Number.isFinite(total)) return;
          const next = Math.min(Math.max(Math.round(total - baseValue), min), max);
          onChange({ ...values, [stat]: next });
        };
        const id = `base-${stat}`;

        return (
          <div key={stat}>
            <Flex justify="space-between" align="baseline" gap={8} wrap>
              <label htmlFor={id}>{statLabel(stat)}</label>
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {formatStatRange(stat, baseValue + min, baseValue + max)} (기본{' '}
                {formatStatValue(stat, baseValue)}, 랜덤 {formatStatRange(stat, min, max, true)})
              </Text>
            </Flex>
            <Flex align="center" gap={12}>
              <Slider
                min={baseValue + min}
                max={baseValue + max}
                value={baseValue + bonus}
                onChange={set}
                disabled={min === max}
                style={{ flex: 1, minWidth: 0 }}
                aria-label={`${statLabel(stat)} 값`}
              />
              <InputNumber
                id={id}
                min={baseValue + min}
                max={baseValue + max}
                value={baseValue + bonus}
                onChange={set}
                disabled={min === max}
                className="tnum"
                style={{ width: 88 }}
              />
            </Flex>
          </div>
        );
      })}
    </Flex>
  );
}
