import { useCallback, useMemo } from 'react';
import { Alert, Button, Card, Flex, Popconfirm, Skeleton, Typography } from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { DeleteIcon } from '@/components/icons';
import { ShortageTable } from '@/components/materialMemo/ShortageTable';
import { TargetCard } from '@/components/materialMemo/TargetCard';
import { TargetPicker } from '@/components/materialMemo/TargetPicker';
import { npcUnitPrice } from '@/features/crafting/npcPrices';
import { useRecipeBookQuery } from '@/features/crafting/recipes';
import { buildMemoPlan, mergeShortages } from '@/features/materialMemo/plan';
import { clearTargets, useMemoState } from '@/features/materialMemo/store';

const { Title } = Typography;

/**
 * 제작 재료 메모. 만들 아이템과 개수를 정하고 재료 트리에 가진 개수를 적어 두면, 모자란 재료만 남는다.
 * 목표와 가진 개수는 이 브라우저에 남긴다(features/materialMemo/store.ts). 시세는 다루지 않는다.
 */
export function MaterialMemoPage() {
  const { data: book, isPending } = useRecipeBookQuery();
  const { targets } = useMemoState();

  // 경매장에서 거래되거나 NPC 가 파는 재료는 구하는 쪽이 기본이다. 나머지는 제작법이 있으면 만든다.
  const isBuyable = useCallback(
    (itemId: number) =>
      book !== undefined &&
      book !== null &&
      (book.isTradable(itemId) || npcUnitPrice(book.itemName(itemId), false) !== undefined),
    [book],
  );

  const plans = useMemo(
    () => (book ? targets.map((target) => buildMemoPlan(book, target, { isBuyable })) : []),
    [book, targets, isBuyable],
  );
  const merged = useMemo(() => mergeShortages(plans), [plans]);

  return (
    <Flex vertical gap={16}>
      <Flex gap={12} align="center" justify="space-between" wrap>
        <Title level={3} style={{ margin: 0 }}>
          제작 재료 메모
        </Title>
        {targets.length > 0 ? (
          <Popconfirm
            title="목표를 모두 지울까요?"
            okText="지우기"
            cancelText="취소"
            okButtonProps={{ danger: true }}
            onConfirm={clearTargets}
          >
            <Button icon={<DeleteIcon />}>모두 지우기</Button>
          </Popconfirm>
        ) : null}
      </Flex>

      {isPending ? (
        <Card>
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      ) : !book ? (
        <Alert type="error" showIcon role="alert" message="제작법 데이터를 받지 못했습니다" />
      ) : (
        <>
          <Card>
            <TargetPicker book={book} />
          </Card>

          {targets.length === 0 ? (
            <Card>
              <EmptyState variant="search" description="만들 아이템을 추가하면 재료 트리가 나옵니다" />
            </Card>
          ) : (
            <>
              <ShortageTable book={book} rows={merged} />
              {targets.map((target, index) => (
                <TargetCard key={target.id} book={book} target={target} plan={plans[index]} />
              ))}
            </>
          )}
        </>
      )}
    </Flex>
  );
}
