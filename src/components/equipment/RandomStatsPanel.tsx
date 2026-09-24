import { Button, Flex, InputNumber, Slider, Typography } from 'antd';
import type { StatRange } from '@/features/equipment/types';
import { formatStatRange, statLabel } from '@/features/equipment/stats';

const { Text } = Typography;

interface RandomStatsPanelProps {
  ranges: StatRange[];
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
}

/**
 * 랜덤 능력치. 제작하거나 얻을 때 폭 안에서 정해지는 값이라 하나씩 골라 본다.
 * 슬라이더와 숫자칸을 같이 둔다. 끌어서 훑기도, 게임에서 본 값을 그대로 치기도 한다.
 */
export function RandomStatsPanel({ ranges, values, onChange }: RandomStatsPanelProps) {
  const setAll = (pick: 'min' | 'max') =>
    onChange(
      Object.fromEntries(ranges.map(([stat, min, max]) => [stat, pick === 'min' ? min : max])),
    );

  return (
    <Flex vertical gap={12}>
      <Flex gap={8} wrap>
        <Button size="small" onClick={() => setAll('min')}>
          모두 최소
        </Button>
        <Button size="small" onClick={() => setAll('max')}>
          모두 최대
        </Button>
      </Flex>

      {ranges.map(([stat, min, max]) => {
        const value = values[stat] ?? min;
        const set = (next: number | null) => {
          if (next === null || !Number.isFinite(next)) return;
          onChange({ ...values, [stat]: Math.min(Math.max(Math.round(next), min), max) });
        };
        const id = `random-${stat}`;

        return (
          <div key={stat}>
            <Flex justify="space-between" align="baseline" gap={8}>
              <label htmlFor={id}>{statLabel(stat)}</label>
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {formatStatRange(stat, min, max, true)}
              </Text>
            </Flex>
            <Flex align="center" gap={12}>
              <Slider
                min={min}
                max={max}
                value={value}
                onChange={set}
                disabled={min === max}
                style={{ flex: 1, minWidth: 0 }}
                aria-label={`${statLabel(stat)} 랜덤 값`}
              />
              <InputNumber
                id={id}
                min={min}
                max={max}
                value={value}
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
