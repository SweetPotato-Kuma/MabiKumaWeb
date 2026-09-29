import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Flex,
  Form,
  Grid,
  InputNumber,
  Modal,
  Skeleton,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { QueryState } from '@/components/QueryState';
import { BackpackIcon, RefreshIcon } from '@/components/icons';
import { snapshotAgeLabel } from '@/features/auction/snapshot';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import {
  WEDNESDAY_DISCOUNT_PERCENT,
  isWednesdayInKorea,
  npcUnitPrice,
} from '@/features/crafting/npcPrices';
import { rankText, useRecipeBookQuery, type RecipeBook } from '@/features/crafting/recipes';
import {
  MAX_BEADS,
  beadCraftsOf,
  expandCrafts,
  planWithInventory,
  rankCrafts,
  subMaterialsOf,
  valueCraft,
  type BeadCraft,
  type BeadPlan,
  type BeadPlanPick,
  type CraftValue,
  type InputCost,
  type ValuedCraft,
} from '@/features/dungeonCoins/beadCrafts';
import type { DungeonCoin } from '@/features/dungeonCoins/exchanges';
import { useInventory, type Inventory } from '@/features/dungeonCoins/inventory';
import { useDungeonPrices } from '@/features/dungeonCoins/prices';
import { formatGold, formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 가공품 그림 한 변. 교환 표와 같다. */
const ITEM_ICON = 28;

/** 펼친 줄과 가진 재료 창의 재료 그림. 제작 비용 표의 하위 재료와 같은 크기다. */
const MATERIAL_ICON = 24;

/** 가진 재료 한 칸에 넣을 수 있는 개수. 게임 가방 한 칸 묶음보다 넉넉하다. */
const MAX_HELD = 99_999;

const REASON_TEXT: Record<Extract<CraftValue, { status: 'unknown' }>['reason'], string> = {
  error: '받지 못함',
  'no-sale': '판매 매물 없음',
  'no-material': '재료 매물 없음',
};

type CategoryOf = (name: string) => string | undefined;

function Gold({ value, strong, color }: { value: number; strong?: boolean; color?: string }) {
  return (
    <Text
      strong={strong}
      type={value < 0 ? 'danger' : undefined}
      className="tnum"
      style={{ whiteSpace: 'nowrap', color: value < 0 ? undefined : color }}
    >
      {formatGold(value)}
    </Text>
  );
}

/** 값을 모르는 칸. 받는 중이면 자리만, 아니면 무엇이 모자란지 적는다. */
function UnknownCell({ value }: { value: CraftValue }) {
  if (value.status === 'loading')
    return <Skeleton.Input active size="small" style={{ width: 88, minWidth: 88 }} />;
  if (value.status !== 'unknown') return null;
  return (
    <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
      {REASON_TEXT[value.reason]}
    </Text>
  );
}

function inputCostText(cost: InputCost): string {
  switch (cost.status) {
    case 'ok':
      if (cost.from === 'held') return '가진 재료로 채움';
      return `${formatGold(cost.cost)} (${cost.from === 'npc' ? 'NPC' : '경매장'})`;
    case 'short':
      return `매물 ${formatNumber(cost.filled)}개뿐`;
    case 'none':
      return '매물 없음';
    case 'error':
      return '받지 못함';
    default:
      return '받는 중';
  }
}

/** 재료 이름 한 칸. 그림과 아이템 정보 링크. */
function MaterialName({
  itemId,
  name,
  book,
  categoryOf,
}: {
  itemId: number;
  name: string;
  book: RecipeBook;
  categoryOf: CategoryOf;
}) {
  const category = categoryOf(name);
  return (
    <Flex gap={8} align="center" style={{ minWidth: 0 }}>
      <ItemIcon category={category} name={name} file={book.iconOf(itemId)} size={MATERIAL_ICON} />
      <ItemInfoLink name={name} category={category} />
    </Flex>
  );
}

function CraftName({
  craft,
  book,
  categoryOf,
  tag,
}: {
  craft: ValuedCraft;
  book: RecipeBook;
  categoryOf: CategoryOf;
  /** 이름 옆 표시. 추천 조합이 있으면 "추천", 없으면 구슬 1개당 1위에 "가장 이득". */
  tag?: string;
}) {
  const category = categoryOf(craft.name);
  return (
    <Flex gap={8} align="center">
      <ItemIcon
        category={category}
        name={craft.name}
        file={book.iconOf(craft.itemId)}
        size={ITEM_ICON}
      />
      <Flex vertical gap={2} style={{ minWidth: 0 }}>
        <Flex gap={6} align="center" wrap>
          <ItemInfoLink name={craft.name} category={category} />
          {tag ? (
            <Tag color="processing" style={{ marginInlineEnd: 0 }}>
              {tag}
            </Tag>
          ) : null}
        </Flex>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {book.skillName(craft.recipe.skill)} {rankText(craft.recipe.rank)}
        </Text>
      </Flex>
    </Flex>
  );
}

/** 가진 재료로 채운 개수. 하나도 없으면 아무것도 그리지 않는다. */
function heldText(held: number, count: number): string {
  if (held <= 0) return '';
  return held >= count
    ? `가진 것 ${formatNumber(held)}개로 다 채움, `
    : `가진 것 ${formatNumber(held)}개, `;
}

/** 줄을 펼치면 보이는 재료 내역. 구슬 재료와 사는 재료를 한 목록에 둔다. */
function CraftInputs({
  craft,
  book,
  categoryOf,
  summary,
  pick,
}: {
  craft: ValuedCraft;
  book: RecipeBook;
  categoryOf: CategoryOf;
  /** 좁은 화면은 표에서 뺀 살 재료 값과 최저가를 여기서 보여 준다. */
  summary: boolean;
  /**
   * 추천된 가공품이면 추천대로 만들 때 실제로 쓰는 재료를 보여 준다. 가진 재료를 쓴 만큼 구슬과
   * 살 값이 줄어 있다. 추천이 없으면 한 번 만들 때의 재료를 보여 준다.
   */
  pick?: BeadPlanPick;
}) {
  return (
    <Flex vertical gap={8} style={{ paddingBlock: 4 }}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {pick
          ? `추천대로 ${formatNumber(pick.times)}번 만들 때 드는 재료`
          : '한 번 만들 때 드는 재료'}
      </Text>
      {summary && craft.value.status === 'ok' ? (
        <Flex vertical gap={2}>
          <Flex justify="space-between" gap={16}>
            <Text type="secondary">경매장 최저가</Text>
            <Gold value={craft.value.sale} />
          </Flex>
          <Flex justify="space-between" gap={16}>
            <Text type="secondary">살 재료 값</Text>
            <Gold value={craft.value.materialCost} />
          </Flex>
          {craft.raw.status === 'ok' ? (
            <Flex justify="space-between" gap={16}>
              <Text type="secondary">원재료 시세</Text>
              <Gold value={craft.raw.cost} />
            </Flex>
          ) : null}
        </Flex>
      ) : null}
      {pick ? <PlanUsage pick={pick} book={book} categoryOf={categoryOf} /> : null}
      {pick
        ? null
        : craft.beadRows.map(({ input, held, beads, market }) => (
            <Flex key={`bead-${input.itemId}`} justify="space-between" align="center" gap={16} wrap>
              <Flex gap={6} align="center">
                <MaterialName
                  itemId={input.itemId}
                  name={input.name}
                  book={book}
                  categoryOf={categoryOf}
                />
                <Text className="tnum">{formatNumber(input.count)}개</Text>
              </Flex>
              <Text type="secondary" className="tnum">
                {heldText(held, input.count)}구슬 {formatNumber(beads)}개
                {market.status === 'ok' ? ` (시세 ${formatGold(market.cost)})` : ''}
              </Text>
            </Flex>
          ))}
      {pick
        ? null
        : craft.inputs.map(({ input, held, cost }) => (
            <Flex key={`buy-${input.itemId}`} justify="space-between" align="center" gap={16} wrap>
              <Flex gap={6} align="center">
                <MaterialName
                  itemId={input.itemId}
                  name={input.name}
                  book={book}
                  categoryOf={categoryOf}
                />
                <Text className="tnum">{formatNumber(input.count)}개</Text>
              </Flex>
              <Text
                type={cost.status === 'ok' && cost.from !== 'held' ? undefined : 'secondary'}
                className="tnum"
              >
                {cost.status === 'ok' && cost.from === 'held' ? '' : heldText(held, input.count)}
                {inputCostText(cost)}
              </Text>
            </Flex>
          ))}
    </Flex>
  );
}

/** 추천대로 만들 때 재료마다 쓰는 양. 가진 재료로 채운 만큼 구슬과 살 값이 줄어 있다. */
function PlanUsage({
  pick,
  book,
  categoryOf,
}: {
  pick: BeadPlanPick;
  book: RecipeBook;
  categoryOf: CategoryOf;
}) {
  return (
    <>
      {pick.usage.map((row) => {
        const heldPart = row.held > 0 ? `가진 것 ${formatNumber(row.held)}개, ` : '';
        const rest =
          row.kind === 'bead'
            ? `${heldPart}구슬 ${formatNumber(row.beads)}개`
            : row.held >= row.count
              ? `가진 것 ${formatNumber(row.held)}개로 다 채움`
              : `${heldPart}${formatGold(row.gold)} (${row.from === 'npc' ? 'NPC' : '경매장'})`;
        return (
          <Flex
            key={`${row.kind}-${row.itemId}`}
            justify="space-between"
            align="center"
            gap={16}
            wrap
          >
            <Flex gap={6} align="center">
              <MaterialName
                itemId={row.itemId}
                name={row.name}
                book={book}
                categoryOf={categoryOf}
              />
              <Text className="tnum">{formatNumber(row.count)}개</Text>
            </Flex>
            <Text
              type={row.kind === 'buy' && row.held < row.count ? undefined : 'secondary'}
              className="tnum"
            >
              {rest}
            </Text>
          </Flex>
        );
      })}
    </>
  );
}

/** 추천 조합의 합계. 무엇을 몇 번 만들지는 표의 "추천 제작" 칸이 말한다. */
function PlanSummary({ plan, beads, pending }: { plan: BeadPlan; beads: number; pending: number }) {
  const { token } = theme.useToken();
  if (plan.picks.length === 0) {
    if (pending > 0) return null;
    return (
      <EmptyState
        size="small"
        description="지금 시세로는 가진 구슬과 재료로 차익이 나는 가공품이 없습니다."
      />
    );
  }
  return (
    <Flex vertical gap={12}>
      <Flex gap={24} wrap align="flex-end">
        <Statistic
          title="예상 차익"
          value={formatGold(plan.profit)}
          styles={{
            content: {
              color: token.colorPrimary,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            },
          }}
        />
        <Statistic
          title="쓰는 구슬"
          value={`${formatNumber(plan.beadsUsed)} / ${formatNumber(beads)}개`}
          styles={{
            content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 20 },
          }}
        />
      </Flex>
      <Text type="secondary" style={{ fontSize: 13 }}>
        아래 표에서 <Text strong>추천</Text> 표시가 붙은 가공품을 적힌 횟수만큼 만들면 됩니다.
      </Text>
    </Flex>
  );
}

