import { useState } from 'react';
import { Alert, Button, Card, Flex, Grid, InputNumber, Select, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteIcon, ResetIcon } from '@/components/icons';
import { MemoItem } from '@/components/materialMemo/MemoItem';
import {
  DEFAULT_WORKS,
  hasWorks,
  materialSummary,
  recipeTitle,
  type RecipeBook,
} from '@/features/crafting/recipes';
import { shortKinds, type Choice, type MemoNode, type MemoPlan } from '@/features/materialMemo/plan';
import {
  MAX_COUNT,
  clearOwned,
  removeTarget,
  setChoice,
  setOwned,
  setTargetCount,
  setTargetRecipe,
  setTargetWorks,
  type StoredTarget,
} from '@/features/materialMemo/store';
import { formatNumber } from '@/lib/format';

const { Text } = Typography;

interface Row {
  key: string;
  node: MemoNode;
  children?: Row[];
}

/** 만들기로 한 줄만 children 을 달아 펼침 단추가 나오게 한다. */
const toRows = (nodes: MemoNode[]): Row[] =>
  nodes.map((node) => ({
    key: node.key,
    node,
    ...(node.children ? { children: toRows(node.children) } : {}),
  }));

interface TargetCardProps {
  book: RecipeBook;
  target: StoredTarget;
  plan: MemoPlan;
}

