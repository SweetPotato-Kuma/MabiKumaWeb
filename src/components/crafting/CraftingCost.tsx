import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Card,
  Checkbox,
  Divider,
  Flex,
  Form,
  Grid,
  InputNumber,
  Select,
  Spin,
  Statistic,
  Table,
  Typography,
  theme,
} from 'antd';
import { CookingGuide } from '@/components/crafting/CookingGuide';
import { treeColumns, treeRowsOf, useSlidingRows, type TreeRow } from '@/components/crafting/craftTree';
import { RecipeInfo } from '@/components/crafting/RecipeInfo';
import { useResolvedThemeMode } from '@/lib/themePreference';
import { GAIN_LOSS_COLORS } from '@/app/theme';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { coinPurchasesOf } from '@/features/dungeonCoins/exchanges';
import { mainCoinOf, makesFromBeads } from '@/features/dungeonCoins/subBeads';
import { useMarketPrices } from '@/features/crafting/market';
import { craftProfit, type CraftProfit } from '@/features/crafting/profit';
import {
  isWednesdayInKorea,
  npcUnitPrice,
  WEDNESDAY_DISCOUNT_PERCENT,
} from '@/features/crafting/npcPrices';
import {
  clearSourceChoices,
  NO_CHOICES,
  allBeadsOn,
  beadOptionsOf,
  chooseMethod,
  toggleAllBeads,
  toggleBeads,
  type TreeChoices,
} from '@/features/crafting/treeChoices';
import {
  buildPlan,
  isBuying,
  isComplete,
  type CostSum,
  type Method,
  type ShoppingRow,
} from '@/features/crafting/plan';
import {
  DEFAULT_WORKS,
  hasWorks,
  isCooking,
  materialSummary,
  recipeTitle,
  type Recipe,
  type RecipeBook,
} from '@/features/crafting/recipes';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 한 번에 계산할 수 있는 최대 개수. 이보다 많으면 매물을 몇 쪽 받아도 모자라 값이 뜻을 잃는다. */
const MAX_QUANTITY = 9999;

/** 공정 수 칸의 상한. 공정당 진행도가 가장 낮은 제작법도 이만큼 걸리지 않는다. */
const MAX_WORKS = 99;

/** 재료 그림 칸. 표 한 줄 높이를 크게 늘리지 않으면서 알아볼 수 있는 크기. */

/** 트리 표의 칸 수. 합계 줄이 앞 칸들을 한 칸으로 묶을 때 쓴다. */
const TREE_COLUMN_COUNT = 6;

interface CraftingCostProps {
  book: RecipeBook;
  /** 같은 아이템을 만드는 제작법들. 둘 이상이면 고르는 칸이 생긴다. */
  recipes: Recipe[];
  /** 처음에 고를 제작법(Recipe.index). */
  initialRecipe?: number;
}

/** 요약 칸의 작은 숫자. 재료 예상 총액만 크게 둔다. */
const SMALL_STAT = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 20 } as const;

/**
 * 손익 한 칸. 색만으로 가르지 않고 값 뒤에 이득, 손해를 글자로 붙인다.
 * 재료비가 모자라게 잡혔으면(partial) 실제 손익은 이보다 작다. 손해면 "이상", 이득이면 "최대" 를 붙인다.
 */
function ProfitStat({ title, profit }: { title: string; profit: CraftProfit | undefined }) {
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();
  const fixed = GAIN_LOSS_COLORS[useResolvedThemeMode()];
  const gain = fixed?.gain ?? token.colorSuccess;
  const loss = fixed?.loss ?? token.colorError;
  const value = profit?.profit;
  const text =
    value === undefined
      ? '-'
      : value < 0
        ? `${formatGold(-value)} ${profit?.partial ? '이상 ' : ''}손해`
        : `${profit?.partial ? '최대 ' : ''}${formatGold(value)} 이득`;
  return (
    <Statistic
      title={title}
      value={text}
      styles={{
        content: {
          ...SMALL_STAT,
          color: value === undefined ? undefined : value >= 0 ? gain : loss,
        },
      }}
    />
  );
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

  const picker =
    recipes.length > 1 ? (
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
    ) : null;

  // 제작법을 바꾸면 트리의 자리가 모두 달라진다. 고른 방법과 펼침을 새로 시작한다.
  return <RecipeCost key={recipe.index} book={book} recipe={recipe} picker={picker} />;
}

