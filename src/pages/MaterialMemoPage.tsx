import { Alert, Button, Card, Flex, Popconfirm, Skeleton, Typography } from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { DeleteIcon, ResetIcon } from '@/components/icons';
import { GoalPicker } from '@/components/materialMemo/GoalPicker';
import { GoalTable } from '@/components/materialMemo/GoalTable';
import { MaterialSummary } from '@/components/materialMemo/MaterialSummary';
import { useRecipeBookQuery, type RecipeBook } from '@/features/crafting/recipes';
import { clearGoals, clearOwned, useMemoState } from '@/features/materialMemo/store';
import { useMemoPlan } from '@/features/materialMemo/useMemoPlan';
import { useCanQuery } from '@/lib/settings';

const { Title } = Typography;

/**
 * 목표 아이템 재료 메모. 만들거나 모을 아이템과 개수를 목표로 달아 두고, 아이템 정보의 제작 비용과 같은
 * 재료 트리에서 구하는 방법을 고르며 가진 개수를 적어 둔다. 제작하지 않는 아이템도 목표가 되고 그때는
 * 사는 값만 나온다. 목표와 가진 개수는 이 브라우저에 남긴다(features/materialMemo/store.ts).
 */
export function MaterialMemoPage() {
  const { data: book, isPending } = useRecipeBookQuery();
  const canQuery = useCanQuery();

  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        목표 아이템 재료 메모
      </Title>

      {!canQuery ? (
        <Alert
          type="warning"
          showIcon
          message="지금은 경매장 시세를 받을 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      {isPending ? (
        <Card>
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      ) : !book ? (
        <Alert type="error" showIcon role="alert" message="제작법 데이터를 받지 못했습니다" />
      ) : (
        <MemoBody base={book} />
      )}
    </Flex>
  );
}

function MemoBody({ base }: { base: RecipeBook }) {
  const state = useMemoState();
  const memo = useMemoPlan(base, state);
  const hasGoals = state.goals.length > 0;
  const hasOwned = Object.keys(state.owned).length > 0;

  return (
    <>
      <Card>
        <Flex vertical gap={12}>
          <GoalPicker
            book={base}
            onAdded={(id) => memo.setExpanded((prev) => (prev.includes(id) ? prev : [...prev, id]))}
          />
          {hasGoals ? (
            <Flex gap={8} wrap>
              <Button icon={<ResetIcon />} disabled={!hasOwned} onClick={clearOwned}>
                가진 개수 비우기
              </Button>
              <Popconfirm
                title="목표를 모두 지울까요?"
                okText="지우기"
                cancelText="취소"
                okButtonProps={{ danger: true }}
                onConfirm={clearGoals}
              >
                <Button icon={<DeleteIcon />}>모두 지우기</Button>
              </Popconfirm>
            </Flex>
          ) : null}
        </Flex>
      </Card>

      {hasGoals ? (
        <>
          <MaterialSummary book={memo.book} nodes={memo.plan.nodes} />
          <GoalTable state={state} memo={memo} />
        </>
      ) : (
        <Card>
          <EmptyState variant="search" description="목표 아이템을 추가하면 재료 트리가 나옵니다" />
        </Card>
      )}
    </>
  );
}
