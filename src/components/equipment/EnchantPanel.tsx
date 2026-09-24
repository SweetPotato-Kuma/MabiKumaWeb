import { useMemo } from 'react';
import { Checkbox, Col, Empty, Flex, Form, Row, Select, Tag, Typography } from 'antd';
import {
  compareEnchants,
  enchantRank,
  isEnchantNote,
  stripBrackets,
} from '@/features/equipment/enchant';
import type { EnchantPick } from '@/features/equipment/simulate';
import type { EnchantDef } from '@/features/equipment/types';

const { Text } = Typography;

interface EnchantPanelProps {
  enchants: EnchantDef[];
  pick: EnchantPick;
  onChange: (pick: EnchantPick) => void;
}

/** 고른 인챈트의 설명. 효과 줄을 먼저, 적용 조건과 부가 규칙은 흐리게 뒤로. */
export function EnchantEffects({ enchant }: { enchant: EnchantDef }) {
  const effects = enchant.desc.filter((line) => !isEnchantNote(line));
  const notes = enchant.desc.filter(isEnchantNote);
  return (
    <Flex vertical gap={2}>
      {effects.map((line, index) => (
        <span key={`${line}-${index}`}>{line}</span>
      ))}
      {notes.map((line, index) => (
        <Text key={`${line}-${index}`} type="secondary" style={{ fontSize: 12 }}>
          {stripBrackets(line)}
        </Text>
      ))}
    </Flex>
  );
}

function EnchantSelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: EnchantDef[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const chosen = options.find((enchant) => enchant.id === value);

  return (
    <Flex vertical gap={8}>
      <Form.Item label={`${label} (${options.length}개)`} htmlFor={id} style={{ marginBottom: 0 }}>
        <Select<number>
          id={id}
          showSearch
          allowClear
          value={value ?? undefined}
          onChange={(next) => onChange(next ?? null)}
          placeholder={options.length ? '예: 거침없는' : `붙일 수 있는 ${label}가 없습니다`}
          disabled={options.length === 0}
          optionFilterProp="search"
          options={options.map((enchant) => ({
            value: enchant.id,
            label: `${enchantRank(enchant.level)} 랭크 ${enchant.name}`,
            search: `${enchant.name} ${enchantRank(enchant.level)}`,
            summary: enchant.desc.filter((line) => !isEnchantNote(line)).join(', '),
          }))}
          optionRender={(option) => (
            <Flex vertical>
              <span>{option.data.label}</span>
              <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'normal' }}>
                {option.data.summary}
              </Text>
            </Flex>
          )}
        />
      </Form.Item>
      {chosen ? (
        <Flex vertical gap={4}>
          <Flex gap={6} wrap>
            <Tag style={{ marginInlineEnd: 0 }}>{enchantRank(chosen.level)} 랭크</Tag>
            {chosen.personal ? (
              <Tag color="warning" style={{ marginInlineEnd: 0 }}>
                장비가 전용이 됨
              </Tag>
            ) : null}
          </Flex>
          <EnchantEffects enchant={chosen} />
        </Flex>
      ) : null}
    </Flex>
  );
}

/**
 * 인챈트. 이 장비에 붙일 수 있는 접두와 접미를 하나씩 고른다.
 *
 * 효과 수치는 폭이 있어서(최대 대미지 50~60) 최종 능력치에 범위로 더한다. 조건이 붙은 효과는 그
 * 조건을 채웠는지 이 화면이 알 수 없으므로 더할지 말지를 고르게 한다.
 */
export function EnchantPanel({ enchants, pick, onChange }: EnchantPanelProps) {
  const prefixes = useMemo(
    () => enchants.filter((enchant) => enchant.slot === 0).sort(compareEnchants),
    [enchants],
  );
  const suffixes = useMemo(
    () => enchants.filter((enchant) => enchant.slot === 1).sort(compareEnchants),
    [enchants],
  );
  const hasConditional = enchants.some(
    (enchant) =>
      (enchant.id === pick.prefix || enchant.id === pick.suffix) &&
      enchant.effects.some(([, , , conditional]) => conditional),
  );

  if (enchants.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="이 장비에 붙일 수 있는 인챈트가 없습니다."
      />
    );
  }

  return (
    <Flex vertical gap={16}>
      <Form layout="vertical">
        {/* 접두와 접미를 나란히. 768px 미만에서는 한 단으로 떨어진다. */}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <EnchantSelect
              id="enchant-prefix"
              label="접두"
              options={prefixes}
              value={pick.prefix}
              onChange={(prefix) => onChange({ ...pick, prefix })}
            />
          </Col>
          <Col xs={24} md={12}>
            <EnchantSelect
              id="enchant-suffix"
              label="접미"
              options={suffixes}
              value={pick.suffix}
              onChange={(suffix) => onChange({ ...pick, suffix })}
            />
          </Col>
        </Row>
      </Form>

      {hasConditional ? (
        <Checkbox
          checked={pick.conditional}
          onChange={(event) => onChange({ ...pick, conditional: event.target.checked })}
        >
          조건이 붙은 효과도 최종 능력치에 더하기 (스킬 랭크, 레벨 조건을 채웠다고 봅니다)
        </Checkbox>
      ) : null}
    </Flex>
  );
}
