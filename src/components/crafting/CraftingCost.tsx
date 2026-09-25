import { useState, type ReactNode } from 'react';
import {
  Card,
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
import { useMarketPrices } from '@/features/crafting/market';
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
 * 위에는 제작법과 총액, 가운데는 재료 트리, 아래는 살 재료 목록이다. 트리의 줄마다 "구매" 와
 * "제작" 을 고를 수 있고, 제작을 고르면 그 재료의 재료가 값에 들어간다. 계산은 features/crafting/plan.ts.
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

  const plan = buildPlan({
    book,
    recipe,
    quantity,
    priceOf: (id) => prices.get(book.itemName(id)),
    methods,
    expanded: new Set(expanded),
  });

  const missing = [...new Set(plan.needed.map(book.itemName))].filter(
    (name) => !requested.includes(name),
  );
  // 렌더 중에 상태를 고치는 React 의 "이전 렌더에서 파생" 방식. 새 이름이 있을 때만 바뀌므로 멈춘다.
  if (missing.length > 0) setRequested([...requested, ...missing]);

  const setMethod = (key: string, method: Method) => {
    setMethods((prev) => ({ ...prev, [key]: method }));
    // 제작으로 바꾸면 무엇이 들어가는지 바로 보이게 펼친다.
    if (method !== 'buy') setExpanded((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const progressNote = PROGRESS_SKILLS.has(recipe.skill);

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
            {plan.total.pending > 0 ? (
              <Flex gap={8} align="center">
                <Spin size="small" />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  시세 {formatNumber(plan.total.pending)}종을 받는 중입니다
                </Text>
              </Flex>
            ) : null}
          </Flex>
          <Flex vertical gap={4}>
            {plan.crafts > 1 && recipe.yield > 1 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                한 번에 {formatNumber(recipe.yield)}개씩 {formatNumber(plan.crafts)}번 만듭니다.
              </Text>
            ) : null}
            <TotalNotes book={book} total={plan.total} shopping={plan.shopping} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              경매장 매물을 싼 것부터 필요한 개수만큼 채워 계산했습니다. 시세는 넥슨 오픈 API
              기준이며 평균 10분 지연됩니다. 수수료와 제작 실패는 넣지 않았습니다.
            </Text>
            {progressNote ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                천옷만들기와 블랙스미스는 작업할 때마다 작업 재료를 다시 넣습니다. 작업을 여러 번
                하면 그만큼 더 듭니다. 옷본과 도면 값도 들어 있지 않습니다.
              </Text>
            ) : null}
          </Flex>
        </Flex>
      </Card>

      <Card title="재료 트리" size="small">
        <Flex vertical gap={10}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            만들 수 있는 재료는 펼쳐서 하위 재료를 보고, 구하는 방법을 제작으로 바꾸면 하위 재료
            값이 총액에 들어갑니다. 경매장에서 필요한 만큼 살 수 없는 재료는 처음부터 제작으로
            둡니다.
          </Text>
          <Table<TreeRow>
            columns={treeColumns(book, setMethod)}
            dataSource={toTreeRows(plan.nodes)}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            expandable={{
              expandedRowKeys: expanded,
              onExpand: (open, row) =>
                setExpanded((prev) =>
                  open ? [...prev, row.key] : prev.filter((key) => key !== row.key),
                ),
              indentSize: 16,
            }}
          />
        </Flex>
      </Card>

      <Card title="살 재료" size="small">
        <Flex vertical gap={10}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            트리에서 구매로 둔 재료를 아이템별로 모았습니다. 같은 재료가 여러 곳에 나오면 개수를
            합쳐 한 번에 샀을 때로 계산합니다.
          </Text>
          <Table<ShoppingRow>
            columns={shoppingColumns(book)}
            dataSource={plan.shopping}
            rowKey="itemId"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
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
        </Flex>
      </Card>
    </>
  );
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
    default:
      return price.price.offers.length === 0 ? '매물 없음' : '';
  }
}

function treeColumns(
  book: RecipeBook,
  setMethod: (key: string, method: Method) => void,
): TableColumnsType<TreeRow> {
  return [
    {
      title: '재료',
      key: 'name',
      render: (_value, { node }) => (
        <Flex gap={6} align="center" wrap>
          <Text>{book.itemName(node.itemId)}</Text>
          {node.finish ? <Tag>마무리</Tag> : null}
          {node.alternatives.length > 0 ? (
            <Tooltip
              title={`대신 쓸 수 있는 것: ${node.alternatives.map(book.itemName).join(', ')}`}
            >
              <Tag tabIndex={0}>대체 {node.alternatives.length}</Tag>
            </Tooltip>
          ) : null}
        </Flex>
      ),
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
        const tradable = book.isTradable(node.itemId);
        if (node.recipes.length === 0)
          return <Text type="secondary">{tradable ? '구매' : '거래 불가'}</Text>;
        return (
          <Select<Method>
            size="small"
            value={node.method}
            onChange={(method) => setMethod(node.key, method)}
            aria-label={`${book.itemName(node.itemId)} 구하는 방법`}
            popupMatchSelectWidth={false}
            options={[
              { value: 'buy', label: tradable ? '구매' : '구매 (거래 불가)', disabled: !tradable },
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

function shoppingColumns(book: RecipeBook): TableColumnsType<ShoppingRow> {
  return [
    {
      title: '재료',
      key: 'name',
      render: (_value, row) => <Text>{book.itemName(row.itemId)}</Text>,
    },
    {
      title: '필요 개수',
      key: 'required',
      align: 'right',
      render: (_value, row) => (
        <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
          {formatNumber(row.required)}
        </Text>
      ),
    },
    {
      title: '매물',
      key: 'supply',
      align: 'right',
      render: (_value, row) =>
        row.price.status === 'ok' ? (
          <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
            {formatNumber(row.price.price.supply)}개{row.price.price.complete ? '' : ' 이상'}
          </Text>
        ) : (
          <LowestPrice price={row.price} />
        ),
    },
    {
      title: '개당 최저가',
      key: 'lowest',
      align: 'right',
      render: (_value, row) => <LowestPrice price={row.price} lowest={row.quote?.lowest} />,
    },
    {
      title: '금액',
      key: 'cost',
      align: 'right',
      render: (_value, row) => {
        if (row.price.status === 'loading') return <Spin size="small" />;
        if (!row.quote || row.quote.filled === 0) return <Text type="secondary">값 모름</Text>;
        return (
          <Flex vertical align="flex-end">
            <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
              {formatGold(row.quote.cost)}
            </Text>
            {row.quote.filled < row.required ? (
              <Text type="warning" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {formatNumber(row.quote.filled)}개만 있음
              </Text>
            ) : null}
          </Flex>
        );
      },
    },
  ];
}
