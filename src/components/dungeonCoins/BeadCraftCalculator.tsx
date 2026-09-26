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
import { RefreshIcon } from '@/components/icons';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { useMarketPrices } from '@/features/crafting/market';
import {
  WEDNESDAY_DISCOUNT_PERCENT,
  isWednesdayInKorea,
  npcUnitPrice,
} from '@/features/crafting/npcPrices';
import { rankText, useRecipeBookQuery, type RecipeBook } from '@/features/crafting/recipes';
import {
  MAX_BEADS,
  beadCraftsOf,
  planBeads,
  rankCrafts,
  valueCraft,
  type BeadPlan,
  type CraftValue,
  type InputCost,
  type ValuedCraft,
} from '@/features/dungeonCoins/beadCrafts';
import type { DungeonCoin } from '@/features/dungeonCoins/exchanges';
import { formatGold, formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 가공품 그림 한 변. 교환 표와 같다. */
const ITEM_ICON = 28;

const REASON_TEXT: Record<Extract<CraftValue, { status: 'unknown' }>['reason'], string> = {
  error: '받지 못함',
  'no-sale': '판매 매물 없음',
  'no-material': '재료 매물 없음',
};

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

function CraftName({
  craft,
  book,
  categoryOf,
}: {
  craft: ValuedCraft;
  book: RecipeBook;
  categoryOf: (name: string) => string | undefined;
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

/** 줄을 펼치면 보이는 재료 내역. 구슬 재료와 사는 재료를 한 목록에 둔다. */
function CraftInputs({
  craft,
  categoryOf,
  summary,
}: {
  craft: ValuedCraft;
  categoryOf: (name: string) => string | undefined;
  /** 좁은 화면은 표에서 뺀 살 재료 값과 최저가를 여기서 보여 준다. */
  summary: boolean;
}) {
  return (
    <Flex vertical gap={6} style={{ paddingBlock: 4 }}>
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
      {craft.beadInputs.map((input) => (
        <Flex key={`bead-${input.itemId}`} justify="space-between" gap={16} wrap>
          <Text>
            <ItemInfoLink name={input.name} category={categoryOf(input.name)} />{' '}
            <Text className="tnum">{formatNumber(input.count)}개</Text>
          </Text>
          <Text type="secondary" className="tnum">
            구슬 {formatNumber(input.beads)}개
          </Text>
        </Flex>
      ))}
      {craft.inputs.map(({ input, cost }) => (
        <Flex key={`buy-${input.itemId}`} justify="space-between" gap={16} wrap>
          <Text>
            <ItemInfoLink name={input.name} category={categoryOf(input.name)} />{' '}
            <Text className="tnum">{formatNumber(input.count)}개</Text>
          </Text>
          <Text type={cost.status === 'ok' ? undefined : 'secondary'} className="tnum">
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
        description="지금 시세로는 이 구슬 수로 차익이 나는 가공품이 없습니다."
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
                (구슬 {formatNumber(pick.beads)}개)
              </Text>
            </Text>
            <Gold value={pick.profit} />
          </Flex>
        ))}
      </Flex>
    </Flex>
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

  const crafts = useMemo(() => beadCraftsOf(book, entry.exchanges), [book, entry]);
  const names = useMemo(
    () => [
      ...new Set(crafts.flatMap((craft) => [craft.name, ...craft.buyInputs.map((input) => input.name)])),
    ],
    [crafts],
  );
  const prices = useMarketPrices(names);

  const ranked = rankCrafts(
    crafts.map((craft) =>
      valueCraft(craft, (name) => prices.get(name), (name) => npcUnitPrice(name, wednesday)),
    ),
  );
  const pending = names.filter((name) => prices.get(name)?.status === 'loading').length;
  const failed = names.filter((name) => prices.get(name)?.status === 'error');
  const plan = beads ? planBeads(ranked, beads) : null;

  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];

  const retry = () => {
    for (const name of failed)
      void queryClient.refetchQueries({ queryKey: ['crafting', 'price', name] });
  };

  const perBeadCell = (craft: ValuedCraft) =>
    craft.value.status === 'ok' ? (
      <Gold
        value={craft.value.perBead}
        strong={craft.best}
        color={craft.best ? token.colorPrimary : undefined}
      />
    ) : (
      <UnknownCell value={craft.value} />
    );

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
                {formatNumber(craft.beads)}개
              </Text>
              <Text type="secondary" style={{ fontSize: 12, textAlign: 'right' }}>
                {beadText(craft)}
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
                구슬 {formatNumber(craft.beads)}개
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
              placeholder="120"
              className="tnum"
              style={{ width: 140 }}
            />
          </Form.Item>
          <Checkbox checked={wednesday} onChange={(event) => setWednesday(event.target.checked)}>
            수요일 상점 할인 {WEDNESDAY_DISCOUNT_PERCENT}% 적용
            {todayIsWednesday ? ' (오늘 수요일)' : ''}
          </Checkbox>
        </Flex>
      </Form>

      {pending > 0 ? (
        <Flex gap={8} align="center">
          <Spin size="small" />
          <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
            시세 {formatNumber(pending)}종을 받는 중입니다
          </Text>
        </Flex>
      ) : null}

      {plan && beads ? <PlanSummary plan={plan} beads={beads} pending={pending} /> : null}

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
            <CraftInputs craft={craft} categoryOf={categoryOf} summary={!wide} />
          ),
        }}
      />

      <Text type="secondary" style={{ fontSize: 12 }}>
        차익은 가공품 경매장 최저가에서 구슬 말고 사야 하는 재료 값을 뺀 값입니다. 판매 수수료는
        빼지 않았고, 여러 번 만들면 재료 매물이 모자라거나 판매가가 내려갈 수 있습니다.
      </Text>
    </Flex>
  );
}
