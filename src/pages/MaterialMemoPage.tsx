import { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Card, Flex, Popconfirm, Skeleton, Typography } from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { DeleteIcon } from '@/components/icons';
import { CostSummary } from '@/components/materialMemo/CostParts';
import { TargetCard } from '@/components/materialMemo/TargetCard';
import { TargetPicker } from '@/components/materialMemo/TargetPicker';
import { useMarketPrices } from '@/features/crafting/market';
import { isWednesdayInKorea, npcUnitPrice } from '@/features/crafting/npcPrices';
import { useRecipeBookQuery } from '@/features/crafting/recipes';
import { costOf, priceNamesOf, sumCosts, type ItemCost } from '@/features/materialMemo/cost';
import { buildMemoPlan, mergeShortages } from '@/features/materialMemo/plan';
import { clearTargets, useMemoState } from '@/features/materialMemo/store';
import { useCanQuery } from '@/lib/settings';

const { Title } = Typography;

/**
 * 제작 재료 메모. 만들 아이템과 개수를 정하고 재료 트리에 가진 개수를 적어 두면, 모자란 재료와 그 재료를
 * 사는 값이 나온다. 목표와 가진 개수는 이 브라우저에 남긴다(features/materialMemo/store.ts).
 * 모자란 재료의 시세만 묻는다. 가진 재료는 묻지 않는다.
 */
export function MaterialMemoPage() {
  const { data: book, isPending } = useRecipeBookQuery();
  const { targets } = useMemoState();
  const canQuery = useCanQuery();
  const [wednesday] = useState(() => isWednesdayInKorea());

  const npcUnitOf = useCallback(
    (itemId: number) => (book ? npcUnitPrice(book.itemName(itemId), wednesday) : undefined),
    [book, wednesday],
  );

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

  const names = useMemo(
    () =>
      book && canQuery
        ? priceNamesOf(merged, book.itemName, book.isTradable, npcUnitOf)
        : [],
    [book, canQuery, merged, npcUnitOf],
  );
  const prices = useMarketPrices(names);

  const costFor = useCallback(
    (itemId: number, required: number): ItemCost => {
      if (!book) return { status: 'error', gold: 0, shortfall: false };
      return costOf(required, {
        tradable: book.isTradable(itemId),
        npcUnit: npcUnitOf(itemId),
        // 시세를 받을 수 없는 환경에서는 영영 기다리지 않고 값을 모른다고 한다.
        price: canQuery ? prices.get(book.itemName(itemId)) : { status: 'error', error: null },
      });
    },
    [book, canQuery, npcUnitOf, prices],
  );

  const total = sumCosts(
    merged.filter((row) => row.short > 0).map((row) => costFor(row.itemId, row.short)),
  );

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
              {targets.length > 1 ? (
                <Card>
                  <CostSummary label="전체 필요 금액" total={total} />
                </Card>
              ) : null}
              {targets.map((target, index) => (
                <TargetCard
                  key={target.id}
                  book={book}
                  target={target}
                  plan={plans[index]}
                  costFor={costFor}
                />
              ))}
            </>
          )}
        </>
      )}
    </Flex>
  );
}
