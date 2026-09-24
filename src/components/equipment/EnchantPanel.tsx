import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Empty,
  Flex,
  Input,
  Table,
  Tabs,
  Typography,
  type TableColumnsType,
} from 'antd';
import { compareEnchants, effectSummary, enchantRank } from '@/features/equipment/enchant';
import type { EnchantPick } from '@/features/equipment/simulate';
import type { EnchantDef } from '@/features/equipment/types';

const { Text } = Typography;

interface EnchantPanelProps {
  enchants: EnchantDef[];
  pick: EnchantPick;
  onChange: (pick: EnchantPick) => void;
}

/** 목록 한 쪽의 줄 수. 패널이 길게 늘어지지 않게 적게 둔다. 찾기로 좁히는 편이 빠르다. */
const PAGE_SIZE = 5;

const rankLabel = (enchant: EnchantDef) => `${enchantRank(enchant.level)} 랭크`;

/**
 * 접두나 접미 하나의 목록. 줄을 누르면 그 인챈트를 바른다.
 *
 * 이름뿐 아니라 효과 글로도 찾는다. "최대 대미지" 를 치면 최대 대미지를 올리는 인챈트만 남는다.
 * 인챈트를 고르는 사람은 이름보다 무엇이 오르는지를 먼저 찾는다.
 */
function EnchantList({
  slot,
  options,
  value,
  onChange,
}: {
  slot: 0 | 1;
  options: EnchantDef[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const label = slot === 0 ? '접두' : '접미';
  const chosen = options.find((enchant) => enchant.id === value);

  const needle = keyword.trim();
  const rows = needle
    ? options.filter((enchant) => `${enchant.name} ${effectSummary(enchant)}`.includes(needle))
    : options;

  const columns: TableColumnsType<EnchantDef> = [
    {
      title: '랭크',
      key: 'rank',
      width: 72,
      className: 'tnum',
      render: (_, enchant) => rankLabel(enchant),
    },
    {
      title: '이름',
      key: 'name',
      width: 128,
      ellipsis: true,
      render: (_, enchant) => <Text strong>{enchant.name}</Text>,
    },
    {
      title: '효과',
      key: 'effect',
      ellipsis: { showTitle: false },
      render: (_, enchant) => (
        <Text className="tnum" ellipsis={{ tooltip: effectSummary(enchant) }}>
          {effectSummary(enchant)}
        </Text>
      ),
    },
  ];

  return (
    <Flex vertical gap={8}>
      {/* 무엇을 발랐는지와 찾기 칸을 한 줄에. 좁은 화면에서는 찾기 칸이 아래로 떨어진다. */}
      <Flex align="center" justify="space-between" gap={8} wrap>
        <Flex align="center" gap={6} wrap>
          <Text type="secondary">적용한 {label}</Text>
          {chosen ? (
            <>
              <Text strong className="tnum">
                {rankLabel(chosen)} {chosen.name}
              </Text>
              <Button size="small" type="link" onClick={() => onChange(null)}>
                빼기
              </Button>
            </>
          ) : (
            <Text>없음</Text>
          )}
        </Flex>
        <Input
          aria-label="이름이나 효과로 찾기"
          size="small"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
          placeholder="예: 최대 대미지"
          allowClear
          style={{ width: 200 }}
        />
      </Flex>

      <Table<EnchantDef>
        size="small"
        rowKey="id"
        tableLayout="fixed"
        columns={columns}
        dataSource={rows}
        rowSelection={{
          type: 'radio',
          columnWidth: 36,
          selectedRowKeys: value === null ? [] : [value],
          onChange: (keys) => onChange(keys.length ? Number(keys[0]) : null),
          getCheckboxProps: (enchant) => ({ 'aria-label': `${label} ${enchant.name} 바르기` }),
        }}
        onRow={(enchant) => ({
          style: { cursor: 'pointer' },
          onClick: () => onChange(enchant.id),
        })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          onChange: setPage,
          showSizeChanger: false,
          size: 'small',
          hideOnSinglePage: true,
        }}
        locale={{ emptyText: `"${needle}" 와 맞는 ${label} 인챈트가 없습니다.` }}
      />
    </Flex>
  );
}

/**
 * 인챈트. 이 장비에 바를 수 있는 접두와 접미를 전부 펼쳐 두고 하나씩 고른다.
 *
 * 인챈트는 장비 종류마다 바를 수 있는 것이 정해져 있다(활에 바르는 것은 검에 못 바른다). 목록은
 * 게임 데이터의 "이 인챈트를 바를 수 있는 아이템" 에서 이 장비가 들어 있는 것만 모은 것이다.
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
        description="이 장비에 바를 수 있는 인챈트가 없습니다."
      />
    );
  }

  return (
    <Flex vertical gap={8}>
      <Tabs
        size="small"
        tabBarStyle={{ marginBottom: 8 }}
        tabBarExtraContent={
          <Text type="secondary" style={{ fontSize: 12 }}>
            이 장비에 바를 수 있는 것만, 접두와 접미 하나씩
          </Text>
        }
        items={[
          {
            key: 'prefix',
            label: `접두 ${prefixes.length}개`,
            children: (
              <EnchantList
                slot={0}
                options={prefixes}
                value={pick.prefix}
                onChange={(prefix) => onChange({ ...pick, prefix })}
              />
            ),
          },
          {
            key: 'suffix',
            label: `접미 ${suffixes.length}개`,
            children: (
              <EnchantList
                slot={1}
                options={suffixes}
                value={pick.suffix}
                onChange={(suffix) => onChange({ ...pick, suffix })}
              />
            ),
          },
        ]}
      />

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
