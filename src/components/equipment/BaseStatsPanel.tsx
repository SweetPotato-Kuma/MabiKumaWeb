import { Button, Col, Descriptions, Flex, InputNumber, Row, Slider, Typography, theme } from 'antd';
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

interface RandomLine {
  stat: string;
  base: number;
  min: number;
  max: number;
}

function RandomStat({
  line,
  bonus,
  onChange,
}: {
  line: RandomLine;
  bonus: number;
  onChange: (bonus: number) => void;
}) {
  const { token } = theme.useToken();
  const { stat, base, min, max } = line;
  const low = base + min;
  const high = base + max;
  const id = `base-${stat}`;
  const fixed = min === max;

  const set = (total: number | null) => {
    if (total === null || !Number.isFinite(total)) return;
    onChange(Math.min(Math.max(Math.round(total - base), min), max));
  };

  return (
    <Flex
      vertical
      gap={4}
      style={{
        height: '100%',
        padding: '10px 12px',
        borderRadius: token.borderRadius,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {/* 이름과 지금 값을 한 줄에. 값을 가장 먼저 읽게 굵고 크게 둔다. */}
      <Flex justify="space-between" align="baseline" gap={8}>
        <label htmlFor={id}>{statLabel(stat)}</label>
        <Text strong className="tnum" style={{ fontSize: token.fontSizeHeading4 }}>
          {formatStatValue(stat, base + bonus)}
        </Text>
      </Flex>

      <Flex align="center" gap={12}>
        {/* 양 끝에 최솟값과 최댓값을 붙여, 지금 값이 폭의 어디쯤인지 보이게 한다. */}
        <Slider
          min={low}
          max={high}
          value={base + bonus}
          onChange={set}
          disabled={fixed}
          marks={{ [low]: formatStatValue(stat, low), [high]: formatStatValue(stat, high) }}
          tooltip={{
            formatter: (value) => (value === undefined ? '' : formatStatValue(stat, value)),
          }}
          style={{ flex: 1, minWidth: 0, marginBlockEnd: 20 }}
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
          style={{ width: 72 }}
        />
      </Flex>

      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
        기본 {formatStatValue(stat, base)} + 랜덤 {formatStatValue(stat, bonus)} (폭{' '}
        {formatStatRange(stat, min, max)})
      </Text>
    </Flex>
  );
}

/**
 * 기본 성능. 기본 능력치와 랜덤 능력치를 합친 실제 장비 스펙을 보여 준다.
 *
 * 랜덤 능력치를 "+0~10" 으로만 적으면 결국 몇이 되는지 머릿속으로 더해야 한다. 그래서 칸마다
 * 지금 값을 크게, 폭의 양 끝을 슬라이더에, 구성(기본 + 랜덤)을 아래에 둔다. 고르는 칸도 실제 값으로
 * 움직인다. 안에서는 더해지는 몫만 들고 있다.
 *
 * 고정 능력치는 고를 것이 없으니 따로 떼어 짧은 표로 둔다. 섞어 두면 고를 칸이 묻힌다.
 */
export function BaseStatsPanel({ item, values, onChange }: BaseStatsPanelProps) {
  const base = item.base ?? {};
  const randomLines: RandomLine[] = (item.random ?? [])
    .map(([stat, min, max]) => ({ stat, base: base[stat] ?? 0, min, max }))
    .sort((a, b) => compareStats(a.stat, b.stat));
  const randomStats = new Set(randomLines.map((line) => line.stat));
  const fixedStats = Object.keys(base)
    .filter((stat) => !randomStats.has(stat))
    .sort(compareStats);

  const setAll = (pick: 'min' | 'max') =>
    onChange(
      Object.fromEntries(
        randomLines.map(({ stat, min, max }) => [stat, pick === 'min' ? min : max]),
      ),
    );

  if (randomLines.length === 0 && fixedStats.length === 0) {
    return <Text type="secondary">이 장비에는 적힌 기본 능력치가 없습니다.</Text>;
  }

  return (
    <Flex vertical gap={16}>
      {randomLines.length > 0 ? (
        <Flex vertical gap={10}>
          <Flex justify="space-between" align="center" gap={8} wrap>
            <Flex vertical gap={0}>
              <Text strong>랜덤 능력치</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                제작하거나 얻을 때 폭 안에서 정해집니다.
              </Text>
            </Flex>
            <Flex gap={8}>
              <Button size="small" onClick={() => setAll('min')}>
                모두 최소
              </Button>
              <Button size="small" onClick={() => setAll('max')}>
                모두 최대
              </Button>
            </Flex>
          </Flex>

          {/* 두 칸씩 나란히. 768px 미만에서는 한 칸씩 떨어진다. */}
          <Row gutter={[12, 12]}>
            {randomLines.map((line) => (
              <Col key={line.stat} xs={24} md={12}>
                <RandomStat
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
          bordered
          column={{ xs: 1, sm: 2 }}
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
