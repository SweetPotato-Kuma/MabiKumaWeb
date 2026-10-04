import { useMemo, useState } from 'react';
import { Button, Card, Flex, Grid, InputNumber, Segmented, Table, Typography, type TableColumnsType } from 'antd';
import { FarmItemLink, GainCell, GoldCell } from '@/components/taltinFarm/shared';
import { DUCAT_GEM, DUCAT_ITEMS, type DucatGroup, type DucatItem } from '@/features/taltinFarm/data';
import { byGainDesc, ducatOutcome, goldPerDucat, type DucatOutcome, type Quote } from '@/features/taltinFarm/value';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

interface DucatRow {
  item: DucatItem;
  outcome: DucatOutcome;
}

type GroupFilter = 'all' | DucatGroup;

const GROUP_OPTIONS: { value: GroupFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'crafted', label: '가공품' },
  { value: 'normal', label: '일반' },
  { value: 'fine', label: '고급' },
  { value: 'finest', label: '최고급' },
];

/** 비율은 1골드 안팎이라 소수 둘째 자리까지 다룬다. */
const RATE_PRECISION = 2;
const roundRate = (rate: number) => Number(rate.toFixed(RATE_PRECISION));

/** 물품을 경매장에 팔지, NPC 에 넘겨 두카트로 받을지. 두카트가 더 남는 것부터. */
export function DucatTab({ quote, pending }: { quote: Quote; pending: boolean }) {
  const formatGold = useGoldFormatter();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;

  /**
   * 직접 넣은 비율. undefined 면 손대지 않은 것이라 칸에 시세 비율을 채워 보인다. 칸을 지우는 중(null)에는
   * 칸을 비워 두어야 새 값을 칠 수 있다. 그동안 계산은 시세 비율로 한다.
   */
  const [typedRate, setTypedRate] = useState<number | null | undefined>(undefined);
  const [group, setGroup] = useState<GroupFilter>('all');

  const gemPrice = quote(DUCAT_GEM.name);
  const autoRate = goldPerDucat(gemPrice);
  const typed = typeof typedRate === 'number' && typedRate > 0;
  const rate = typed ? (typedRate as number) : autoRate;

  const rows = useMemo(
    () =>
      DUCAT_ITEMS.filter((item) => group === 'all' || item.group === group)
        .map((item): DucatRow => ({ item, outcome: ducatOutcome(item, rate, quote) }))
        .sort((a, b) => byGainDesc(a.outcome.gain, b.outcome.gain)),
    [group, rate, quote],
  );

  const ducatText = (row: DucatRow) => (
    <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
      {formatNumber(row.item.ducats)}
    </Text>
  );

  const columns: TableColumnsType<DucatRow> = wide
    ? [
        { title: '물품', key: 'name', render: (_value, row) => <FarmItemLink name={row.item.name} short /> },
        { title: '두카트', key: 'ducats', align: 'right', width: 110, render: (_value, row) => ducatText(row) },
        {
          title: '골드 환산액',
          key: 'exchanged',
          align: 'right',
          width: 140,
          render: (_value, row) => <GoldCell value={row.outcome.exchanged} pending={pending} />,
        },
        {
          title: '경매장 판매가',
          key: 'market',
          align: 'right',
          width: 140,
          render: (_value, row) => <GoldCell value={row.outcome.market} pending={pending} />,
        },
        {
          title: '차익',
          key: 'gain',
          align: 'right',
          width: 130,
          render: (_value, row) => <GainCell value={row.outcome.gain} pending={pending} />,
        },
      ]
    : [
        {
          // 768px 미만에서는 칸을 합친다. 차익만 제 칸에 둔다.
          title: '물품',
          key: 'name',
          render: (_value, row) => (
            <Flex vertical gap={4}>
              <FarmItemLink name={row.item.name} short />
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {formatNumber(row.item.ducats)} 두카트, 환산 {formatGold(row.outcome.exchanged)}, 경매장{' '}
                {formatGold(row.outcome.market)}
              </Text>
            </Flex>
          ),
        },
        {
          title: '차익',
          key: 'gain',
          align: 'right',
          width: 110,
          render: (_value, row) => <GainCell value={row.outcome.gain} pending={pending} />,
        },
      ];

  return (
    <Flex vertical gap={12}>
      <Flex gap={12} align="center" wrap>
        <Flex gap={8} align="center">
          <label htmlFor="ducat-rate">
            <Text>두카트 비율</Text>
          </label>
          <InputNumber<number>
            id="ducat-rate"
            min={0}
            step={0.01}
            precision={RATE_PRECISION}
            controls={false}
            value={typedRate !== undefined ? typedRate : autoRate === null ? null : roundRate(autoRate)}
            placeholder={autoRate === null ? undefined : String(roundRate(autoRate))}
            onChange={(value) => setTypedRate(value)}
            prefix={<Text type="secondary">1 두카트 =</Text>}
            suffix="G"
            className="tnum"
            style={{ width: 170 }}
          />
        </Flex>
        <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
          {typed
            ? '직접 넣은 비율'
            : gemPrice === null
              ? `${DUCAT_GEM.name} 시세 없음`
              : `${DUCAT_GEM.name} ${formatGold(gemPrice)} / ${formatNumber(DUCAT_GEM.ducats)}`}
        </Text>
        {typedRate !== undefined ? (
          <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={() => setTypedRate(undefined)}>
            시세로 되돌리기
          </Button>
        ) : null}
      </Flex>

      <Segmented<GroupFilter>
        aria-label="물품 종류"
        options={GROUP_OPTIONS}
        value={group}
        onChange={setGroup}
        style={{ alignSelf: 'flex-start' }}
      />

      <Card variant="outlined" styles={{ body: { padding: 0 } }}>
        <Table<DucatRow>
          columns={columns}
          dataSource={rows}
          rowKey={(row) => row.item.name}
          size="small"
          pagination={false}
        />
      </Card>
    </Flex>
  );
}
