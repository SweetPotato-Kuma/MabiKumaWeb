import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Flex,
  Input,
  Segmented,
  Table,
  Tabs,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import { effectSummary, enchantRank } from '@/features/equipment/enchant';
import {
  compareForEquipment,
  equipClass,
  isNotableEnchant,
  sourceLabel,
  type EquipClass,
} from '@/features/equipment/enchantRanking';
import type { EnchantPick } from '@/features/equipment/simulate';
import type { EnchantDef } from '@/features/equipment/types';
import { EmptyState } from '@/components/EmptyState';

const { Text } = Typography;

interface EnchantPanelProps {
  /** 사전 카테고리. 장비 분류(물리 무기, 천옷 등)를 정해 정렬 기준을 고른다. */
  category: string;
  enchants: EnchantDef[];
  pick: EnchantPick;
  onChange: (pick: EnchantPick) => void;
}

/** 목록 한 쪽의 줄 수. 패널이 길게 늘어지지 않게 적게 둔다. 찾기로 좁히는 편이 빠르다. */
const PAGE_SIZE = 5;

/**
 * 목록 자리의 높이. 머리줄, 다섯 줄, 쪽 넘기기를 합친 만큼 늘 잡아 둔다.
 * 찾는 글자를 칠 때마다 줄 수가 바뀌면 아래 패널이 위아래로 흔들린다.
 */
const LIST_MIN_HEIGHT = 290;

/** 입력기가 글자를 조립하는 중이면 끝에 낱자가 붙어 온다("최ㄷ"). 그때마다 목록이 비지 않게 뗀다. */
const TRAILING_JAMO = /[ㄱ-ㅎㅏ-ㅣ]+$/;

type View = 'notable' | 'all';

const rankLabel = (enchant: EnchantDef) => `${enchantRank(enchant.level)} 랭크`;

/**
 * 접두나 접미 하나의 목록. 줄을 누르면 그 인챈트를 바른다.
 *
 * 처음에는 이 장비에서 눈여겨볼 것(가까운 던전에서 나오거나 중요한 능력치를 올리는 것)만 보이고,
 * "전체" 로 바꾸면 바를 수 있는 것이 모두 보인다. 이름뿐 아니라 효과 글로도 찾는다.
 */
function EnchantList({
  slot,
  cls,
  options,
  value,
  onChange,
}: {
  slot: 0 | 1;
  cls: EquipClass;
  options: EnchantDef[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const notable = useMemo(
    () => options.filter((enchant) => isNotableEnchant(enchant, cls)),
    [options, cls],
  );
  const [view, setView] = useState<View>(notable.length ? 'notable' : 'all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const label = slot === 0 ? '접두' : '접미';
  const chosen = options.find((enchant) => enchant.id === value);

  const needle = keyword.trim().replace(TRAILING_JAMO, '').trim();
  const base = view === 'notable' ? notable : options;
  const rows = needle
    ? base.filter((enchant) => `${enchant.name} ${effectSummary(enchant)}`.includes(needle))
    : base;

  const columns: TableColumnsType<EnchantDef> = [
    {
      title: '랭크',
      key: 'rank',
      width: 64,
      className: 'tnum',
      render: (_, enchant) => rankLabel(enchant),
    },
    {
      title: '이름',
      key: 'name',
      width: 168,
      ellipsis: true,
      render: (_, enchant) => {
        const source = sourceLabel(enchant, cls);
        return (
          <Flex align="center" gap={4} style={{ minWidth: 0 }}>
            <Text strong ellipsis>
              {enchant.name}
            </Text>
            {source ? (
              <Tag
                bordered={false}
                color="processing"
                style={{ marginInlineEnd: 0, flex: '0 0 auto' }}
              >
                {source}
              </Tag>
            ) : null}
          </Flex>
        );
      },
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
      {/* 무엇을 발랐는지, 보기, 찾기 칸을 한 줄에. 좁은 화면에서는 아래로 떨어진다. */}
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
        <Flex align="center" gap={8}>
          <Segmented<View>
            aria-label={`${label} 인챈트 보기`}
            size="small"
            value={view}
            onChange={(next) => {
              setView(next);
              setPage(1);
            }}
            options={[
              { value: 'notable', label: `주요 ${notable.length}`, disabled: notable.length === 0 },
              { value: 'all', label: `전체 ${options.length}` },
            ]}
          />
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
            style={{ width: 180 }}
          />
        </Flex>
      </Flex>

      <div style={{ minHeight: LIST_MIN_HEIGHT }}>
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
          }}
          locale={{ emptyText: `"${needle}" 와 맞는 ${label} 인챈트가 없습니다.` }}
        />
      </div>
    </Flex>
  );
}

/**
 * 인챈트. 이 장비에 바를 수 있는 접두와 접미를 전부 펼쳐 두고 하나씩 고른다.
 *
 * 인챈트는 장비 종류마다 바를 수 있는 것이 정해져 있다(활에 바르는 것은 검에 못 바른다). 목록은
 * 게임 데이터의 "이 인챈트를 바를 수 있는 아이템" 에서 이 장비가 들어 있는 것만 모은 것이다.
 * 정렬은 `enchantRanking.ts` 가 정한다: 가까운 던전, 장비 분류별 중요 능력치, 출시 순.
 *
 * 효과 수치는 폭이 있어서(최대 대미지 50~60) 최종 능력치에 범위로 더한다. 조건이 붙은 효과는 그
 * 조건을 채웠는지 이 화면이 알 수 없으므로 더할지 말지를 고르게 한다.
 */
export function EnchantPanel({ category, enchants, pick, onChange }: EnchantPanelProps) {
  const cls = equipClass(category);
  const compare = useMemo(() => compareForEquipment(cls), [cls]);
  const prefixes = useMemo(
    () => enchants.filter((enchant) => enchant.slot === 0).sort(compare),
    [enchants, compare],
  );
  const suffixes = useMemo(
    () => enchants.filter((enchant) => enchant.slot === 1).sort(compare),
    [enchants, compare],
  );
  const hasConditional = enchants.some(
    (enchant) =>
      (enchant.id === pick.prefix || enchant.id === pick.suffix) &&
      enchant.effects.some(([, , , conditional]) => conditional),
  );

  if (enchants.length === 0) {
    return <EmptyState size="small" description="이 장비에 바를 수 있는 인챈트가 없습니다." />;
  }

  return (
    <Flex vertical gap={8}>
      <Tabs
        size="small"
        tabBarStyle={{ marginBottom: 8 }}
        tabBarExtraContent={
          <Text type="secondary" style={{ fontSize: 12 }}>
            상위 던전 인챈트부터, 접두와 접미 하나씩
          </Text>
        }
        items={[
          {
            key: 'prefix',
            label: `접두 ${prefixes.length}개`,
            children: (
              <EnchantList
                slot={0}
                cls={cls}
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
                cls={cls}
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
