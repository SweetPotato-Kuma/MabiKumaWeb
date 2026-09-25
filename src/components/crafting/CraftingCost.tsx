import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import {
  Card,
  Checkbox,
  Flex,
  Form,
  InputNumber,
  Select,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from 'antd';
import { ItemIcon } from '@/components/ItemIcon';
import { isCardStoreConfigured } from '@/features/itemcard/cards';
import { isIconMapConfigured } from '@/features/itemcard/iconMap';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { useMarketPrices } from '@/features/crafting/market';
import {
  isWednesdayInKorea,
  NPC_MATERIALS,
  npcUnitPrice,
  WEDNESDAY_DISCOUNT_PERCENT,
} from '@/features/crafting/npcPrices';
import {
  buildPlan,
  isComplete,
  type CostSum,
  type Method,
  type NodePrice,
  type PlanNode,
  type ShoppingRow,
} from '@/features/crafting/plan';
import {
  materialSummary,
  recipeTitle,
  stationNote,
  type Recipe,
  type RecipeBook,
} from '@/features/crafting/recipes';
import { formatGold, formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 한 번에 계산할 수 있는 최대 개수. 이보다 많으면 매물을 몇 쪽 받아도 모자라 값이 뜻을 잃는다. */
const MAX_QUANTITY = 9999;

/**
 * 작업을 여러 번 하는 스킬. 천옷만들기와 블랙스미스는 작업 한 번에 진행도가 조금씩 오르고,
 * 작업할 때마다 작업 재료를 다시 넣는다. 몇 번 만에 끝날지는 랭크와 운에 달려 있어 셀 수 없다.
 */
const PROGRESS_SKILLS = new Set([10001, 10016]);

/** 재료 그림 칸. 표 한 줄 높이를 크게 늘리지 않으면서 알아볼 수 있는 크기. */
const MATERIAL_ICON = 32;

/** 트리 표의 칸 수. 합계 줄이 앞 칸들을 한 칸으로 묶을 때 쓴다. */
const TREE_COLUMN_COUNT = 6;

interface CraftingCostProps {
  book: RecipeBook;
  /** 같은 아이템을 만드는 제작법들. 둘 이상이면 고르는 칸이 생긴다. */
  recipes: Recipe[];
  /** 처음에 고를 제작법(Recipe.index). */
  initialRecipe?: number;
}

/**
 * 제작 비용. 아이템 정보 상세 안에 들어간다.
 *
 * 카드 하나에 제작법과 총액, 그 아래 재료 트리를 둔다. 예전에는 살 재료를 따로 모은 표가 있었지만
 * 트리와 같은 줄이 되풀이될 뿐이라 합계 줄 하나로 줄였다. 트리의 줄마다 "구매" 와 "제작" 을 고를 수
 * 있고, 제작을 고르면 그 재료의 재료가 값에 들어간다. 계산은 features/crafting/plan.ts.
 */
export function CraftingCost({ book, recipes, initialRecipe }: CraftingCostProps) {
  const [recipeIndex, setRecipeIndex] = useState(
    () => recipes.find((recipe) => recipe.index === initialRecipe)?.index ?? recipes[0]?.index,
  );
  const recipe = recipes.find((each) => each.index === recipeIndex) ?? recipes[0];
  if (!recipe) return null;

  const header = (
    <Flex vertical gap={12}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {[recipeTitle(book, recipe), stationNote(recipe)].filter(Boolean).join(', ')}
        {recipe.yield > 1 ? ` (한 번에 ${formatNumber(recipe.yield)}개)` : ''}
      </Text>
      {recipes.length > 1 ? (
        <Form layout="vertical" style={{ marginBottom: 0 }}>
          <Form.Item
            label={`제작법 ${recipes.length}가지`}
            htmlFor="crafting-recipe"
            style={{ marginBottom: 0 }}
          >
            <Select
              id="crafting-recipe"
              value={recipe.index}
              onChange={setRecipeIndex}
              options={recipes.map((each, order) => ({
                value: each.index,
                label: `${order + 1}. ${recipeTitle(book, each)} - ${materialSummary(book, each)}`,
              }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      ) : null}
    </Flex>
  );

  // 제작법을 바꾸면 트리의 자리가 모두 달라진다. 고른 방법과 펼침을 새로 시작한다.
  return <RecipeCost key={recipe.index} book={book} recipe={recipe} header={header} />;
}

function RecipeCost({
  book,
  recipe,
  header,
}: {
  book: RecipeBook;
  recipe: Recipe;
  header: ReactNode;
}) {
  const [quantity, setQuantity] = useState(1);
  const [methods, setMethods] = useState<Record<string, Method>>({});
  const [expanded, setExpanded] = useState<string[]>([]);

  /**
   * 물어본 이름. 계산이 "이 시세가 필요하다" 고 하면 여기에 더한다. 빼지는 않는다.
   * 접었다 다시 펼칠 때 같은 시세를 또 받지 않게 하려는 것이고, 받은 값은 5분 동안 그대로 쓴다.
   */
  const [requested, setRequested] = useState<string[]>([]);
  const prices = useMarketPrices(requested);

  /**
   * NPC 판매가. 재료마다가 아니라 한꺼번에 켜고 끈다. 켜면 NPC 가 파는 재료를 그 값에 사는 것으로
   * 보고, 꺼진 계산(경매장만)과 총액을 나란히 보여 준다. 수요일 할인은 오늘이 수요일이면 켠 채로 시작한다.
   */
  const [useNpc, setUseNpc] = useState(true);
  const [todayIsWednesday] = useState(() => isWednesdayInKorea());
  const [wednesday, setWednesday] = useState(todayIsWednesday);

  const planWith = (npc: boolean) =>
    buildPlan({
      book,
      recipe,
      quantity,
      priceOf: (id) => prices.get(book.itemName(id)),
      methods,
      expanded: new Set(expanded),
      npcPriceOf: npc ? (id) => npcUnitPrice(book.itemName(id), wednesday) : undefined,
    });
  const plan = planWith(useNpc);
  // 비교용. NPC 판매가를 쓰지 않았을 때의 총액. NPC 재료가 없으면 같은 계산이라 다시 돌리지 않는다.
  const usesNpc = plan.shopping.some((row) => row.price.status === 'npc');
  const auctionPlan = useNpc && usesNpc ? planWith(false) : undefined;
  const npcNames = [
    ...new Set(
      plan.shopping
        .filter((row) => row.price.status === 'npc')
        .map((row) => book.itemName(row.itemId)),
    ),
  ];

  const missing = [
    ...new Set([...plan.needed, ...(auctionPlan?.needed ?? [])].map(book.itemName)),
  ].filter((name) => !requested.includes(name));
  // 렌더 중에 상태를 고치는 React 의 "이전 렌더에서 파생" 방식. 새 이름이 있을 때만 바뀌므로 멈춘다.
  if (missing.length > 0) setRequested([...requested, ...missing]);

  const setMethod = (key: string, method: Method) => {
    setMethods((prev) => ({ ...prev, [key]: method }));
    // 제작으로 바꾸면 무엇이 들어가는지 바로 보이게 펼친다.
    if (method !== 'buy') setExpanded((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const progressNote = PROGRESS_SKILLS.has(recipe.skill);

  /**
   * 재료 그림은 아이템 정보의 그림 목록에서 찾는다. 목록은 카테고리별이라 이름 사전으로 카테고리를
   * 알아낸다. 경매장에 오른 적 없는 재료(거래 불가 등)는 사전에 없어 그림이 비어 있다.
   */
  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];

  return (
    <>
      <Card title="제작 비용" size="small">
        <Flex vertical gap={16}>
          {header}
          <Flex gap={24} wrap align="flex-end">
            <Form layout="vertical" style={{ marginBottom: 0 }}>
              <Form.Item label="만들 개수" htmlFor="crafting-quantity" style={{ marginBottom: 0 }}>
                <InputNumber
                  id="crafting-quantity"
                  min={1}
                  max={MAX_QUANTITY}
                  precision={0}
                  value={quantity}
                  onChange={(value) => setQuantity(value ?? 1)}
                  className="tnum"
                  style={{ width: 140 }}
                />
              </Form.Item>
            </Form>
            <Statistic
              title={progressNote ? '재료 예상 총액 (작업 1회와 마무리 기준)' : '재료 예상 총액'}
              value={formatGold(plan.total.gold)}
              styles={{ content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}
            />
            {auctionPlan ? (
              <Statistic
                title="경매장에서만 산다면"
                value={formatGold(auctionPlan.total.gold)}
                styles={{
                  content: {
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    fontSize: 20,
                  },
                }}
              />
            ) : null}
            {plan.total.pending > 0 ? (
              <Flex gap={8} align="center">
                <Spin size="small" />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  시세 {formatNumber(plan.total.pending)}종을 받는 중입니다
                </Text>
              </Flex>
            ) : null}
          </Flex>
          <Flex gap={16} wrap>
            <Checkbox checked={useNpc} onChange={(event) => setUseNpc(event.target.checked)}>
              NPC 판매 재료는 NPC 판매가로 계산
            </Checkbox>
            <Checkbox
              checked={wednesday}
              disabled={!useNpc}
              onChange={(event) => setWednesday(event.target.checked)}
            >
              수요일 상점 할인 {WEDNESDAY_DISCOUNT_PERCENT}% 적용
              {todayIsWednesday ? ' (오늘 수요일)' : ''}
            </Checkbox>
          </Flex>
          <Flex vertical gap={4}>
            {useNpc && npcNames.length > 0 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                NPC 판매가로 계산한 재료: {npcNames.join(', ')}
              </Text>
            ) : null}
            {plan.crafts > 1 && recipe.yield > 1 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                한 번에 {formatNumber(recipe.yield)}개씩 {formatNumber(plan.crafts)}번 만듭니다.
              </Text>
            ) : null}
            <TotalNotes book={book} total={plan.total} shopping={plan.shopping} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              경매장 매물을 싼 것부터 필요한 개수만큼 채워 계산했습니다. 시세는 넥슨 오픈 API
              기준이며 평균 10분 지연됩니다. 수수료와 제작 실패는 넣지 않았습니다. NPC 판매가는 직접
              모은 {Object.keys(NPC_MATERIALS).length}종만 들어 있어, 목록에 없는 NPC 재료는 경매장
              값으로 계산됩니다.
            </Text>
            {progressNote ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                천옷만들기와 블랙스미스는 작업할 때마다 작업 재료를 다시 넣습니다. 작업을 여러 번
                하면 그만큼 더 듭니다. 옷본과 도면 값도 들어 있지 않습니다.
              </Text>
            ) : null}
            <Text type="secondary" style={{ fontSize: 12 }}>
              만들 수 있는 재료는 펼쳐서 하위 재료를 보고, 구하는 방법을 제작으로 바꾸면 하위 재료
              값이 총액에 들어갑니다. 경매장에서 필요한 만큼 살 수 없는 재료는 처음부터 제작으로
              둡니다.
            </Text>
          </Flex>

          <Table<TreeRow>
            columns={treeColumns(book, setMethod, categoryOf)}
            dataSource={toTreeRows(plan.nodes)}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            components={TREE_COMPONENTS}
            onRow={(row) => ({ 'data-depth': row.node.depth }) as HTMLAttributes<HTMLElement>}
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
                <Table.Summary.Cell index={0} colSpan={TREE_COLUMN_COUNT - 1}>
                  <Flex vertical gap={2}>
                    <Text strong>합계</Text>
                    {/*
                     * 합계는 줄마다의 금액을 더한 것이 아니다. 같은 재료가 트리 여러 곳에 나오면
                     * 개수를 합쳐 싼 매물부터 한 번에 채운다. 따로 사면 같은 싼 매물을 두 번 세게 된다.
                     */}
                    {plan.shopping.length < countBuyRows(plan.nodes) ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        여러 곳에 나오는 재료는 개수를 합쳐 한 번에 산 값으로 계산했습니다.
                      </Text>
                    ) : null}
                  </Flex>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong className="tnum" style={{ whiteSpace: 'nowrap' }}>
                    {formatGold(plan.total.gold)}
                  </Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Flex>
      </Card>
    </>
  );
}

/** 합계에 들어가는 "구매" 줄 수. 살 재료 종류보다 많으면 같은 재료가 여러 곳에 나온 것이다. */
function countBuyRows(nodes: PlanNode[]): number {
  let count = 0;
  const walk = (node: PlanNode) => {
    if (node.method !== 'buy' && node.children) node.children.forEach(walk);
    else count += 1;
  };
  nodes.forEach(walk);
  return count;
}

/** 총액에 빠진 것. 모르는 값이 섞인 합은 실제보다 싸 보이므로 무엇이 빠졌는지 적는다. */
function TotalNotes({
  book,
  total,
  shopping,
}: {
  book: RecipeBook;
  total: CostSum;
  shopping: ShoppingRow[];
}) {
  if (isComplete(total)) return null;
  const names = (ids: number[]) => ids.map(book.itemName).join(', ');
  return (
    <>
      {total.unpriced.length > 0 ? (
        <Text type="warning" style={{ fontSize: 13 }}>
          값을 모르는 재료 {formatNumber(total.unpriced.length)}종은 총액에서 빠졌습니다:{' '}
          {names(total.unpriced)}
        </Text>
      ) : null}
      {total.short.length > 0 ? (
        <Text type="warning" style={{ fontSize: 13 }}>
          매물이 모자란 재료는 있는 만큼만 넣었습니다:{' '}
          {total.short
            .map((id) => {
              const row = shopping.find((each) => each.itemId === id);
              return `${book.itemName(id)} (필요 ${formatNumber(row?.required)}개, 매물 ${formatNumber(row?.quote?.filled)}개)`;
            })
            .join(', ')}
        </Text>
      ) : null}
    </>
  );
}

/** 펼칠 때 하위 줄이 나타나는 시간. 눈에 걸리지 않을 만큼 짧게 둔다. */
const ROW_ENTER_MS = 180;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 트리 표의 줄. 하위 재료 줄은 펼칠 때 새로 붙으므로, 붙는 순간 살짝 내려오며 나타나게 한다.
 * 줄이 한꺼번에 튀어나오면 아래 줄들이 덜컹 밀려나 어디가 펼쳐졌는지 놓친다.
 *
 * 움직임은 transform 과 opacity 만 쓴다. 높이를 움직이면 표 전체를 매 프레임 다시 잰다.
 * 화면 규칙상 CSS 파일에 컴포넌트 스타일을 두지 않으므로 Web Animations API 로 건다.
 * 맨 위 줄은 처음 그릴 때 한꺼번에 나오는 것이라 움직이지 않는다. 움직임 줄이기 설정도 따른다.
 */
function TreeBodyRow({
  'data-depth': depth,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { 'data-depth'?: number }) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const row = ref.current;
    if (!row || !depth || typeof row.animate !== 'function' || prefersReducedMotion()) return;
    const animation = row.animate(
      [
        { opacity: 0, transform: 'translateY(-6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: ROW_ENTER_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
    return () => animation.cancel();
    // 붙는 순간 한 번만 움직인다. 시세가 들어와 다시 그려질 때마다 움직이면 표가 깜빡인다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <tr ref={ref} {...props} />;
}

/** 모듈 상수로 둔다. 렌더마다 새 객체를 넘기면 antd 가 줄을 모두 새로 붙여 애니메이션이 매번 돈다. */
const TREE_COMPONENTS = { body: { row: TreeBodyRow } };

interface TreeRow {
  key: string;
  node: PlanNode;
  children?: TreeRow[];
}

/**
 * antd 트리 표의 줄. 만들 수 있는 재료는 하위 재료를 아직 계산하지 않았어도 빈 children 을 달아
 * 펼침 단추가 나오게 한다. 펼치면 계산이 하위 재료를 채운다.
 */
function toTreeRows(nodes: PlanNode[]): TreeRow[] {
  return nodes.map((node) => ({
    key: node.key,
    node,
    ...(node.recipes.length > 0 ? { children: toTreeRows(node.children ?? []) } : {}),
  }));
}

function priceStatusText(price: NodePrice): string {
  switch (price.status) {
    case 'untradable':
      return '거래 불가';
    case 'loading':
      return '받는 중';
    case 'error':
      return '조회 실패';
    case 'npc':
      return '';
    default:
      return price.price.offers.length === 0 ? '매물 없음' : '';
  }
}

function treeColumns(
  book: RecipeBook,
  setMethod: (key: string, method: Method) => void,
  categoryOf: (name: string) => string | undefined,
): TableColumnsType<TreeRow> {
  return [
    {
      title: '재료',
      key: 'name',
      render: (_value, { node }) => {
        const name = book.itemName(node.itemId);
        const category = categoryOf(name);
        return (
          <Flex gap={8} align="center">
            {category ? (
              <ItemIcon category={category} name={name} size={MATERIAL_ICON} />
            ) : (
              <MaterialIconSlot />
            )}
            <Flex gap={6} align="center" wrap style={{ minWidth: 0 }}>
              <Text>{name}</Text>
              {node.finish ? <Tag>마무리</Tag> : null}
              {node.alternatives.length > 0 ? (
                <Tooltip
                  title={`대신 쓸 수 있는 것: ${node.alternatives.map(book.itemName).join(', ')}`}
                >
                  <Tag tabIndex={0}>대체 {node.alternatives.length}</Tag>
                </Tooltip>
              ) : null}
            </Flex>
          </Flex>
        );
      },
    },
    {
      title: '필요 개수',
      key: 'required',
      align: 'right',
      render: (_value, { node }) => (
        <Flex vertical align="flex-end">
          <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
            {formatNumber(node.required)}
          </Text>
          {node.method !== 'buy' && node.yieldCount > 1 ? (
            <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {formatNumber(node.yieldCount)}개씩 {formatNumber(node.crafts)}번
            </Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: '구하는 방법',
      key: 'method',
      render: (_value, { node }) => {
        const npc = node.price.status === 'npc';
        const tradable = npc || book.isTradable(node.itemId);
        if (node.recipes.length === 0)
          return <Text type="secondary">{npc ? 'NPC 구매' : tradable ? '구매' : '거래 불가'}</Text>;
        return (
          <Select<Method>
            size="small"
            value={node.method}
            onChange={(method) => setMethod(node.key, method)}
            aria-label={`${book.itemName(node.itemId)} 구하는 방법`}
            popupMatchSelectWidth={false}
            options={[
              {
                value: 'buy',
                label: npc ? 'NPC 구매' : tradable ? '구매' : '구매 (거래 불가)',
                disabled: !tradable,
              },
              ...node.recipes.map((each) => ({
                value: each.index,
                label: `제작: ${recipeTitle(book, each)}`,
              })),
            ]}
            style={{ minWidth: 150 }}
          />
        );
      },
    },
    {
      title: '매물',
      key: 'supply',
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
      align: 'right',
      render: (_value, { node }) => <LowestPrice price={node.price} lowest={node.quote?.lowest} />,
    },
    {
      title: '금액',
      key: 'cost',
      align: 'right',
      render: (_value, { node }) => {
        const other =
          node.method === 'buy'
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
}

function LowestPrice({ price, lowest }: { price: NodePrice; lowest?: number }): ReactNode {
  if (price.status === 'loading') return <Spin size="small" />;
  const status = priceStatusText(price);
  if (status || lowest === undefined) return <Text type="secondary">{status || '-'}</Text>;
  return (
    <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
      {formatGold(lowest)}
    </Text>
  );
}

/** 합이 온전하지 않으면 무엇이 빠졌는지 짧게 붙인다. 자세한 목록은 총액 아래에 있다. */
function CostText({ cost }: { cost: CostSum }) {
  if (cost.pending > 0 && cost.gold === 0) return <Spin size="small" />;
  const knownNothing = cost.gold === 0 && cost.unpriced.length > 0;
  return (
    <Flex vertical align="flex-end">
      <Text
        className="tnum"
        style={{ whiteSpace: 'nowrap' }}
        type={knownNothing ? 'secondary' : undefined}
      >
        {knownNothing ? '값 모름' : formatGold(cost.gold)}
      </Text>
      {!knownNothing && (cost.unpriced.length > 0 || cost.short.length > 0) ? (
        <Text type="warning" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {cost.unpriced.length > 0 ? '값 모르는 재료 빠짐' : '매물 부족'}
        </Text>
      ) : null}
    </Flex>
  );
}

/**
 * 그림을 찾을 수 없는 재료의 자리. 이름이 줄마다 다른 자리에서 시작하면 트리의 들여쓰기가 읽히지
 * 않으므로 칸은 비워 둔다. 그림 저장소가 없는 환경에서는 ItemIcon 처럼 자리도 두지 않는다.
 */
function MaterialIconSlot() {
  if (!isCardStoreConfigured() && !isIconMapConfigured()) return null;
  return (
    <div style={{ width: MATERIAL_ICON, height: MATERIAL_ICON, flex: `0 0 ${MATERIAL_ICON}px` }} />
  );
}
