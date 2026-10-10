/**
 * 재료 트리 표. 아이템 정보의 제작 비용(CraftingCost)과 재료 메모가 같은 표를 쓴다.
 * 줄을 새 자리로 미끄러뜨리는 훅, 트리 줄, 칸 정의가 들어 있다.
 */
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Checkbox, Flex, Select, Tag, Typography, type TableColumnsType } from 'antd';
import type { ColumnType } from 'antd/es/table';
import {
  CostText,
  LowestPrice,
  MATERIAL_ICON,
  MaterialIconSlot,
} from '@/components/crafting/craftTreeCells';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { beadsToMake, makesFromBeads } from '@/features/dungeonCoins/subBeads';
import {
  isBuying,
  isComplete,
  type CostSum,
  type Method,
  type PlanNode,
} from '@/features/crafting/plan';
import { recipeTitle, type RecipeBook } from '@/features/crafting/recipes';
import { formatNumber } from '@/lib/format';
import { type GoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 줄이 새 자리로 미끄러지는 시간. 눈에 걸리지 않을 만큼 짧게 둔다. */
const ROW_MOVE_MS = 200;
const ROW_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
/** 이동 애니메이션의 이름. 나타나는 애니메이션과 갈라 이동만 새로 건다. */
const ROW_MOVE_ID = 'row-move';

const canAnimate = (element: HTMLElement) =>
  typeof element.animate === 'function' &&
  !(
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

/**
 * 트리 표의 줄을 새 자리로 미끄러뜨린다(FLIP).
 *
 * 재료를 펼치면 하위 줄이 끼어들고 그 아래 줄이 한 번에 밀려나 덜컹거린다. 시세가 들어와 줄 높이가
 * 바뀔 때도 그렇다. 그래서 그릴 때마다 줄의 자리를 적어 두고, 다음에 그렸을 때 자리가 바뀐 줄은
 * 예전 자리에서 새 자리로 옮겨 가게 한다. 새로 생긴 줄은 흐리게 시작해 나타난다.
 *
 * 높이를 움직이면 표 전체를 매 프레임 다시 재야 해서 transform 과 opacity 만 쓴다. 자리는 transform 을
 * 뺀 제자리로 적어, 움직이던 중에 다시 그려도 보이던 자리에서 이어 간다.
 * CSS 파일에 컴포넌트 스타일을 두지 않는 규칙이라 Web Animations API 로 건다. 움직임 줄이기 설정을 따른다.
 */
/** 줄에 지금 걸린 세로 이동량. 움직이는 중이면 그 순간의 값이다. */
function currentShiftY(row: HTMLElement): number {
  const transform = getComputedStyle(row).transform;
  if (!transform || transform === 'none' || typeof DOMMatrixReadOnly === 'undefined') return 0;
  return new DOMMatrixReadOnly(transform).m42;
}

export function useSlidingRows(containerRef: RefObject<HTMLDivElement | null>) {
  const lastTops = useRef<Map<string, number> | null>(null);
  useLayoutEffect(() => {
    const table = containerRef.current?.querySelector('table');
    if (!table) return;
    const rows = [
      ...table.querySelectorAll<HTMLTableRowElement>('tbody tr[data-row-key], tfoot tr'),
    ];
    const tableTop = table.getBoundingClientRect().top;
    const previous = lastTops.current;
    const next = new Map<string, number>();

    let footOrder = 0;
    rows.forEach((row) => {
      // 합계 줄은 키가 없다. 몇 번째 줄인지로 부르되 본문 줄 수와 상관없게 tfoot 안에서만 센다.
      const key = row.dataset.rowKey ?? `foot:${footOrder++}`;
      // 보이는 자리에서 지금 걸린 transform 을 빼면 제자리다. offsetTop 은 합계 줄에서 기준이 tfoot 이라 못 쓴다.
      const shown = row.getBoundingClientRect().top - tableTop;
      const shift = currentShiftY(row);
      const top = shown - shift;
      next.set(key, top);
      if (!previous || !canAnimate(row)) return;

      const before = previous.get(key);
      if (before === undefined) {
        row.animate(
          [
            { opacity: 0, transform: 'translateY(-6px)' },
            { opacity: 1, transform: 'none' },
          ],
          { id: 'row-enter', duration: ROW_MOVE_MS, easing: ROW_EASING },
        );
        return;
      }
      // 제자리가 그대로면 움직이던 것은 그대로 끝까지 가게 둔다. 시세만 들어와 다시 그린 경우다.
      if (Math.abs(before - top) < 1) return;
      // 지금 걸려 있는 transform 만큼 더해, 방금 보이던 자리에서 출발한다. 나타나는 중인 줄의
      // 흐려짐은 그대로 두고 이동만 새로 건다.
      const from = before + shift - top;
      row
        .getAnimations()
        .filter((animation) => animation.id === ROW_MOVE_ID)
        .forEach((animation) => animation.cancel());
      row.animate([{ transform: `translateY(${from}px)` }, { transform: 'none' }], {
        id: ROW_MOVE_ID,
        duration: ROW_MOVE_MS,
        easing: ROW_EASING,
      });
    });
    lastTops.current = next;
  });
}

export interface ItemRow {
  key: string;
  node: PlanNode;
  children?: ItemRow[];
}

/** 공정 재료와 마감 재료를 가르는 머리 줄. 그 구역의 소계를 금액 칸에 적는다. */
interface SectionRow {
  key: string;
  section: { title: string; note: string; cost: CostSum };
}

export type TreeRow = ItemRow | SectionRow;

const isSection = (row: TreeRow): row is SectionRow => 'section' in row;

/**
 * 표의 줄. 마감 재료가 있는 제작법은 공정 재료와 마감 재료를 구역으로 나누고, 구역마다 머리 줄을
 * 둔다. 같은 표 안에 두어야 칸이 어긋나지 않는다.
 */
export function treeRowsOf(
  nodes: PlanNode[],
  sections: { work: CostSum; finish: CostSum } | undefined,
  works: number,
): TreeRow[] {
  if (!sections) return toTreeRows(nodes);
  return [
    {
      key: 'section:work',
      section: { title: '공정 재료', note: `${formatNumber(works)}공정`, cost: sections.work },
    },
    ...toTreeRows(nodes.filter((node) => !node.finish)),
    {
      key: 'section:finish',
      section: { title: '마감 재료', note: '마감할 때 한 번', cost: sections.finish },
    },
    ...toTreeRows(nodes.filter((node) => node.finish)),
  ];
}

/**
 * antd 트리 표의 줄. 만들 수 있는 재료는 하위 재료를 아직 계산하지 않았어도 빈 children 을 달아
 * 펼침 단추가 나오게 한다. 펼치면 계산이 하위 재료를 채운다.
 */
export function toTreeRows(nodes: PlanNode[]): ItemRow[] {
  return nodes.map((node) => ({
    key: node.key,
    node,
    ...(node.recipes.length > 0 ? { children: toTreeRows(node.children ?? []) } : {}),
  }));
}

export function treeColumns(
  book: RecipeBook,
  setMethod: (key: string, method: Method) => void,
  setBeads: (key: string, on: boolean, offMethod: Method) => void,
  categoryOf: (name: string) => string | undefined,
  /** 이 재료를 코인으로 살 때나 구슬로 만들 때 내는 코인. 없으면 코인 칸이 없다. */
  coinOf: (itemId: number) => string | undefined,
  sectionStyle: CSSProperties,
  formatGold: GoldFormatter,
): TableColumnsType<TreeRow> {
  const itemColumns: ColumnType<ItemRow>[] = [
    {
      title: '재료',
      key: 'name',
      width: 280,
      render: (_value, { node }) => {
        const name = book.itemName(node.itemId);
        const category = categoryOf(name);
        const file = book.iconOf(node.itemId);
        return (
          <Flex gap={8} align="center">
            {category || file ? (
              <ItemIcon category={category} name={name} file={file} size={MATERIAL_ICON} />
            ) : (
              <MaterialIconSlot />
            )}
            <Flex gap={6} align="center" wrap style={{ minWidth: 0 }}>
              <ItemInfoLink name={name} category={category} />
              {node.finish && node.depth > 0 ? <Tag>마감</Tag> : null}
            </Flex>
          </Flex>
        );
      },
    },
    {
      title: '필요 개수',
      key: 'required',
      width: 100,
      align: 'right',
      render: (_value, { node }) => (
        <Flex vertical align="flex-end">
          <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
            {formatNumber(node.required)}
          </Text>
          {node.perWork !== undefined ? (
            <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              공정마다 {formatNumber(node.perWork)}개
            </Text>
          ) : null}
          {!isBuying(node.method) && node.yieldCount > 1 ? (
            <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {formatNumber(node.yieldCount)}개씩 {formatNumber(node.crafts)}번
            </Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: '구매 방법',
      key: 'method',
      width: 470,
      render: (_value, { node }) => {
        const coin = coinOf(node.itemId);
        const npcSold = node.npcUnit !== undefined;
        const buyMethod = node.tradable ? 'buy' : npcSold ? 'npc' : undefined;
        const byCoin = node.method === 'coin';
        const coinCheckbox =
          node.coinUnit !== undefined ? (
            <Checkbox
              checked={byCoin}
              disabled={byCoin && buyMethod === undefined}
              onChange={(event) =>
                setMethod(node.key, event.target.checked ? 'coin' : (buyMethod ?? 'buy'))
              }
            >
              <Text className="tnum" style={{ fontSize: 12 }}>
                {coin} {formatNumber(node.coinUnit * node.short)}개로 구매
              </Text>
            </Checkbox>
          ) : null;
        if (node.recipes.length === 0 && !npcSold)
          return (
            <Flex gap={8} align="center" wrap>
              <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                {byCoin ? '코인 구매' : node.tradable ? '경매장 구매' : '거래 불가'}
              </Text>
              {coinCheckbox}
            </Flex>
          );
        const beads =
          coin && node.recipes.length > 0 && makesFromBeads(book, coin, node.itemId)
            ? beadsToMake(book, coin, node.itemId, node.short)
            : 0;
        return (
          <Flex gap={8} align="center" wrap>
            <Select<Method>
              size="small"
              value={node.method}
              onChange={(method) => setMethod(node.key, method)}
              aria-label={`${book.itemName(node.itemId)} 구매 방법`}
              popupMatchSelectWidth={false}
              options={[
                {
                  value: 'buy',
                  label: node.tradable ? '경매장 구매' : '경매장 구매 (거래 불가)',
                  disabled: !node.tradable,
                },
                ...(npcSold
                  ? [{ value: 'npc' as const, label: `NPC 구매 (${formatGold(node.npcUnit)})` }]
                  : []),
                ...(node.coinUnit !== undefined
                  ? [{ value: 'coin' as const, label: '코인 구매' }]
                  : []),
                ...node.recipes.map((each) => ({
                  value: each.index,
                  label: `제작: ${recipeTitle(book, each)}`,
                })),
              ]}
              style={{ minWidth: 150 }}
            />
            {beads > 0 ? (
              <Checkbox
                checked={node.byBeads || node.beadsAll === true}
                onChange={(event) =>
                  setBeads(node.key, event.target.checked, buyMethod ?? node.recipes[0].index)
                }
              >
                <Text className="tnum" style={{ fontSize: 12 }}>
                  {coin} {formatNumber(beads)}개로 만들기
                </Text>
              </Checkbox>
            ) : null}
            {coinCheckbox}
          </Flex>
        );
      },
    },
    {
      title: '매물',
      key: 'supply',
      width: 90,
      align: 'right',
      render: (_value, { node }) =>
        node.price.status === 'npc' ? (
          <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
            NPC 판매
          </Text>
        ) : node.price.status === 'ok' && node.price.price.offers.length > 0 ? (
          <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
            {formatNumber(node.price.price.supply)}개{node.price.price.complete ? '' : ' 이상'}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '개당 최저가',
      key: 'lowest',
      width: 110,
      align: 'right',
      render: (_value, { node }) => <LowestPrice price={node.price} lowest={node.quote?.lowest} />,
    },
    {
      title: '금액',
      key: 'cost',
      width: 130,
      align: 'right',
      render: (_value, { node }) => {
        const other =
          node.method === 'coin'
            ? isComplete(node.buyCost)
              ? `경매장 ${formatGold(node.buyCost.gold)}`
              : ''
            : isBuying(node.method)
              ? node.craftCost && isComplete(node.craftCost)
                ? `제작 시 ${formatGold(node.craftCost.gold)}`
                : ''
              : isComplete(node.buyCost)
                ? `구매 시 ${formatGold(node.buyCost.gold)}`
                : '';
        return (
          <Flex vertical align="flex-end">
            <CostText cost={node.cost} />
            {other ? (
              <Text
                type="secondary"
                className="tnum"
                style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              >
                {other}
              </Text>
            ) : null}
          </Flex>
        );
      },
    },
  ];

  // 구역 머리 줄은 재료 칸을 금액 앞까지 넓혀 제목을 적고, 금액 칸에 소계를 적는다.
  const last = itemColumns.length - 1;
  return itemColumns.map((column, index): ColumnType<TreeRow> => ({
    ...(column as ColumnType<TreeRow>),
    onCell: (row) =>
      isSection(row)
        ? { colSpan: index === 0 ? last : index === last ? 1 : 0, style: sectionStyle }
        : {},
    render: (value, row, rowIndex) => {
      // 재료 줄의 칸은 모두 ReactNode 를 돌려준다(RenderedCell 을 쓰지 않는다).
      if (!isSection(row)) return column.render?.(value, row, rowIndex) as ReactNode;
      if (index === last) return <CostText cost={row.section.cost} strong />;
      if (index > 0) return null;
      return (
        <Flex gap={8} align="baseline">
          <Text strong>{row.section.title}</Text>
          <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
            {row.section.note}
          </Text>
        </Flex>
      );
    },
  }));
}
