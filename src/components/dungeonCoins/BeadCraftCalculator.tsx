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
  planWithInventory,
  rankCrafts,
  valueCraft,
  type BeadCraft,
  type BeadPlan,
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
}: {
  craft: ValuedCraft;
  book: RecipeBook;
  categoryOf: CategoryOf;
}) {
  const category = categoryOf(craft.name);
  return (
    <Flex gap={8} align="center">
      <ItemIcon category={category} name={craft.name} file={book.iconOf(craft.itemId)} size={ITEM_ICON} />
      <Flex vertical gap={2} style={{ minWidth: 0 }}>
        <Flex gap={6} align="center" wrap>
          <ItemInfoLink name={craft.name} category={category} />
          {craft.best ? (
            <Tag color="processing" style={{ marginInlineEnd: 0 }}>
              가장 이득
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
  return held >= count ? `가진 것 ${formatNumber(held)}개로 다 채움, ` : `가진 것 ${formatNumber(held)}개, `;
}

/** 줄을 펼치면 보이는 재료 내역. 구슬 재료와 사는 재료를 한 목록에 둔다. */
function CraftInputs({
  craft,
  book,
  categoryOf,
  summary,
}: {
  craft: ValuedCraft;
  book: RecipeBook;
  categoryOf: CategoryOf;
  /** 좁은 화면은 표에서 뺀 살 재료 값과 최저가를 여기서 보여 준다. */
  summary: boolean;
}) {
  return (
    <Flex vertical gap={8} style={{ paddingBlock: 4 }}>
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
        </Flex>
      ) : null}
      {craft.beadRows.map(({ input, held, beads }) => (
        <Flex key={`bead-${input.itemId}`} justify="space-between" align="center" gap={16} wrap>
          <Flex gap={6} align="center">
            <MaterialName itemId={input.itemId} name={input.name} book={book} categoryOf={categoryOf} />
            <Text className="tnum">{formatNumber(input.count)}개</Text>
          </Flex>
          <Text type="secondary" className="tnum">
            {heldText(held, input.count)}구슬 {formatNumber(beads)}개
          </Text>
        </Flex>
      ))}
      {craft.inputs.map(({ input, held, cost }) => (
        <Flex key={`buy-${input.itemId}`} justify="space-between" align="center" gap={16} wrap>
          <Flex gap={6} align="center">
            <MaterialName itemId={input.itemId} name={input.name} book={book} categoryOf={categoryOf} />
            <Text className="tnum">{formatNumber(input.count)}개</Text>
          </Flex>
          <Text type={cost.status === 'ok' && cost.from !== 'held' ? undefined : 'secondary'} className="tnum">
            {cost.status === 'ok' && cost.from === 'held' ? '' : heldText(held, input.count)}
            {inputCostText(cost)}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}

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
          styles={{ content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 20 } }}
        />
      </Flex>
      <Flex vertical gap={4}>
        {plan.picks.map((pick) => (
          <Flex key={pick.craft.itemId} justify="space-between" gap={16} wrap>
            <Text>
              {pick.craft.name}{' '}
              <Text className="tnum">{formatNumber(pick.times)}번</Text>
              <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
                {' '}
                (구슬 {formatNumber(pick.beads)}개
                {pick.heldTimes > 0 ? `, 가진 재료로 ${formatNumber(pick.heldTimes)}번` : ''})
              </Text>
            </Text>
            <Gold value={pick.profit} />
          </Flex>
        ))}
      </Flex>
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
          가진 만큼은 구슬을 쓰지 않고 사지 않은 것으로 계산합니다. 넣은 값은 이 브라우저에 남습니다.
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
      <QueryState
        isLoading={bookQuery.isLoading}
        error={bookQuery.error}
        isEmpty={false}
      >
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

  const crafts = useMemo(() => beadCraftsOf(book, entry.exchanges), [book, entry]);
  const names = useMemo(
    () => [
      ...new Set(crafts.flatMap((craft) => [craft.name, ...craft.buyInputs.map((input) => input.name)])),
    ],
    [crafts],
  );
  const { prices, collectedAt } = useDungeonPrices(names);

  const pricing = {
    priceOf: (name: string) => prices.get(name),
    npcUnitOf: (name: string) => npcUnitPrice(name, wednesday),
  };
  const heldOf = (itemId: number) => inventory[itemId] ?? 0;
  const heldKinds = Object.keys(inventory).length;

  // 표는 한 번 만들 때의 값이다. 가진 재료가 있으면 그만큼 빼고 매긴다.
  const ranked = rankCrafts(
    crafts.map((craft) => valueCraft(craft, pricing.priceOf, pricing.npcUnitOf, heldOf)),
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

  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];

  const retry = () => {
    for (const name of failed)
      void queryClient.refetchQueries({ queryKey: ['crafting', 'price', name] });
  };

  const perBeadCell = (craft: ValuedCraft) => {
    if (craft.value.status !== 'ok') return <UnknownCell value={craft.value} />;
    if (craft.value.perBead === null)
      return (
        <Text
          strong={craft.best}
          style={{ whiteSpace: 'nowrap', color: craft.best ? token.colorPrimary : undefined }}
        >
          구슬 불필요
        </Text>
      );
    return (
      <Gold
        value={craft.value.perBead}
        strong={craft.best}
        color={craft.best ? token.colorPrimary : undefined}
      />
    );
  };

  const beadText = (craft: ValuedCraft) =>
    craft.beadInputs.map((input) => `${input.name} ${formatNumber(input.count)}개`).join(', ');

  const columns: TableColumnsType<ValuedCraft> = wide
    ? [
        {
          title: '가공품',
          key: 'name',
          render: (_value, craft) => <CraftName craft={craft} book={book} categoryOf={categoryOf} />,
        },
        {
          title: '구슬',
          key: 'beads',
          align: 'right',
          width: 200,
          render: (_value, craft) => (
            <Flex vertical align="flex-end" gap={2}>
              <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
                {formatNumber(craft.needBeads)}개
              </Text>
              <Text type="secondary" style={{ fontSize: 12, textAlign: 'right' }}>
                {craft.usesHeld ? '가진 재료 반영' : beadText(craft)}
              </Text>
            </Flex>
          ),
        },
        {
          title: '살 재료 값',
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
            craft.value.status === 'ok' ? <Gold value={craft.value.sale} /> : <UnknownCell value={craft.value} />,
        },
        {
          title: '차익',
          key: 'profit',
          align: 'right',
          width: 150,
          render: (_value, craft) =>
            craft.value.status === 'ok' ? <Gold value={craft.value.profit} /> : <UnknownCell value={craft.value} />,
        },
        {
          title: '구슬 1개당',
          key: 'perBead',
          align: 'right',
          width: 140,
          render: (_value, craft) => perBeadCell(craft),
        },
      ]
    : [
        {
          // 768px 미만에서는 칸을 합친다. 가로로 밀면 가장 중요한 구슬 1개당 칸이 화면 밖으로 나간다.
          // 살 재료 값과 최저가는 줄을 펼치면 보인다.
          title: '가공품',
          key: 'name',
          render: (_value, craft) => (
            <Flex vertical gap={4}>
              <CraftName craft={craft} book={book} categoryOf={categoryOf} />
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                구슬 {formatNumber(craft.needBeads)}개
                {craft.value.status === 'ok' ? `, 차익 ${formatGold(craft.value.profit)}` : ''}
              </Text>
            </Flex>
          ),
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
        dataSource={ranked}
        rowKey="itemId"
        size="small"
        pagination={false}
        expandable={{
          expandedRowRender: (craft) => (
            <CraftInputs craft={craft} book={book} categoryOf={categoryOf} summary={!wide} />
          ),
        }}
      />

      <Text type="secondary" style={{ fontSize: 12 }}>
        차익은 가공품 경매장 최저가에서 구슬 말고 사야 하는 재료 값을 뺀 값입니다. 가진 재료는 값을
        치르지 않은 것으로 봅니다. 판매 수수료는 빼지 않았고, 여러 번 만들면 재료 매물이 모자라거나
        판매가가 내려갈 수 있습니다.
        {collectedAt ? ` 시세는 ${snapshotAgeLabel(collectedAt)} 모은 값입니다.` : ''}
      </Text>
    </Flex>
  );
}