/** 가공 이득 칸. 음수면 가공이 원재료 값을 깎는다는 뜻이라 빨갛게 둔다. */
function GainCell({ craft }: { craft: ValuedCraft }) {
  if (craft.value.status !== 'ok') return <UnknownCell value={craft.value} />;
  if (craft.raw.status === 'loading')
    return <Skeleton.Input active size="small" style={{ width: 88, minWidth: 88 }} />;
  if (craft.gain === undefined || craft.raw.status !== 'ok')
    return (
      <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        원재료 매물 없음
      </Text>
    );
  return (
    <Flex vertical align="flex-end" gap={2}>
      <Gold value={craft.gain} />
      <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        원재료 {formatGold(craft.raw.cost)}
      </Text>
    </Flex>
  );
}

/** 추천 칸. 몇 번 만들지와, 그만큼 만들 때 쓰는 구슬과 차익 합계. */
function PickCell({ pick }: { pick?: BeadPlanPick }) {
  const { token } = theme.useToken();
  if (!pick) return <Text type="secondary">-</Text>;
  return (
    <Flex vertical align="flex-end" gap={2}>
      <Text strong className="tnum" style={{ whiteSpace: 'nowrap', color: token.colorPrimary }}>
        {formatNumber(pick.times)}번 제작
      </Text>
      <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        차익 {formatGold(pick.profit)}
      </Text>
      <Text type="secondary" className="tnum" style={{ fontSize: 12, textAlign: 'right' }}>
        구슬 {formatNumber(pick.beads)}개
        {pick.heldTimes > 0 ? `, 가진 재료로 ${formatNumber(pick.heldTimes)}번` : ''}
      </Text>
    </Flex>
  );
}

