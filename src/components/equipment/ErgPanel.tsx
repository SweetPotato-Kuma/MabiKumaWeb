import { Flex, InputNumber, Segmented, Slider, Typography } from 'antd';
import {
  ERG_GRADE_LABEL,
  availableGrades,
  fillErg,
  isErgStatEffect,
  maxErgLevel,
  unlockLevels,
  type ErgPick,
} from '@/features/equipment/erg';
import type { ErgGrade, ErgGradeDef, ErgSet } from '@/features/equipment/types';

const { Text } = Typography;

type GradeChoice = ErgGrade | 'none';

/**
 * 효과 목록. 지금 레벨에서 열린 것은 값을 채워 적고, 아직 안 열린 것은 몇 레벨부터인지 흐리게 적는다.
 * 능력치 표에 더해지는 효과에는 표시를 붙여 어느 것이 합계에 들어갔는지 보이게 한다.
 */
function EffectList({
  def,
  level,
  dark = false,
}: {
  def: ErgGradeDef | undefined;
  level: number;
  /** 어둠의 에르그 효과는 기본/추가로 나뉘지 않는다 */
  dark?: boolean;
}) {
  const opened = fillErg(def, level);
  return (
    <Flex vertical gap={2}>
      {unlockLevels(def).map(({ template, level: unlock }, index) => {
        const effect = opened[index];
        return effect ? (
          <Text key={index} className="tnum">
            {dark ? '효과' : index === 0 ? '기본 효과' : '추가 효과'}: {effect.text}
            {isErgStatEffect(template) ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {' '}
                (능력치에 더함)
              </Text>
            ) : null}
          </Text>
        ) : (
          <Text key={index} type="secondary" className="tnum">
            {unlock}레벨부터: {template.replace(/\{\d+\}/g, '?')}
          </Text>
        );
      })}
    </Flex>
  );
}

/**
 * 에르그. 등급과 레벨을 고르면 그 레벨의 효과를 보여 주고, 무기 능력치 효과는 최종 능력치에 더한다.
 *
 * 등급을 고르면 그 등급의 끝 레벨로 시작한다. 에르그를 올리는 사람은 대개 끝까지 올린다.
 * 어둠의 에르그는 S 등급 50레벨 위에 붙는 것이라, 고르면 S 등급 효과를 다 가진 채로 레벨을 고른다.
 */
export function ErgPanel({
  erg,
  pick,
  onChange,
}: {
  erg: ErgSet;
  pick: ErgPick;
  onChange: (pick: ErgPick) => void;
}) {
  const grades = availableGrades(erg);
  const grade = pick.grade;
  const max = grade ? maxErgLevel(erg, grade) : 0;
  const setLevel = (value: number | null) => {
    if (!grade || value === null) return;
    onChange({ grade, level: Math.min(Math.max(Math.round(value), 1), max) });
  };

  return (
    <Flex vertical gap={10}>
      <Flex align="center" gap={12} wrap>
        <Segmented<GradeChoice>
          aria-label="에르그 등급"
          size="small"
          value={grade ?? 'none'}
          onChange={(next) =>
            onChange(
              next === 'none'
                ? { grade: null, level: 0 }
                : { grade: next, level: maxErgLevel(erg, next) },
            )
          }
          options={[
            { value: 'none', label: '안 함' },
            ...grades.map((value) => ({
              value,
              label: value === 'D' ? ERG_GRADE_LABEL.D : value,
            })),
          ]}
        />
        {grade ? (
          <Flex align="center" gap={8} style={{ flex: '1 1 220px', minWidth: 0 }}>
            <Slider
              aria-label="에르그 레벨"
              min={1}
              max={max}
              value={pick.level}
              onChange={setLevel}
              style={{ flex: 1, minWidth: 100, margin: '0 6px' }}
            />
            <InputNumber
              aria-label="에르그 레벨 입력"
              size="small"
              min={1}
              max={max}
              value={pick.level}
              onChange={setLevel}
              suffix="레벨"
              style={{ width: 96 }}
            />
          </Flex>
        ) : (
          <Text type="secondary">등급을 고르면 끝 레벨로 시작합니다</Text>
        )}
      </Flex>

      {grade === 'D' ? (
        <>
          <Text strong>S 등급 {maxErgLevel(erg, 'S')}레벨</Text>
          <EffectList def={erg.S} level={maxErgLevel(erg, 'S')} />
          <Text strong>어둠의 에르그</Text>
          <EffectList def={erg.D} level={pick.level} dark />
        </>
      ) : grade ? (
        <EffectList def={erg[grade]} level={pick.level} />
      ) : null}

      <Text type="secondary" style={{ fontSize: 12 }}>
        무기 공격력은 최소와 최대 공격력에 모두 더합니다. 스킬 대미지나 재사용 대기 시간 같은 효과는
        능력치 표에 더하지 않고 글로만 보여 줍니다.
      </Text>
    </Flex>
  );
}
