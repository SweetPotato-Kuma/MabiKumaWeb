import { useMemo } from 'react';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Col,
  Empty,
  Flex,
  Form,
  InputNumber,
  Row,
  Segmented,
  Select,
  Tag,
  Typography,
} from 'antd';
import {
  REFORGE_MAX_OPTIONS,
  REFORGE_RANKS,
  describeAbility,
  highestLevel,
  isLimitBreakLevel,
  levelRange,
  reforgeCandidates,
  type ReforgeRank,
} from '@/features/equipment/reforge';
import type { ReforgePick } from '@/features/equipment/simulate';
import type { AbilityDef, LevelRow } from '@/features/equipment/types';

const { Text } = Typography;

interface ReforgePanelProps {
  equipType: string;
  abilities: AbilityDef[];
  levels: LevelRow[];
  rank: ReforgeRank;
  options: ReforgePick[];
  onChange: (rank: ReforgeRank, options: ReforgePick[]) => void;
}

const RANK_OPTIONS = REFORGE_RANKS.map((rank) => ({ value: rank, label: `${rank}랭크` }));

/**
 * 세공. 랭크를 고르고 옵션을 셋까지 붙여 본다.
 *
 * 랭크를 바꾸면 그 랭크에서 붙을 수 없는 옵션은 빼고, 레벨은 새 랭크의 폭 안으로 옮긴다.
 * 게임에서도 랭크가 레벨 폭을 정하므로 폭 밖의 조합은 만들 수 없다.
 */
export function ReforgePanel({
  equipType,
  abilities,
  levels,
  rank,
  options,
  onChange,
}: ReforgePanelProps) {
  const candidates = useMemo(
    () => reforgeCandidates(abilities, rank, equipType, levels),
    [abilities, rank, equipType, levels],
  );
  const byId = useMemo(
    () => new Map(abilities.map((ability) => [ability.id, ability])),
    [abilities],
  );

  const changeRank = (next: ReforgeRank) => {
    const kept: ReforgePick[] = [];
    for (const pick of options) {
      const ability = byId.get(pick.abilityId);
      if (!ability) continue;
      const range = levelRange(ability, next, equipType, levels);
      if (range.max <= 0) continue;
      kept.push({ ...pick, level: Math.min(Math.max(pick.level, range.min), highestLevel(range)) });
    }
    onChange(next, kept);
  };

  const addOption = () => {
    const used = new Set(options.map((pick) => pick.abilityId));
    const first = candidates.find((ability) => !used.has(ability.id));
    if (!first) return;
    onChange(rank, [
      ...options,
      { abilityId: first.id, level: levelRange(first, rank, equipType, levels).max },
    ]);
  };

  const replace = (index: number, pick: ReforgePick | null) => {
    const next = [...options];
    if (pick) next[index] = pick;
    else next.splice(index, 1);
    onChange(rank, next);
  };

  if (abilities.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="이 장비에 붙는 세공 옵션이 없습니다."
      />
    );
  }

  return (
    <Flex vertical gap={16}>
      <Form layout="vertical">
        <Form.Item label="랭크" style={{ marginBottom: 0 }}>
          <Segmented<ReforgeRank>
            aria-label="세공 랭크"
            value={rank}
            onChange={changeRank}
            options={RANK_OPTIONS}
          />
        </Form.Item>
      </Form>

      {options.map((pick, index) => {
        const ability = byId.get(pick.abilityId);
        if (!ability) return null;
        const range = levelRange(ability, rank, equipType, levels);
        const used = new Set(
          options.filter((_, other) => other !== index).map((entry) => entry.abilityId),
        );
        const selectId = `reforge-option-${index}`;
        const levelId = `reforge-level-${index}`;

        return (
          <Flex key={`${pick.abilityId}-${index}`} vertical gap={6}>
            <Form layout="vertical">
              {/* 옵션과 레벨을 한 줄에. 768px 미만에서는 두 줄로 떨어진다. */}
              <Row gutter={[12, 8]} align="bottom">
                <Col xs={24} md={15}>
                  <Form.Item
                    label={`옵션 ${index + 1}`}
                    htmlFor={selectId}
                    style={{ marginBottom: 0 }}
                  >
                    <Select<number>
                      id={selectId}
                      showSearch
                      optionFilterProp="label"
                      value={pick.abilityId}
                      onChange={(abilityId) => {
                        const next = byId.get(abilityId);
                        if (!next) return;
                        replace(index, {
                          abilityId,
                          level: levelRange(next, rank, equipType, levels).max,
                        });
                      }}
                      options={candidates
                        .filter((candidate) => !used.has(candidate.id))
                        .map((candidate) => ({ value: candidate.id, label: candidate.name }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={16} md={6}>
                  <Form.Item label="레벨" htmlFor={levelId} style={{ marginBottom: 0 }}>
                    <InputNumber
                      id={levelId}
                      min={range.min}
                      max={highestLevel(range)}
                      value={pick.level}
                      onChange={(level) => {
                        if (level === null) return;
                        const clamped = Math.min(
                          Math.max(Math.round(level), range.min),
                          highestLevel(range),
                        );
                        replace(index, { ...pick, level: clamped });
                      }}
                      className="tnum"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={8} md={3}>
                  <Button
                    icon={<DeleteOutlined />}
                    aria-label={`옵션 ${index + 1} 빼기`}
                    onClick={() => replace(index, null)}
                    block
                  />
                </Col>
              </Row>
            </Form>
            <Flex gap={8} wrap align="center">
              <Text className="tnum">{describeAbility(ability, pick.level)}</Text>
              {isLimitBreakLevel(range, pick.level) ? (
                <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                  한계 돌파
                </Tag>
              ) : null}
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                레벨 {range.min}~{range.max}
                {range.limitBreakMax
                  ? `, 한계 돌파 ${range.limitBreakMin}~${range.limitBreakMax}`
                  : ''}
              </Text>
            </Flex>
          </Flex>
        );
      })}

      <div>
        <Button
          icon={<PlusOutlined />}
          onClick={addOption}
          disabled={options.length >= REFORGE_MAX_OPTIONS || candidates.length <= options.length}
        >
          옵션 추가
        </Button>
      </div>

      <Text type="secondary" style={{ fontSize: 12 }}>
        이 장비에 붙을 수 있는 옵션 {candidates.length}개 중에서 고릅니다. 레벨 폭은 랭크 기준 전체
        폭이며, 쓰는 세공 도구에 따라 실제로 나오는 폭은 더 좁을 수 있습니다. 한계 돌파는 일부 세공
        도구로만 나옵니다.
      </Text>
    </Flex>
  );
}