/** 가진 재료 창에 늘어놓을 재료. 가공품에 들어가는 재료만, 구슬 재료와 사는 재료로 나눈다. */
function inventoryItems(crafts: readonly BeadCraft[]) {
  const bead = new Map<number, string>();
  const buy = new Map<number, string>();
  for (const craft of crafts) {
    for (const input of craft.beadInputs) bead.set(input.itemId, input.name);
    for (const input of craft.buyInputs) buy.set(input.itemId, input.name);
  }
  const sorted = (map: Map<number, string>) =>
    [...map.entries()]
      .map(([itemId, name]) => ({ itemId, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { bead: sorted(bead), buy: sorted(buy) };
}

/**
 * 가진 재료 창. 고치는 대로 바로 저장되고 계산에 들어간다. 창 뒤의 표가 따라 바뀐다.
 * 표 안에 입력칸을 두지 않은 것은, 입력하는 동안 순위가 바뀌어 줄이 움직이기 때문이다.
 */
function InventoryModal({
  open,
  onClose,
  crafts,
  inventory,
  setInventory,
  book,
  categoryOf,
}: {
  open: boolean;
  onClose: () => void;
  crafts: readonly BeadCraft[];
  inventory: Inventory;
  setInventory: (next: Inventory) => void;
  book: RecipeBook;
  categoryOf: CategoryOf;
}) {
  const items = useMemo(() => inventoryItems(crafts), [crafts]);
  const setCount = (itemId: number, count: number | null) =>
    setInventory({ ...inventory, [itemId]: count ?? 0 });

  const section = (title: string, rows: { itemId: number; name: string }[]) => (
    <Flex vertical gap={8}>
      <Text strong>{title}</Text>
      {rows.map(({ itemId, name }) => (
        <Flex key={itemId} justify="space-between" align="center" gap={12}>
          <MaterialName itemId={itemId} name={name} book={book} categoryOf={categoryOf} />
          <InputNumber
            aria-label={`${name} 가진 개수`}
            min={0}
            max={MAX_HELD}
            precision={0}
            value={inventory[itemId] ?? null}
            onChange={(value) => setCount(itemId, value)}
            suffix="개"
            size="small"
            className="tnum"
            style={{ width: 104, flex: '0 0 auto' }}
          />
        </Flex>
      ))}
    </Flex>
  );

  return (
    <Modal
      title="가진 재료"
      open={open}
      onCancel={onClose}
      footer={
        <Flex justify="space-between">
          <Button onClick={() => setInventory({})} disabled={Object.keys(inventory).length === 0}>
            초기화
          </Button>
          <Button type="primary" onClick={onClose}>
            닫기
          </Button>
        </Flex>
      }
      styles={{ body: { maxHeight: '60dvh', overflowY: 'auto', paddingInlineEnd: 4 } }}
    >
      <Flex vertical gap={20}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          가진 만큼은 구슬을 쓰지 않고 사지 않은 것으로 계산합니다. 넣은 값은 이 브라우저에
          남습니다.
        </Text>
        {section('구슬로 교환해 둔 재료', items.bead)}
        {section('가진 일반 재료', items.buy)}
      </Flex>
    </Modal>
  );
}

/**
 * 가진 구슬로 무엇을 만들어 팔지.
 *
 * NPC 가 구슬을 받고 내주는 재료는 거래 불가라, 중간 재료로 가공해 팔았을 때의 차익을 비교한다.
 * 계산은 features/dungeonCoins/beadCrafts.ts 에 있다.
 */
export function BeadCraftCalculator({ entry }: { entry: DungeonCoin }) {
  const bookQuery = useRecipeBookQuery();
  const screens = Grid.useBreakpoint();
  return (
    <Card
      title={`${entry.coin.name}로 가공해 팔기`}
      variant="outlined"
      // 좁은 화면은 표 칸이 빠듯해 본문 여백을 줄인다.
      styles={{ body: screens.md === false ? { padding: 12 } : undefined }}
    >
      <QueryState isLoading={bookQuery.isLoading} error={bookQuery.error} isEmpty={false}>
        {bookQuery.data ? <CalculatorBody book={bookQuery.data} entry={entry} /> : null}
      </QueryState>
    </Card>
  );
}

function CalculatorBody({ book, entry }: { book: RecipeBook; entry: DungeonCoin }) {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const queryClient = useQueryClient();

  const [beads, setBeads] = useState<number | null>(null);
  const [todayIsWednesday] = useState(() => isWednesdayInKorea());
  const [wednesday, setWednesday] = useState(todayIsWednesday);
  const [inventory, setInventory] = useInventory(entry.key);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  const [made, setMade] = useState<number[]>([]);

  const baseCrafts = useMemo(() => beadCraftsOf(book, entry.exchanges), [book, entry]);
  const subs = useMemo(() => subMaterialsOf(baseCrafts), [baseCrafts]);
  const crafts = useMemo(() => expandCrafts(baseCrafts, new Set(made)), [baseCrafts, made]);
  const names = useMemo(
    () => [
      ...new Set(
        // 시세는 하위 재료를 어떻게 고르든 같은 이름을 묻는다. 고르는 순간 다시 받지 않도록 기본 목록으로 센다.
        baseCrafts.flatMap((craft) => [
          craft.name,
          ...craft.buyInputs.map((input) => input.name),
          // 원재료 시세. 구슬로 받는 판은 거래 불가라 같은 이름의 거래 가능한 판 시세를 본다.
          ...craft.beadInputs.map((input) => input.name),
        ]),
      ),
    ],
    [baseCrafts],
  );
  const { prices, collectedAt } = useDungeonPrices(names);

  const pricing = {
    priceOf: (name: string) => prices.get(name),
    npcUnitOf: (name: string) => npcUnitPrice(name, wednesday),
  };
  const heldKinds = Object.keys(inventory).length;

  /**
   * 표의 1회 값은 가진 재료를 빼지 않은 값이다. 가진 재료는 쓰면 없어져 여러 가공품이 나눠 쓰므로,
   * 줄마다 빼면 같은 재료를 여러 번 쓴 것처럼 보인다. 가진 재료는 추천 조합(추천 제작 칸)에만 들어간다.
   */
  const ranked = rankCrafts(
    crafts.map((craft) => valueCraft(craft, pricing.priceOf, pricing.npcUnitOf)),
  );
  const pending = names.filter((name) => prices.get(name)?.status === 'loading').length;
  const failed = names.filter((name) => prices.get(name)?.status === 'error');
  const planned = (beads ?? 0) > 0 || heldKinds > 0;
  const plan = planned
    ? planWithInventory(
        crafts,
        beads ?? 0,
        pricing,
        new Map(Object.entries(inventory).map(([id, count]) => [Number(id), count])),
      )
    : null;

  // 추천 조합에 든 줄을 차익 합계가 큰 순으로 맨 위에 두고, 나머지는 구슬 1개당 가치 순서 그대로 둔다.
  const pickOf = new Map((plan?.picks ?? []).map((pick) => [pick.craft.itemId, pick]));
  const recommending = pickOf.size > 0;
  const rows = recommending
    ? [
        ...ranked
          .filter((craft) => pickOf.has(craft.itemId))
          .sort((a, b) => pickOf.get(b.itemId)!.profit - pickOf.get(a.itemId)!.profit),
        ...ranked.filter((craft) => !pickOf.has(craft.itemId)),
      ]
    : ranked;
  const tagOf = (craft: ValuedCraft) =>
    recommending
      ? pickOf.has(craft.itemId)
        ? '추천'
        : undefined
      : craft.best
        ? '가장 이득'
        : undefined;

  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];

  const retry = () => {
    for (const name of failed)
      void queryClient.refetchQueries({ queryKey: ['crafting', 'price', name] });
  };

  // 구슬 1개당 1위는 추천 조합이 없을 때만 보라로 강조한다. 추천이 있으면 강조는 추천 칸이 맡는다.
  const perBeadCell = (craft: ValuedCraft) => {
    if (craft.value.status !== 'ok' || craft.value.perBead === null)
      return <UnknownCell value={craft.value} />;
    const highlight = craft.best && !recommending;
    return (
      <Gold
        value={craft.value.perBead}
        strong={highlight}
        color={highlight ? token.colorPrimary : undefined}
      />
    );
  };

  const beadText = (craft: ValuedCraft) =>
    craft.beadInputs.map((input) => `${input.name} ${formatNumber(input.count)}개`).join(', ');

  const pickColumn: TableColumnsType<ValuedCraft> = recommending
    ? [
        {
          title: '추천 제작',
          key: 'pick',
          align: 'right',
          width: 200,
          render: (_value, craft) => <PickCell pick={pickOf.get(craft.itemId)} />,
        },
      ]
    : [];

  const columns: TableColumnsType<ValuedCraft> = wide
    ? [
        {
          title: '가공품',
          key: 'name',
          render: (_value, craft) => (
            <CraftName craft={craft} book={book} categoryOf={categoryOf} tag={tagOf(craft)} />
          ),
        },
        ...pickColumn,
        {
          title: '1회 구슬',
          key: 'beads',
          align: 'right',
          width: 190,
          render: (_value, craft) => (
            <Flex vertical align="flex-end" gap={2}>
              <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
                {formatNumber(craft.beads)}개
              </Text>
              <Text type="secondary" style={{ fontSize: 12, textAlign: 'right' }}>
                {beadText(craft)}
              </Text>
            </Flex>
          ),
        },
        {
          title: '1회 살 재료 값',
          key: 'materialCost',
          align: 'right',
          width: 150,
          render: (_value, craft) =>
            craft.value.status === 'ok' ? (
              <Gold value={craft.value.materialCost} />
            ) : (
              <UnknownCell value={craft.value} />
            ),
        },
        {
          title: '경매장 최저가',
          key: 'sale',
          align: 'right',
          width: 150,
          render: (_value, craft) =>
            craft.value.status === 'ok' ? (
              <Gold value={craft.value.sale} />
            ) : (
              <UnknownCell value={craft.value} />
            ),
        },
        {
          title: '1회 차익',
          key: 'profit',
          align: 'right',
          width: 150,
          render: (_value, craft) =>
            craft.value.status === 'ok' ? (
              <Gold value={craft.value.profit} />
            ) : (
              <UnknownCell value={craft.value} />
            ),
        },
        {
          title: '가공 이득',
          key: 'gain',
          align: 'right',
          width: 150,
          render: (_value, craft) => <GainCell craft={craft} />,
        },
        {
          title: '구슬 1개당',
          key: 'perBead',
          align: 'right',
          width: 130,
          render: (_value, craft) => perBeadCell(craft),
        },
      ]
    : [
        {
          // 768px 미만에서는 칸을 합친다. 가로로 밀면 가장 중요한 칸이 화면 밖으로 나간다.
          // 살 재료 값과 최저가는 줄을 펼치면 보인다.
          title: '가공품',
          key: 'name',
          render: (_value, craft) => {
            const pick = pickOf.get(craft.itemId);
            return (
              <Flex vertical gap={4}>
                <CraftName craft={craft} book={book} categoryOf={categoryOf} tag={tagOf(craft)} />
                {pick ? (
                  <Text strong className="tnum" style={{ fontSize: 13, color: token.colorPrimary }}>
                    {formatNumber(pick.times)}번 제작
                    {pick.heldTimes > 0 ? ` (가진 재료로 ${formatNumber(pick.heldTimes)}번)` : ''},
                    차익 {formatGold(pick.profit)}
                  </Text>
                ) : null}
                <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                  1회 구슬 {formatNumber(craft.beads)}개
                  {craft.value.status === 'ok'
                    ? `, 1회 차익 ${formatGold(craft.value.profit)}`
                    : ''}
                </Text>
                {craft.gain !== undefined ? (
                  <Text
                    type={craft.gain < 0 ? 'danger' : 'secondary'}
                    className="tnum"
                    style={{ fontSize: 12 }}
                  >
                    가공 이득 {formatGold(craft.gain)}
                  </Text>
                ) : null}
              </Flex>
            );
          },
        },
        {
          title: '구슬 1개당',
          key: 'perBead',
          align: 'right',
          width: 104,
          render: (_value, craft) => perBeadCell(craft),
        },
      ];

  return (
    <Flex vertical gap={16}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        구슬로 받는 재료는 거래할 수 없어, 중간 재료로 가공해 팔았을 때 남는 골드를 비교합니다.
      </Text>

      <Form layout="vertical" style={{ marginBottom: 0 }}>
        <Flex gap={24} wrap align="flex-end">
          <Form.Item label="가진 구슬" htmlFor="bead-count" style={{ marginBottom: 0 }}>
            <InputNumber
              id="bead-count"
              min={0}
              max={MAX_BEADS}
              precision={0}
              value={beads}
              onChange={(value) => setBeads(value)}
              // 예시 숫자를 placeholder 로 두면 이미 들어간 값처럼 보인다. 비워 두고 아래에서 안내한다.
              suffix="개"
              className="tnum"
              style={{ width: 140 }}
            />
          </Form.Item>
          <Button icon={<BackpackIcon />} onClick={() => setInventoryOpen(true)}>
            가진 재료{heldKinds > 0 ? ` ${formatNumber(heldKinds)}종` : ''}
          </Button>
          <Checkbox checked={wednesday} onChange={(event) => setWednesday(event.target.checked)}>
            수요일 상점 할인 {WEDNESDAY_DISCOUNT_PERCENT}% 적용
            {todayIsWednesday ? ' (오늘 수요일)' : ''}
          </Checkbox>
        </Flex>
      </Form>

      {subs.length > 0 ? (
        <Flex vertical gap={8}>
          <Flex gap={12} align="center" wrap>
            <Text strong>구슬로 직접 만들 하위 재료</Text>
            <Button
              size="small"
              type="link"
              onClick={() => setMade(subs.map((sub) => sub.itemId))}
              disabled={made.length === subs.length}
            >
              모두 선택
            </Button>
            <Button
              size="small"
              type="link"
              onClick={() => setMade([])}
              disabled={made.length === 0}
            >
              선택 해제
            </Button>
          </Flex>
          <Flex wrap style={{ columnGap: 24, rowGap: 8 }}>
            {subs.map((sub) => (
              <Checkbox
                key={sub.itemId}
                checked={made.includes(sub.itemId)}
                onChange={(event) =>
                  setMade(
                    event.target.checked
                      ? [...made, sub.itemId]
                      : made.filter((id) => id !== sub.itemId),
                  )
                }
              >
                <MaterialName
                  itemId={sub.itemId}
                  name={sub.name}
                  book={book}
                  categoryOf={categoryOf}
                />
              </Checkbox>
            ))}
          </Flex>
        </Flex>
      ) : null}

      <InventoryModal
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        crafts={crafts}
        inventory={inventory}
        setInventory={setInventory}
        book={book}
        categoryOf={categoryOf}
      />

      {pending > 0 ? (
        <Flex gap={8} align="center">
          <Spin size="small" />
          <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
            시세 {formatNumber(pending)}종을 받는 중입니다
          </Text>
        </Flex>
      ) : null}

      {plan ? (
        <PlanSummary plan={plan} beads={beads ?? 0} pending={pending} />
      ) : (
        <Alert
          type="info"
          showIcon
          message="가진 구슬 수를 입력하면 무엇을 몇 번 만들어 팔지와 예상 차익을 계산합니다. 이미 교환해 둔 재료나 가진 재료는 '가진 재료'에 넣으면 함께 계산합니다."
        />
      )}

      {failed.length > 0 ? (
        <Alert
          type="error"
          showIcon
          role="alert"
          message={`시세 ${formatNumber(failed.length)}종을 받지 못했습니다`}
          description="그 시세가 필요한 가공품은 차익을 매기지 못해 표 아래쪽에 둡니다."
          action={
            <Button size="small" icon={<RefreshIcon />} onClick={retry}>
              다시 받기
            </Button>
          }
        />
      ) : null}

      <Table<ValuedCraft>
        columns={columns}
        dataSource={rows}
        rowKey="itemId"
        size="small"
        pagination={false}
        expandable={{
          expandedRowRender: (craft) => (
            <CraftInputs
              craft={craft}
              book={book}
              categoryOf={categoryOf}
              summary={!wide}
              pick={pickOf.get(craft.itemId)}
            />
          ),
        }}
      />

      <Text type="secondary" style={{ fontSize: 12 }}>
        차익은 가공품 경매장 최저가에서 구슬 말고 사야 하는 재료 값을 뺀 값입니다. 가공 이득은 구슬
        재료까지 경매장 시세로 샀다고 칠 때 남는 값으로, 음수면 가공하면 원재료 값보다 싸집니다.
        가진 재료는 값을 치르지 않은 것으로 봅니다. 판매 수수료는 빼지 않았고, 여러 번 만들면 재료
        매물이 모자라거나 판매가가 내려갈 수 있습니다.
        {collectedAt ? ` 시세는 ${snapshotAgeLabel(collectedAt)} 모은 값입니다.` : ''}
      </Text>
    </Flex>
  );
}
