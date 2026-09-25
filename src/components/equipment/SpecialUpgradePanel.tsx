import { Flex, Segmented, Select, Tooltip, Typography } from 'antd';
import type { SpecialKind } from '@/features/equipment/simulate';
import { describeSpecialStep, specialStep } from '@/features/equipment/specialUpgrade';
import type { EquipmentRecord } from '@/features/equipment/types';
import { InfoIcon } from '@/components/icons';

const { Text } = Typography;

interface SpecialUpgradePanelProps {
  special: NonNullable<EquipmentRecord['special']>;
  kind: SpecialKind | null;
  level: number;
  onChange: (kind: SpecialKind | null, level: number) => void;
}

type KindChoice = SpecialKind | 'none';

/**
 * 특별 개조. 종류(S, R), 단계, 그 단계의 효과를 한 줄에 둔다.
 *
 * 단계별 수치는 게임 데이터에 없어 공개된 커뮤니티 표를 옮겼다(`specialUpgrade.ts`). 그 표에
 * 비어 있는 단계는 최종 능력치에 더하지 않고, 비어 있다고 적는다. 이 사정은 옆의 안내 표시에 둔다.
 */
export function SpecialUpgradePanel({ special, kind, level, onChange }: SpecialUpgradePanelProps) {
  const choices = [
    { value: 'none' as KindChoice, label: '안 함' },
    { value: 's' as KindChoice, label: 'S', disabled: !special.s },
    { value: 'r' as KindChoice, label: 'R', disabled: !special.r },
  ];
  const levelOptions = Array.from({ length: special.max }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}단계`,
  }));
  const step = kind ? specialStep(kind, kind === 's' ? special.s : special.r, level) : undefined;

  return (
    <Flex align="center" gap={8} wrap>
      <Segmented<KindChoice>
        aria-label="특별 개조 종류"
        size="small"
        value={kind ?? 'none'}
        onChange={(next) =>
          onChange(next === 'none' ? null : next, next === 'none' ? 0 : Math.max(level, 1))
        }
        options={choices}
      />
      <Select<number>
        aria-label="특별 개조 단계"
        size="small"
        value={kind ? level : undefined}
        placeholder="단계"
        disabled={!kind}
        onChange={(next) => onChange(kind, next)}
        options={levelOptions}
        style={{ width: 88 }}
      />
      <Text
        className="tnum"
        style={{ flex: '1 1 200px', minWidth: 0 }}
        type={kind ? undefined : 'secondary'}
      >
        {kind ? describeSpecialStep(step) : `최대 ${special.max}단계까지 받을 수 있습니다`}
      </Text>
      <Tooltip
        title={`S 는 푸른 개조석으로 공격력과 보너스 대미지를, R 은 붉은 개조석으로 크리티컬 대미지를 올립니다. 단계별 수치는 게임 데이터에 없어 공개된 커뮤니티 표를 옮겼으며, 그 표가 오래되어 실제와 다를 수 있습니다.`}
      >
        <InfoIcon aria-label="특별 개조 수치 안내" />
      </Tooltip>
    </Flex>
  );
}