/** 목표 아이템 하나. 재료 트리에 가진 개수를 적으면 모자란 개수가 줄마다 나온다. */
export function TargetCard({ book, target, plan }: TargetCardProps) {
  const screens = Grid.useBreakpoint();
  const compact = !screens.md;
  const [expanded, setExpanded] = useState<string[]>(() =>
    plan.nodes.filter((node) => node.children).map((node) => node.key),
  );

  const roots = book.recipesOf(target.itemId);
  const missing = shortKinds(plan.materials);
  const prepared = missing === 0;

  const choose = (node: MemoNode, choice: Choice) => {
    setChoice(target.id, node.key, choice);
    if (choice !== 'gather') setExpanded((keys) => (keys.includes(node.key) ? keys : [...keys, node.key]));
  };

  const methodSelect = (node: MemoNode) =>
    node.recipes.length === 0 ? (
      <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
        직접 구하기
      </Text>
    ) : (
      <Select<Choice>
        size="small"
        value={node.choice}
        onChange={(choice) => choose(node, choice)}
        aria-label={`${book.itemName(node.itemId)} 마련 방법`}
        popupMatchSelectWidth={false}
        options={[
          { value: 'gather', label: '직접 구하기' },
          ...node.recipes.map((each) => ({
            value: each.index,
            label: `제작: ${recipeTitle(book, each)}`,
          })),
        ]}
        style={{ minWidth: 150 }}
      />
    );

  const requiredCell = (node: MemoNode) => (
    <Flex vertical align="flex-end">
      <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
        {formatNumber(node.required)}
      </Text>
      {node.perWork !== undefined ? (
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          공정마다 {formatNumber(node.perWork)}개
        </Text>
      ) : null}
      {typeof node.choice === 'number' && node.yieldCount > 1 && node.crafts > 0 ? (
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {formatNumber(node.yieldCount)}개씩 {formatNumber(node.crafts)}번
        </Text>
      ) : null}
    </Flex>
  );

  const ownedCell = (node: MemoNode) => (
    <InputNumber
      size="small"
      min={0}
      max={MAX_COUNT}
      precision={0}
      value={node.owned}
      onChange={(value) => setOwned(target.id, node.key, value ?? 0)}
      aria-label={`${book.itemName(node.itemId)} 가진 개수`}
      className="tnum"
      style={{ width: compact ? 76 : 96 }}
    />
  );

  const shortCell = (node: MemoNode) => {
    if (node.required === 0) return <Text type="secondary">-</Text>;
    if (node.short === 0) return <Text type="success">완료</Text>;
    return (
      <Text strong className="tnum" style={{ whiteSpace: 'nowrap' }}>
        {formatNumber(node.short)}
      </Text>
    );
  };

  const nameCell = (node: MemoNode) => (
    <MemoItem
      book={book}
      itemId={node.itemId}
      suffix={node.finish ? <Tag style={{ marginInlineEnd: 0 }}>마감</Tag> : null}
    />
  );

  const columns: TableColumnsType<Row> = compact
    ? [
        {
          title: '재료',
          key: 'name',
          render: (_value, { node }) => (
            <Flex vertical gap={4} align="flex-start">
              {nameCell(node)}
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                필요 {formatNumber(node.required)}
                {node.perWork !== undefined ? `, 공정마다 ${formatNumber(node.perWork)}개` : ''}
              </Text>
              {node.recipes.length > 0 ? methodSelect(node) : null}
            </Flex>
          ),
        },
        {
          title: '가진 개수',
          key: 'owned',
          width: 96,
          align: 'right',
          render: (_value, { node }) => ownedCell(node),
        },
        {
          title: '부족',
          key: 'short',
          width: 56,
          align: 'right',
          render: (_value, { node }) => shortCell(node),
        },
      ]
    : [
        { title: '재료', key: 'name', render: (_value, { node }) => nameCell(node) },
        {
          title: '필요',
          key: 'required',
          width: 120,
          align: 'right',
          render: (_value, { node }) => requiredCell(node),
        },
        {
          title: '가진 개수',
          key: 'owned',
          width: 130,
          align: 'right',
          render: (_value, { node }) => ownedCell(node),
        },
        {
          title: '부족',
          key: 'short',
          width: 90,
          align: 'right',
          render: (_value, { node }) => shortCell(node),
        },
        {
          title: '마련 방법',
          key: 'method',
          width: 260,
          render: (_value, { node }) => methodSelect(node),
        },
      ];

  const hasOwned = Object.keys(target.owned).length > 0;

  return (
    <Card>
      <Flex vertical gap={12}>
        <Flex gap={12} align="flex-end" wrap justify="space-between">
          <Flex gap={12} align="flex-end" wrap style={{ minWidth: 0 }}>
            <Flex vertical gap={4}>
              <Text type="secondary">목표</Text>
              <MemoItem
                book={book}
                itemId={target.itemId}
                size={32}
                suffix={
                  plan.recipe ? (
                    prepared ? (
                      <Tag color="success" style={{ marginInlineEnd: 0 }}>
                        모두 준비
                      </Tag>
                    ) : (
                      <Tag className="tnum" style={{ marginInlineEnd: 0 }}>
                        부족 {formatNumber(missing)}종
                      </Tag>
                    )
                  ) : null
                }
              />
            </Flex>
            <Flex vertical gap={4}>
              <Text type="secondary">만들 개수</Text>
              <InputNumber
                min={1}
                max={MAX_COUNT}
                precision={0}
                value={target.count}
                onChange={(value) => setTargetCount(target.id, value ?? 1)}
                aria-label={`${book.itemName(target.itemId)} 만들 개수`}
                style={{ width: 100 }}
              />
            </Flex>
            {plan.recipe && hasWorks(plan.recipe) ? (
              <Flex vertical gap={4}>
                <Text type="secondary">공정 수</Text>
                <InputNumber
                  min={1}
                  max={99}
                  precision={0}
                  value={target.works ?? DEFAULT_WORKS}
                  onChange={(value) => setTargetWorks(target.id, value ?? undefined)}
                  aria-label={`${book.itemName(target.itemId)} 공정 수`}
                  style={{ width: 80 }}
                />
              </Flex>
            ) : null}
            {roots.length > 1 && plan.recipe ? (
              <Flex vertical gap={4} style={{ minWidth: 0 }}>
                <Text type="secondary">제작법 {roots.length}가지</Text>
                <Select
                  value={plan.recipe.index}
                  onChange={(index) => {
                    setTargetRecipe(target.id, index);
                    setExpanded([]);
                  }}
                  aria-label={`${book.itemName(target.itemId)} 제작법`}
                  popupMatchSelectWidth={false}
                  options={roots.map((each, order) => ({
                    value: each.index,
                    label: `${order + 1}. ${recipeTitle(book, each)} - ${materialSummary(book, each)}`,
                  }))}
                  style={{ minWidth: 200, maxWidth: '100%' }}
                />
              </Flex>
            ) : null}
          </Flex>
          <Flex gap={8} wrap>
            <Button
              icon={<ResetIcon />}
              disabled={!hasOwned}
              onClick={() => clearOwned(target.id)}
            >
              가진 개수 비우기
            </Button>
            <Button danger icon={<DeleteIcon />} onClick={() => removeTarget(target.id)}>
              삭제
            </Button>
          </Flex>
        </Flex>

        {plan.recipe ? (
          <Table<Row>
            size="small"
            pagination={false}
            columns={columns}
            dataSource={toRows(plan.nodes)}
            expandable={{
              expandedRowKeys: expanded,
              onExpandedRowsChange: (keys) => setExpanded(keys.map(String)),
              indentSize: 20,
            }}
          />
        ) : (
          <Alert type="warning" showIcon message="이 아이템의 제작법을 찾을 수 없습니다" />
        )}
      </Flex>
    </Card>
  );
}