function RecipeCost({
  book,
  recipe,
  picker,
}: {
  book: RecipeBook;
  recipe: Recipe;
  picker: ReactNode;
}) {
  const formatGold = useGoldFormatter();
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();
  const [quantity, setQuantity] = useState(1);
  /** 공정 수. 기준 공정 수로 시작하고 사용자가 고친다. */
  const workRecipe = hasWorks(recipe);
  const [works, setWorks] = useState(DEFAULT_WORKS);
  /** 줄마다 고른 구하는 방법과 "코인으로 만들기" 를 직접 켠 줄. */
  const [choices, setChoices] = useState<TreeChoices>(NO_CHOICES);
  const { methods, beadChecked } = choices;
  const [expanded, setExpanded] = useState<string[]>([]);

  /**
   * 물어본 이름. 계산이 "이 시세가 필요하다" 고 하면 여기에 더한다. 빼지는 않는다.
   * 접었다 다시 펼칠 때 같은 시세를 또 받지 않게 하려는 것이고, 받은 값은 5분 동안 그대로 쓴다.
   */
  const [requested, setRequested] = useState<string[]>([]);
  const prices = useMarketPrices(requested);

  /**
   * NPC 판매가. 체크박스는 NPC 가 파는 재료를 어디서 살지 기본값을 한꺼번에 정한다. 줄마다 "경매장 구매"
   * 와 "NPC 구매" 를 따로 고를 수도 있고, 체크박스를 바꾸면 줄마다 고른 구매처는 기본값으로 돌아간다.
   * 수요일 할인은 오늘이 수요일이면 켠 채로 시작한다.
   */
  const [useNpc, setUseNpc] = useState(true);
  const [todayIsWednesday] = useState(() => isWednesdayInKorea());
  const [wednesday, setWednesday] = useState(todayIsWednesday);

  // 이 물건이 쓰는 코인. 그 코인으로 파는 재료를 코인으로 살지 고를 수 있다.
  const coin = useMemo(() => mainCoinOf(book, recipe), [book, recipe]);
  const beads = useMemo(
    () =>
      coin === undefined
        ? undefined
        : {
            coinCostOf: (id: number) =>
              coinPurchasesOf(book.itemName(id)).find((each) => each.coin === coin)?.cost,
            craftable: (id: number) => makesFromBeads(book, coin, id),
            checked: new Set(beadChecked),
          },
    [book, coin, beadChecked],
  );

  const planWith = (withBeads: boolean) =>
    buildPlan({
      book,
      recipe,
      quantity,
      works: workRecipe ? works : undefined,
      priceOf: (id) => prices.get(book.itemName(id)),
      methods,
      expanded: new Set(expanded),
      npcPriceOf: (id) => npcUnitPrice(book.itemName(id), wednesday),
      preferNpc: useNpc,
      beads: withBeads ? beads : undefined,
    });
  const plan = planWith(true);

  /**
   * 완성품 시세. 경매장에서 거래되는 물건만 묻는다. 최저가에서 개당 재료비를 빼 만들어 팔 때의 손익을 낸다.
   */
  const productName = book.itemName(recipe.item);
  const productTradable = book.isTradable(recipe.item);
  const productNames = useMemo(() => (productTradable ? [productName] : []), [productTradable, productName]);
  const productPrice = useMarketPrices(productNames).get(productName);
  /**
   * 비교용. 구슬로 사거나 구슬로 만들기로 고른 재료를 모두 골드(경매장 구매, NPC 구매)로 샀을 때의 총액.
   * 구슬을 고르지 않았으면 재료 예상 총액과 같고, 고른 만큼만 달라진다. 구슬을 쓰는 제작법에서만 센다.
   * 예전에는 NPC 재료까지 경매장에서 산다고 쳤는데, NPC 가 50만 G 에 파는 재료가 경매장에 5억 G 로 하나
   * 올라와 있으면 그 값이 들어가 뜻 없는 총액이 나왔다(2026-09, 마력이 깃든 융합제).
   */
  const goldPlan = coin !== undefined ? planWith(false) : undefined;
  /**
   * 손익은 재료 예상 총액(표의 합계)이 기준이다. 경매장 재료는 싼 매물부터 채운 값, NPC 가 파는 재료는
   * NPC 값, 구슬로 산 재료는 그 재료의 경매장 값이다(craftProfit).
   */
  const profit = craftProfit(plan, quantity, productPrice);
  const missing = [
    ...new Set([...plan.needed, ...(goldPlan?.needed ?? [])].map(book.itemName)),
  ].filter((name) => !requested.includes(name));
  // 렌더 중에 상태를 고치는 React 의 "이전 렌더에서 파생" 방식. 새 이름이 있을 때만 바뀌므로 멈춘다.
  if (missing.length > 0) setRequested([...requested, ...missing]);

  const setMethod = (key: string, method: Method) => {
    setChoices((prev) => chooseMethod(prev, plan.nodes, key, method));
    // 제작으로 바꾸면 무엇이 들어가는지 바로 보이게 펼친다.
    if (!isBuying(method)) setExpanded((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  /**
   * "코인으로 만들기" 를 켜고 끈다. 그 아래 줄은 각자 고른 것을 지우고 같은 쪽으로 맞춘다.
   * off 로 끌 때 offMethod 를 남기는 것은 윗줄이 켜져 있어도 이 줄만 꺼진 채로 두기 위해서다.
   */
  const setBeads = (key: string, on: boolean, offMethod: Method) =>
    setChoices((prev) => toggleBeads(prev, plan.nodes, key, on, offMethod));

  /** 맨 위 줄 가운데 코인으로 사거나 구슬로 만들 수 있는 것을 모두 켜거나 끈다. 트리는 펼치지 않는다. */
  const beadOptions = beadOptionsOf(plan.nodes);
  const allBeadsChecked = allBeadsOn(beadOptions);
  const setAllBeads = (on: boolean) => setChoices((prev) => toggleAllBeads(prev, beadOptions, on));

  /** 전체 기본값을 바꾸면 줄마다 고른 구매처는 지운다. 제작과 코인으로 사기를 고른 것은 그대로 둔다. */
  const changeUseNpc = (next: boolean) => {
    setUseNpc(next);
    setChoices(clearSourceChoices);
  };

  const tableRef = useRef<HTMLDivElement>(null);
  useSlidingRows(tableRef);

  // 요리는 재료를 한 개씩 쓰고 비율을 맞춰 넣는다. 트리의 개수만으로는 만들 수 없어 비율 칸을 둔다.
  const cooking = isCooking(recipe);

  /**
   * 재료 그림은 아이템 정보의 그림 목록에서 찾는다. 목록은 카테고리별이라 이름 사전으로 카테고리를
   * 알아낸다. 경매장에 오른 적 없는 재료(거래 불가 등)는 사전에 없어 그림이 비어 있다.
   */
  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];

  return (
    <Card title="제작 비용" size="small">
      <Flex vertical gap={16}>
        {picker}
        {/*
            머리는 카드 폭을 다 쓴다. 넓은 화면은 스킬과 조건 | 요리 비율 | 개수와 총액 세 칸,
            중간 폭은 두 칸에 개수와 총액을 아랫줄로, 768px 아래는 한 칸으로 쌓는다.
            요리가 아니면 비율 칸이 없어 스킬과 조건 | 개수와 총액 두 칸이다.
          */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: !screens.md
              ? 'minmax(0, 1fr)'
              : cooking && screens.xl
                ? 'minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 1fr)'
                : 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: screens.md ? 32 : 20,
            alignItems: 'start',
          }}
        >
          <RecipeInfo book={book} recipe={recipe} />
          {cooking ? <CookingGuide book={book} recipe={recipe} /> : null}
          <Flex
            vertical
            gap={16}
            style={cooking && screens.md && !screens.xl ? { gridColumn: '1 / -1' } : undefined}
          >
            <Form layout="vertical" style={{ marginBottom: 0 }}>
              <Flex gap={16} wrap>
                <Form.Item
                  label="만들 개수"
                  htmlFor="crafting-quantity"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber
                    id="crafting-quantity"
                    min={1}
                    max={MAX_QUANTITY}
                    precision={0}
                    value={quantity}
                    onChange={(value) => setQuantity(value ?? 1)}
                    className="tnum"
                    style={{ width: 120 }}
                  />
                </Form.Item>
                {workRecipe ? (
                  <Form.Item label="공정 수" htmlFor="crafting-works" style={{ marginBottom: 0 }}>
                    <InputNumber
                      id="crafting-works"
                      min={1}
                      max={MAX_WORKS}
                      precision={0}
                      value={works}
                      onChange={(value) => setWorks(value ?? 1)}
                      className="tnum"
                      style={{ width: 120 }}
                    />
                  </Form.Item>
                ) : null}
              </Flex>
            </Form>
            {/* 비용 묶음. 재료 예상 총액과 구슬 없이 샀을 때, 구슬로 산 몫을 나란히 본다. */}
            <Flex gap={20} wrap align="flex-end">
              <Statistic
                title="재료 예상 총액"
                value={formatGold(plan.total.gold)}
                styles={{ content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }}
              />
              {goldPlan ? (
                <Statistic
                  title={`${coin} 없이 산다면`}
                  value={formatGold(goldPlan.total.gold)}
                  // 매물이 모자란 재료는 채운 만큼만 들어 있어 실제로는 이보다 비싸다.
                  suffix={goldPlan.total.pending === 0 && !isComplete(goldPlan.total) ? '이상' : undefined}
                  styles={{ content: SMALL_STAT, suffix: { fontSize: 14 } }}
                />
              ) : null}
              {coin !== undefined ? (
                <Statistic
                  title={`필요한 ${coin}`}
                  value={`${formatNumber(plan.beads)}개`}
                  styles={{ content: SMALL_STAT }}
                />
              ) : null}
              {coin !== undefined ? (
                <Statistic
                  title={`${coin} 개당 가치`}
                  value={
                    plan.beads > 0 && isComplete(plan.beadsWorth)
                      ? formatGold(Math.round(plan.beadsWorth.gold / plan.beads))
                      : '-'
                  }
                  styles={{ content: SMALL_STAT }}
                />
              ) : null}
              {quantity > 1 ? (
                <Statistic
                  title="개당 재료비"
                  value={profit.unitCost === undefined ? '-' : formatGold(profit.unitCost)}
                  styles={{ content: SMALL_STAT }}
                />
              ) : null}
            </Flex>
            {/*
              판매 묶음. 완성품 최저가와 만들어 팔 때의 손익. 비용 묶음이 좁은 화면에서 두 줄로 접혀도
              어디까지가 한 묶음인지 보이게 선으로 가른다.
            */}
            {productTradable ? <Divider style={{ margin: 0 }} /> : null}
            {productTradable ? (
              <Flex gap={20} wrap align="flex-end">
                <Statistic
                  title="완성품 최저가"
                  value={profit.lowest === undefined ? '-' : formatGold(profit.lowest)}
                  styles={{ content: SMALL_STAT }}
                />
                <ProfitStat title="제작 시 손익 (재료 예상 총액 기준)" profit={profit} />
              </Flex>
            ) : null}
            {/* 시세를 받는 동안만 나타나므로 자리를 비워 둔다. 나타날 때 아래 표가 밀리지 않게 한다. */}
            <div
              style={{ display: 'flex', gap: 8, alignItems: 'center', height: 22, marginTop: -8 }}
            >
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
              {coin !== undefined && beadOptions.length > 0 ? (
                <Checkbox
                  checked={allBeadsChecked}
                  onChange={(event) => setAllBeads(event.target.checked)}
                >
                  {coin} 구매 전체 선택
                </Checkbox>
              ) : null}
              <Checkbox
                checked={wednesday}
                onChange={(event) => setWednesday(event.target.checked)}
              >
                수요일 상점 할인 {WEDNESDAY_DISCOUNT_PERCENT}% 적용
                {todayIsWednesday ? ' (오늘 수요일)' : ''}
              </Checkbox>
            </Flex>
            {plan.crafts > 1 && recipe.yield > 1 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                한 번에 {formatNumber(recipe.yield)}개씩 {formatNumber(plan.crafts)}번 만듭니다.
              </Text>
            ) : null}
            <TotalNotes book={book} total={plan.total} shopping={plan.shopping} />
          </Flex>
        </div>

        <div ref={tableRef}>
          <Table<TreeRow>
            columns={treeColumns(
              book,
              setMethod,
              setBeads,
              categoryOf,
              () => coin,
              { background: token.colorFillQuaternary },
              formatGold,
            )}
            dataSource={treeRowsOf(plan.nodes, plan.sections, workRecipe ? works : 1)}
            rowKey="key"
            size="small"
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 'max-content' }}
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
                  {/*
                   * 합계는 줄마다의 금액을 더한 것이 아니다. 같은 재료가 트리 여러 곳에 나오면
                   * 개수를 합쳐 싼 매물부터 한 번에 채운다. 따로 사면 같은 싼 매물을 두 번 세게 된다.
                   */}
                  <Text strong>{plan.sections ? '총합계' : '합계'}</Text>
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

/** 총액에 빠진 것. 모르는 값이 섞인 합은 실제보다 싸 보이므로 무엇이 빠졌는지 적는다. */
export function TotalNotes({
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
