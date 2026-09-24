import { Flex, Form, Segmented, Select, Typography } from 'antd';
import type { SpecialKind } from '@/features/equipment/simulate';
import type { EquipmentRecord } from '@/features/equipment/types';

const { Text } = Typography;

interface SpecialUpgradePanelProps {
  special: NonNullable<EquipmentRecord['special']>;
  kind: SpecialKind | null;
  level: number;
  onChange: (kind: SpecialKind | null, level: number) => void;
}

type KindChoice = SpecialKind | 'none';

/**
 * 특별 개조. 종류(S, R)와 단계만 고른다.
 *
 * 게임 데이터에는 이 장비가 어느 특별 개조 종류를 받는지와 단계 상한만 있고 단계별 수치 표는
 * 없다. 그래서 능력치 표에 더하지 않는다. 수치를 지어내 넣느니 비워 두는 편이 맞다.
 */
export function SpecialUpgradePanel({ special, kind, level, onChange }: SpecialUpgradePanelProps) {
  const choices = [
    { value: 'none' as KindChoice, label: '하지 않음' },
    { value: 's' as KindChoice, label: 'S 개조', disabled: !special.s },
    { value: 'r' as KindChoice, label: 'R 개조', disabled: !special.r },
  ];
  const levelOptions = Array.from({ length: special.max }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}단계`,
  }));

  return (
    <Flex vertical gap={12}>
      <Form layout="vertical">
        <Flex gap={16} wrap align="flex-end">
          <Form.Item label="종류" style={{ marginBottom: 0 }}>
            <Segmented<KindChoice>
              aria-label="특별 개조 종류"
              value={kind ?? 'none'}
              onChange={(next) =>
                onChange(next === 'none' ? null : next, next === 'none' ? 0 : Math.max(level, 1))
              }
              options={choices}
            />
          </Form.Item>
          <Form.Item label="단계" htmlFor="special-level" style={{ marginBottom: 0 }}>
            <Select<number>
              id="special-level"
              value={kind ? level : undefined}
              disabled={!kind}
              onChange={(next) => onChange(kind, next)}
              options={levelOptions}
              style={{ width: 120 }}
            />
          </Form.Item>
        </Flex>
      </Form>

      <Text type="secondary" style={{ fontSize: 12 }}>
        S 개조는 푸른 개조석으로 무기 자체의 능력치를, R 개조는 붉은 개조석으로 크리티컬 대미지를
        올립니다. 이 장비는 {special.max}단계까지 받을 수 있습니다. 단계별 수치는 게임 데이터에 적혀
        있지 않아 위 능력치 표에는 더하지 않았습니다.
      </Text>
    </Flex>
  );
}
