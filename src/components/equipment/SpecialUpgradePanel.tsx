import { Flex, Form, Segmented, Select, Typography } from 'antd';
import type { SpecialKind } from '@/features/equipment/simulate';
import { describeSpecialStep, specialStep } from '@/features/equipment/specialUpgrade';
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
 * 특별 개조. 종류(S, R)와 단계를 고른다.
 *
 * 단계별 수치는 게임 데이터에 없어 공개된 커뮤니티 표를 옮겼다(`specialUpgrade.ts`). 그 표에
 * 비어 있는 단계는 최종 능력치에 더하지 않고, 비어 있다고 적는다.
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
  const step = kind ? specialStep(kind, kind === 's' ? special.s : special.r, level) : undefined;

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

      {kind ? <Text className="tnum">{describeSpecialStep(step)}</Text> : null}

      <Text type="secondary" style={{ fontSize: 12 }}>
        S 개조는 푸른 개조석으로 공격력과 보너스 대미지를, R 개조는 붉은 개조석으로 크리티컬
        대미지를 올립니다. 이 장비는 {special.max}단계까지 받을 수 있습니다. 단계별 수치는 게임
        데이터에 없어 공개된 커뮤니티 표를 옮겼으며, 그 표가 오래되어 실제와 다를 수 있습니다.
      </Text>
    </Flex>
  );
}
