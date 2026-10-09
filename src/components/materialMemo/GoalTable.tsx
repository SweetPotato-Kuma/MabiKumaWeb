import { useRef, type ReactNode } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Flex,
  InputNumber,
  Spin,
  Statistic,
  Table,
  Typography,
  theme,
} from 'antd';
import type { ColumnType } from 'antd/es/table';
import { TotalNotes } from '@/components/crafting/CraftingCost';
import {
  toTreeRows,
  treeColumns,
  useSlidingRows,
  type TreeRow,
} from '@/components/crafting/craftTree';
import { DeleteIcon } from '@/components/icons';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { WEDNESDAY_DISCOUNT_PERCENT } from '@/features/crafting/npcPrices';
import { isBuying, isComplete, type Method } from '@/features/crafting/plan';
import {
  allBeadsOn,
  beadOptionsOf,
  chooseMethod,
  clearSourceChoices,
  toggleAllBeads,
  toggleBeads,
} from '@/features/crafting/treeChoices';
import type { useMemoPlan } from '@/features/materialMemo/useMemoPlan';
import {
  MAX_QUANTITY,
  removeGoal,
  setOwned,
  setQuantity,
  updateChoices,
  type MemoState,
} from '@/features/materialMemo/store';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 요약 칸의 작은 숫자. 필요 금액만 크게 둔다. */
const SMALL_STAT = {
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  fontSize: 20,
} as const;

interface GoalTableProps {
  state: MemoState;
  memo: ReturnType<typeof useMemoPlan>;
}

/**
 * 목표들의 재료 트리. 아이템 정보의 제작 비용과 같은 표(재료, 구매 방법, 매물, 개당 최저가, 금액)에
 * 가진 개수와 부족한 개수 칸을 더했다. 맨 위 줄이 목표 아이템이고, 개수를 고치거나 지울 수 있다.
 */
