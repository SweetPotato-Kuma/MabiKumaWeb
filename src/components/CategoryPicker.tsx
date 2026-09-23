import { useEffect, useMemo, useState } from 'react';
import { Flex, Grid, Select, Tree, Typography, type TreeDataNode } from 'antd';
import type { Key } from 'react';
import {
  CATEGORY_GROUPS,
  findGroupOf,
  findUngroupedCategories,
  groupKeyOf,
  isGroupKey,
} from '@/features/auction/categoryTree';
import { formatNumber } from '@/lib/format';

const { Text } = Typography;

interface CategoryPickerProps {
  /** 고른 카테고리. 빈 문자열은 전체를 뜻한다. */
  value: string;
  onChange: (category: string) => void;
  /** 카테고리별 아이템 수. 주면 잎 옆에 함께 보여 준다. */
  counts?: Readonly<Record<string, number>>;
  allLabel?: string;
}

const ALL_CATEGORIES = '';

function leafTitle(category: string, counts?: Readonly<Record<string, number>>) {
  const count = counts?.[category];
  if (count === undefined) return category;

  return (
    <Flex justify="space-between" gap={12}>
      <span>{category}</span>
      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
        {formatNumber(count)}
      </Text>
    </Flex>
  );
}

/**
 * 묶음은 펼치기만 하고 고를 수 없다. 요청에 실리는 것은 언제나 잎이다.
 * 묶음에서 빠진 카테고리가 생기면 맨 아래에 그대로 붙여 하나도 잃지 않는다.
 */
function buildTreeData(counts: CategoryPickerProps['counts'], allLabel: string): TreeDataNode[] {
  const groups: TreeDataNode[] = CATEGORY_GROUPS.map((group) => ({
    key: groupKeyOf(group.name),
    title: group.name,
    selectable: false,
    children: group.categories.map((category) => ({
      key: category,
      title: leafTitle(category, counts),
    })),
  }));

  const ungrouped = findUngroupedCategories();
  if (ungrouped.length > 0) {
    groups.push({
      key: groupKeyOf('분류되지 않음'),
      title: '분류되지 않음',
      selectable: false,
      children: ungrouped.map((category) => ({ key: category, title: leafTitle(category, counts) })),
    });
  }

  return [{ key: ALL_CATEGORIES, title: allLabel }, ...groups];
}

/** 좁은 화면에서는 트리 대신 묶음별 Select 를 쓴다. 트리는 손가락으로 펼치기 어렵다. */
function buildSelectOptions(allLabel: string) {
  return [
    { value: ALL_CATEGORIES, label: allLabel },
    ...CATEGORY_GROUPS.map((group) => ({
      label: group.name,
      options: group.categories.map((category) => ({ value: category, label: category })),
    })),
  ];
}

/**
 * 82개 카테고리를 고르는 컨트롤. 넓은 화면은 트리, 좁은 화면은 Select 하나로 떨어진다.
 * 묶음은 화면에서만 쓰는 분류이고 API 에는 존재하지 않는다.
 */
export function CategoryPicker({ value, onChange, counts, allLabel = '전체' }: CategoryPickerProps) {
  const screens = Grid.useBreakpoint();
  const isWide = Boolean(screens.md);

  const treeData = useMemo(() => buildTreeData(counts, allLabel), [counts, allLabel]);
  const selectOptions = useMemo(() => buildSelectOptions(allLabel), [allLabel]);
  const expandedGroup = findGroupOf(value);

  const [expandedKeys, setExpandedKeys] = useState<Key[]>(() =>
    expandedGroup ? [groupKeyOf(expandedGroup)] : [],
  );

  /**
   * 바깥에서 카테고리가 바뀌어 들어올 때(주소로 넘어온 조건 등) 그 묶음을 펼쳐 둔다.
   * 고른 잎이 접힌 채로 있으면 무엇이 선택됐는지 화면에서 보이지 않는다.
   */
  useEffect(() => {
    if (!expandedGroup) return;
    const key = groupKeyOf(expandedGroup);
    setExpandedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, [expandedGroup]);

  /** 묶음은 고를 수 없으니 제목을 눌러도 아무 일이 없다. 누르면 펼쳐지는 게 기대에 맞다. */
  function toggleGroup(key: Key) {
    setExpandedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }

  if (!isWide) {
    return (
      <Select
        value={value}
        onChange={onChange}
        options={selectOptions}
        showSearch
        optionFilterProp="label"
        placeholder="카테고리"
        style={{ width: '100%' }}
      />
    );
  }

  return (
    <Tree
      blockNode
      treeData={treeData}
      selectedKeys={[value]}
      expandedKeys={expandedKeys}
      onExpand={setExpandedKeys}
      onClick={(_event, node) => {
        // 묶음 행은 선택 대상이 아니라 onSelect 가 불리지 않는다. 여기서 펼침을 맡는다.
        if (isGroupKey(String(node.key))) toggleGroup(node.key);
      }}
      onSelect={(keys) => {
        // 고른 것을 다시 누르면 antd 가 빈 배열을 준다. 그때는 선택을 그대로 둔다.
        const next = keys[0];
        if (typeof next === 'string') onChange(next);
      }}
    />
  );
}
