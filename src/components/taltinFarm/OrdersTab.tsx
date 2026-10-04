import { useMemo } from 'react';
import { Button, Card, Collapse, Flex, Grid, InputNumber, Select, Table, Typography, theme, type TableColumnsType } from 'antd';
import { StarFillIcon, StarIcon } from '@/components/icons';
import { GainCell, GoldCell, MaterialList } from '@/components/taltinFarm/shared';
import {
  FARM_ORDERS,
  MAX_REWARD_QTY,
  MAX_REWARD_SLOTS,
  REWARD_ITEMS,
  type FarmOrder,
} from '@/features/taltinFarm/data';
import { useFarmState, type FarmState } from '@/features/taltinFarm/store';
import { byGainDesc, orderOutcome, type OrderOutcome, type Quote, type RewardPick } from '@/features/taltinFarm/value';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

interface OrderRow {
  order: FarmOrder;
  pinned: boolean;
  picks: readonly RewardPick[];
  outcome: OrderOutcome;
}

const REWARD_OPTIONS = REWARD_ITEMS.map((reward) => ({ value: reward.key, label: reward.label }));

/** 주문 한 건의 보상 칸들. 앞 칸을 고르면 다음 칸이 열린다. */
function RewardInputs({
  orderName,
  picks,
  setPicks,
}: {
  orderName: string;
  picks: readonly RewardPick[];
  setPicks: (next: RewardPick[]) => void;
}) {
  const slots = picks.length < MAX_REWARD_SLOTS ? [...picks, null] : picks;
  return (
    <Flex vertical gap={6}>
      {slots.map((pick, index) => (
        <Flex key={index} gap={6} align="center">
          <Select
            aria-label={`${orderName} 보상 ${index + 1}`}
            size="small"
            placeholder="보상"
            allowClear
            value={pick?.key ?? null}
            options={REWARD_OPTIONS.filter(
              (option) => option.value === pick?.key || !picks.some((other) => other.key === option.value),
            )}
            onChange={(key: string | null | undefined) => {
              const next = [...picks];
              if (!key) next.splice(index, 1);
              else next[index] = { key, qty: pick?.qty ?? 1 };
              setPicks(next);
            }}
            popupMatchSelectWidth={false}
            style={{ flex: '1 1 0', minWidth: 0 }}
          />
          <InputNumber<number>
            aria-label={`${orderName} 보상 ${index + 1} 개수`}
            size="small"
            min={1}
            max={MAX_REWARD_QTY}
            precision={0}
            disabled={!pick}
            value={pick?.qty ?? null}
            onChange={(qty) => {
              if (!pick) return;
              const next = [...picks];
              next[index] = { ...pick, qty: qty ?? 1 };
              setPicks(next);
            }}
            suffix="개"
            className="tnum"
            style={{ width: 72, flex: 'none' }}
          />
        </Flex>
      ))}
    </Flex>
  );
}

/** 보상 다섯 가지의 가치. 경매장에 오르지 않는 보상이라 직접 고친다. */
function RewardValues({ state, update }: { state: FarmState; update: ReturnType<typeof useFarmState>[1] }) {
  const changed = REWARD_ITEMS.some((reward) => state.rewardValues[reward.key] !== undefined);
  return (
    <Collapse
      size="small"
      items={[
        {
          key: 'values',
          label: changed ? '보상 가치 (고침)' : '보상 가치',
          children: (
            <Flex vertical gap={12}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 12,
                }}
              >
                {REWARD_ITEMS.map((reward) => (
                  <Flex key={reward.key} vertical gap={4} style={{ minWidth: 0 }}>
                    <label htmlFor={`reward-${reward.key}`}>
                      <Text style={{ fontSize: 13 }}>{reward.label}</Text>
                    </label>
                    <InputNumber<number>
                      id={`reward-${reward.key}`}
                      min={0}
                      precision={0}
                      controls={false}
                      value={state.rewardValues[reward.key] ?? reward.value}
                      formatter={(raw) => (raw === undefined ? '' : String(raw).replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
                      parser={(text) => Number((text ?? '').replace(/,/g, ''))}
                      onChange={(value) =>
                        update((previous) => {
                          const rewardValues = { ...previous.rewardValues };
                          if (value === null || value === reward.value) delete rewardValues[reward.key];
                          else rewardValues[reward.key] = value;
                          return { ...previous, rewardValues };
                        })
                      }
                      suffix="G"
                      className="tnum"
                      style={{ width: '100%' }}
                    />
                  </Flex>
                ))}
              </div>
              {changed ? (
                <Button
                  size="small"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => update((previous) => ({ ...previous, rewardValues: {} }))}
                >
                  기본값으로
                </Button>
              ) : null}
            </Flex>
          ),
        },
      ]}
    />
  );
}