export function GoalTable({ state, memo }: GoalTableProps) {
  const {
    book,
    plan,
    goldPlan,
    coins,
    coinOf,
    coinNeeds,
    expanded,
    setExpanded,
    useNpc,
    setUseNpc,
    wednesday,
    setWednesday,
    todayIsWednesday,
  } = memo;
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();
  const tableRef = useRef<HTMLDivElement>(null);
  useSlidingRows(tableRef);

  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];
  const goalById = new Map(state.goals.map((goal) => [goal.id, goal]));

  const setMethod = (key: string, method: Method) => {
    updateChoices((prev) => chooseMethod(prev, plan.nodes, key, method));
    // 제작으로 바꾸면 무엇이 들어가는지 바로 보이게 펼친다.
    if (!isBuying(method)) setExpanded((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };
  const setBeads = (key: string, on: boolean, offMethod: Method) =>
    updateChoices((prev) => toggleBeads(prev, plan.nodes, key, on, offMethod));
  const beadOptions = beadOptionsOf(plan.nodes);
  const changeUseNpc = (next: boolean) => {
    setUseNpc(next);
    updateChoices(clearSourceChoices);
  };

  const base = treeColumns(
    book,
    setMethod,
    setBeads,
    categoryOf,
    coinOf,
    { background: token.colorFillQuaternary },
    formatGold,
  ) as ColumnType<TreeRow>[];
  const column = (key: string) => base.find((each) => each.key === key) as ColumnType<TreeRow>;
  const baseCell = (key: string, row: TreeRow, index: number): ReactNode =>
    column(key).render?.(undefined, row, index) as ReactNode;
  const nodeOf = (row: TreeRow) => ('node' in row ? row.node : undefined);

  const columns: ColumnType<TreeRow>[] = [
    {
      ...column('name'),
      title: '목표 / 재료',
      width: 320,
      render: (_value, row, index) => {
        const goal = goalById.get(row.key);
        const content = baseCell('name', row, index);
        if (!goal) return content;
        return (
          <Flex gap={8} align="center" justify="space-between">
            <div style={{ minWidth: 0 }}>{content}</div>
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteIcon />}
              aria-label={`${goal.name} 목표 삭제`}
              onClick={() => removeGoal(goal.id)}
            />
          </Flex>
        );
      },
    },
    {
      ...column('required'),
      title: '필요 개수',
      width: 120,
      render: (_value, row, index) => {
        const goal = goalById.get(row.key);
        if (!goal) return baseCell('required', row, index);
        return (
          <InputNumber
            size="small"
            min={1}
            max={MAX_QUANTITY}
            precision={0}
            value={goal.quantity}
            onChange={(value) => setQuantity(goal.id, value ?? 1)}
            aria-label={`${goal.name} 목표 개수`}
            className="tnum"
            style={{ width: 96 }}
          />
        );
      },
    },
    {
      title: '가진 개수',
      key: 'owned',
      width: 110,
      align: 'right',
      render: (_value, row) => {
        const node = nodeOf(row);
        if (!node) return null;
        return (
          <InputNumber
            size="small"
            min={0}
            max={MAX_QUANTITY}
            precision={0}
            value={node.owned}
            onChange={(value) => setOwned(node.key, value ?? 0)}
            aria-label={`${book.itemName(node.itemId)} 가진 개수`}
            className="tnum"
            style={{ width: 96 }}
          />
        );
      },
    },
    {
      title: '부족',
      key: 'short',
      width: 80,
      align: 'right',
      render: (_value, row) => {
        const node = nodeOf(row);
        if (!node) return null;
        if (node.required === 0) return <Text type="secondary">-</Text>;
        if (node.short === 0) return <Text type="success">완료</Text>;
        return (
          <Text strong className="tnum" style={{ whiteSpace: 'nowrap' }}>
            {formatNumber(node.short)}
          </Text>
        );
      },
    },
    column('method'),
    column('supply'),
    column('lowest'),
    column('cost'),
  ];

  return (
    <Card>
      <Flex vertical gap={16}>
        <Flex gap={20} wrap align="flex-end">
          <Statistic
            title="필요 금액"
            value={formatGold(plan.total.gold)}
            styles={{ content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}
          />
          {goldPlan ? (
            <Statistic
              title="코인 없이 산다면"
              value={formatGold(goldPlan.total.gold)}
              // 매물이 모자란 재료는 채운 만큼만 들어 있어 실제로는 이보다 비싸다.
              suffix={
                goldPlan.total.pending === 0 && !isComplete(goldPlan.total) ? '이상' : undefined
              }
              styles={{ content: SMALL_STAT, suffix: { fontSize: 14 } }}
            />
          ) : null}
          {coins.map((coin) => (
            <Statistic
              key={coin}
              title={`필요한 ${coin}`}
              value={`${formatNumber(coinNeeds.find((need) => need.coin === coin)?.total ?? 0)}개`}
              styles={{ content: SMALL_STAT }}
            />
          ))}
        </Flex>
        {/* 시세를 받는 동안만 나타나므로 자리를 비워 둔다. 나타날 때 아래 표가 밀리지 않게 한다. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', height: 22, marginTop: -8 }}>
          {plan.total.pending > 0 ? (
            <>
              <Spin size="small" />
              <Text type="secondary" style={{ fontSize: 13 }}>
                시세 {formatNumber(plan.total.pending)}종을 받는 중입니다
              </Text>
            </>
          ) : null}
        </div>
        {/* 세로로 쌓으면 체크박스가 줄 폭만큼 늘어나 빈 곳을 눌러도 켜진다. 글자 폭만큼만 둔다. */}
        <Flex vertical gap={8} align="flex-start">
          <Checkbox checked={useNpc} onChange={(event) => changeUseNpc(event.target.checked)}>
            NPC 판매 재료는 NPC 에서 사기
          </Checkbox>
          {beadOptions.length > 0 ? (
            <Checkbox
              checked={allBeadsOn(beadOptions)}
              onChange={(event) =>
                updateChoices((prev) => toggleAllBeads(prev, beadOptions, event.target.checked))
              }
            >
              코인 구매 전체 선택
            </Checkbox>
          ) : null}
          <Checkbox checked={wednesday} onChange={(event) => setWednesday(event.target.checked)}>
            수요일 상점 할인 {WEDNESDAY_DISCOUNT_PERCENT}% 적용
            {todayIsWednesday ? ' (오늘 수요일)' : ''}
          </Checkbox>
        </Flex>
        <TotalNotes book={book} total={plan.total} shopping={plan.shopping} />

        <div ref={tableRef}>
          <Table<TreeRow>
            columns={columns}
            dataSource={toTreeRows(plan.nodes)}
            rowKey="key"
            size="small"
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 'max-content' }}
            onRow={(row) =>
              goalById.has(row.key) ? { style: { background: token.colorFillQuaternary } } : {}
            }
            expandable={{
              expandedRowKeys: expanded,
              onExpand: (open, row) =>
                setExpanded((prev) =>
                  open ? [...prev, row.key] : prev.filter((key) => key !== row.key),
                ),
              indentSize: 16,
            }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={columns.length - 1}>
                  <Text strong>합계</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong className="tnum" style={{ whiteSpace: 'nowrap' }}>
                    {formatGold(plan.total.gold)}
                  </Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      </Flex>
    </Card>
  );
}
