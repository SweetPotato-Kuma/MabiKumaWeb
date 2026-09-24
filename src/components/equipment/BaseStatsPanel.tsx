import {
  Button,
  Col,
  Descriptions,
  Flex,
  InputNumber,
  Row,
  Slider,
  Tooltip,
  Typography,
} from 'antd';
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
  /** 유동 능력치마다 고른 몫(기본값에 더해지는 값) */
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
}

interface VariableLine {
  stat: string;
  base: number;
  min: number;
  max: number;
}

/** 유동 능력치 한 줄: 이름, 슬라이더, 지금 값, 나올 수 있는 범위. 구성은 범위에 마우스를 올리면 보인다. */
function VariableStat({
  line,
  bonus,
  onChange,
}: {
  line: VariableLine;
  bonus: number;
  onChange: (bonus: number) => void;
}) {
  const { stat, base, min, max } = line;
  const low = base + min;
  const high = base + max;
  const id = `base-${stat}`;
  const fixed = min === max;
  const breakdown = `기본 ${formatStatValue(stat, base)} + 유동 ${formatStatValue(stat, bonus)} (유동 폭 ${formatStatRange(stat, min, max)})`;

  const set = (total: number | null) => {
    if (total === null || !Number.isFinite(total)) return;
    onChange(Math.min(Math.max(Math.round(total - base), min), max));
  };

  return (
    <Flex align="center" gap={10} style={{ minHeight: 32 }}>
      <label htmlFor={id} style={{ flex: '0 0 84px' }}>
        {statLabel(stat)}
      </label>
      <Slider
        min={low}
        max={high}
        value={base + bonus}
        onChange={set}
        disabled={fixed}
        tooltip={{
          formatter: (value) => (value === undefined ? '' : formatStatValue(stat, value)),
        }}
        style={{ flex: '1 1 80px', minWidth: 60, marginBlock: 0 }}
        aria-label={`${statLabel(stat)} 값`}
      />
      <InputNumber
        id={id}
        size="small"
        min={low}
        max={high}
        value={base + bonus}
        onChange={set}
        disabled={fixed}
        className="tnum"
        style={{ width: 64 }}
      />
      <Tooltip title={breakdown}>
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {formatStatValue(stat, low)}~{formatStatValue(stat, high)}
        </Text>
      </Tooltip>
    </Flex>
  );
}

/**
 * 기본 성능. 기본 능력치와 유동 능력치를 합친 실제 장비 스펙을 보여 준다.
 *
 * 유동 능력치는 한 줄에 하나다. 칸마다 값, 범위, 슬라이더, 구성을 여러 줄로 늘어놓았더니 무기 하나에
 * 스무 줄이 넘어 화면이 늘어졌다. 고르는 칸도 실제 값으로 움직이고, 오른쪽에 나올 수 있는 범위를 적는다.
 * 안에서는 기본값에 더해지는 몫만 들고 있다.
 *
 * 고정 능력치는 고를 것이 없으니 따로 떼어 짧은 표로 둔다.
 */
export function BaseStatsPanel({ item, values, onChange }: BaseStatsPanelProps) {
  const base = item.base ?? {};
  const variableLines: VariableLine[] = (item.random ?? [])
    .map(([stat, min, max]) => ({ stat, base: base[stat] ?? 0, min, max }))
    .sort((a, b) => compareStats(a.stat, b.stat));
  const variableStats = new Set(variableLines.map((line) => line.stat));
  const fixedStats = Object.keys(base)
    .filter((stat) => !variableStats.has(stat))
    .sort(compareStats);

  const setAll = (pick: 'min' | 'max') =>
    onChange(
      Object.fromEntries(
        variableLines.map(({ stat, min, max }) => [stat, pick === 'min' ? min : max]),
      ),
    );

  if (variableLines.length === 0 && fixedStats.length === 0) {
    return <Text type="secondary">이 장비에는 적힌 기본 능력치가 없습니다.</Text>;
  }

  return (
    <Flex vertical gap={12}>
      {variableLines.length > 0 ? (
        <Flex vertical gap={4}>
          <Flex justify="space-between" align="center" gap={8} wrap>
            <Tooltip title="제작하거나 얻을 때 범위 안에서 한 번 정해지는 값입니다.">
              <Text strong>유동 능력치</Text>
            </Tooltip>
            <Flex gap={6}>
              <Button size="small" onClick={() => setAll('min')}>
                모두 최소
              </Button>
              <Button size="small" onClick={() => setAll('max')}>
                모두 최대
              </Button>
            </Flex>
          </Flex>

          {/* 한 줄짜리를 두 단으로. 768px 미만에서는 한 단으로 떨어진다. */}
          <Row gutter={[24, 0]}>
            {variableLines.map((line) => (
              <Col key={line.stat} xs={24} md={12}>
                <VariableStat
                  line={line}
                  bonus={values[line.stat] ?? line.min}
                  onChange={(bonus) => onChange({ ...values, [line.stat]: bonus })}
                />
              </Col>
            ))}
          </Row>
        </Flex>
      ) : null}

      {fixedStats.length > 0 ? (
        <Descriptions
          title={<Text strong>고정 능력치</Text>}
          size="small"
          column={{ xs: 2, sm: 3 }}
          items={fixedStats.map((stat) => ({
            key: stat,
            label: statLabel(stat),
            children: (
              <Text strong className="tnum">
                {formatStatValue(stat, base[stat])}
              </Text>
            ),
          }))}
        />
      ) : null}
    </Flex>
  );
}