/** 생활 협회 주문 납품 손익. */
export function OrdersTab({ quote, pending }: { quote: Quote; pending: boolean }) {
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const [state, update] = useFarmState();

  const rows = useMemo((): OrderRow[] => {
    const all = FARM_ORDERS.map((order): OrderRow => {
      const picks = state.rewards[order.name] ?? [];
      return {
        order,
        pinned: state.pinned.includes(order.name),
        picks,
        outcome: orderOutcome(order, picks, REWARD_ITEMS, state.rewardValues, quote),
      };
    });
    // 고정한 주문이 먼저, 그 안과 밖은 원래 순서.
    return [...all.filter((row) => row.pinned), ...all.filter((row) => !row.pinned)];
  }, [state, quote]);

  const togglePin = (name: string) =>
    update((previous) => ({
      ...previous,
      pinned: previous.pinned.includes(name)
        ? previous.pinned.filter((each) => each !== name)
        : [...previous.pinned, name],
    }));

  const setPicks = (name: string, picks: RewardPick[]) =>
    update((previous) => {
      const rewards = { ...previous.rewards };
      if (picks.length === 0) delete rewards[name];
      else rewards[name] = picks;
      return { ...previous, rewards };
    });

  const anyPicked = Object.keys(state.rewards).length > 0;

  const pinButton = (row: OrderRow) => (
    <Button
      type="text"
      size="small"
      aria-label={row.pinned ? `${row.order.name} 고정 풀기` : `${row.order.name} 위에 고정`}
      aria-pressed={row.pinned}
      icon={row.pinned ? <StarFillIcon style={{ color: token.colorPrimary }} /> : <StarIcon />}
      onClick={() => togglePin(row.order.name)}
    />
  );

  const rewards = (row: OrderRow) => (
    <RewardInputs orderName={row.order.name} picks={row.picks} setPicks={(next) => setPicks(row.order.name, next)} />
  );

  // antd 는 내림차순일 때 이 비교를 뒤집는다. 손익을 모르는 줄이 내림차순에서 맨 뒤로 가게 오름차순에서는 맨 앞에 둔다.
  const profitSorter = (a: OrderRow, b: OrderRow) => byGainDesc(b.outcome.profit, a.outcome.profit);

  const columns: TableColumnsType<OrderRow> = wide
    ? [
        { key: 'pin', width: 44, render: (_value, row) => pinButton(row) },
        {
          title: '주문',
          key: 'name',
          width: 200,
          render: (_value, row) => <Text strong>{row.order.name}</Text>,
        },
        {
          title: '필요 물품',
          key: 'materials',
          render: (_value, row) => <MaterialList materials={row.order.materials} quote={quote} />,
        },
        {
          title: '물품 값',
          key: 'cost',
          align: 'right',
          width: 120,
          render: (_value, row) => <GoldCell value={row.outcome.cost} pending={pending} />,
        },
        { title: '납품 보상', key: 'rewards', width: 260, render: (_value, row) => rewards(row) },
        {
          title: '보상 가치',
          key: 'reward',
          align: 'right',
          width: 120,
          render: (_value, row) =>
            row.outcome.reward === null ? (
              <Text type="secondary">-</Text>
            ) : (
              <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
                {formatGold(row.outcome.reward)}
              </Text>
            ),
        },
        {
          title: '손익',
          key: 'profit',
          align: 'right',
          width: 130,
          sorter: profitSorter,
          sortDirections: ['descend', 'ascend'],
          render: (_value, row) => (
            <GainCell value={row.outcome.profit} pending={pending && row.outcome.reward !== null} />
          ),
        },
      ]
    : [
        {
          // 768px 미만에서는 칸을 합친다. 손익만 제 칸에 둔다.
          title: '주문',
          key: 'name',
          render: (_value, row) => (
            <Flex vertical gap={6}>
              <Flex gap={4} align="center">
                {pinButton(row)}
                <Text strong>{row.order.name}</Text>
              </Flex>
              <MaterialList materials={row.order.materials} quote={quote} />
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                물품 값 {row.outcome.cost === null ? '-' : formatGold(row.outcome.cost)}
                {row.outcome.reward === null ? '' : `, 보상 가치 ${formatGold(row.outcome.reward)}`}
              </Text>
              {rewards(row)}
            </Flex>
          ),
        },
        {
          title: '손익',
          key: 'profit',
          align: 'right',
          width: 110,
          sorter: profitSorter,
          sortDirections: ['descend', 'ascend'],
          render: (_value, row) => (
            <GainCell value={row.outcome.profit} pending={pending && row.outcome.reward !== null} />
          ),
        },
      ];

  return (
    <Flex vertical gap={12}>
      <RewardValues state={state} update={update} />
      {anyPicked ? (
        <Button
          size="small"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => update((previous) => ({ ...previous, rewards: {} }))}
        >
          고른 보상 모두 지우기
        </Button>
      ) : null}
      <Card variant="outlined" styles={{ body: { padding: 0 } }}>
        <Table<OrderRow>
          columns={columns}
          dataSource={rows}
          rowKey={(row) => row.order.name}
          size="small"
          pagination={false}
          showSorterTooltip={false}
        />
      </Card>
    </Flex>
  );
}
