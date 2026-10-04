import { useMemo, useState } from 'react';
import { Card, Col, Flex, Grid, InputNumber, Row, Segmented, Statistic, Table, Typography, theme, type TableColumnsType } from 'antd';
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

/** 두카트 1개 값은 1골드 안팎이라 소수 둘째 자리까지 적는다. */
const rateText = (rate: number) => `${rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} G`;

/** 물품을 경매장에 팔지, NPC 에 넘겨 두카트로 받을지. 두카트가 더 남는 것부터. */
export function DucatTab({ quote, pending }: { quote: Quote; pending: boolean }) {
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;

  const [typedRate, setTypedRate] = useState<number | null>(null);
  const [group, setGroup] = useState<GroupFilter>('all');

  const gemPrice = quote(DUCAT_GEM.name);
  const autoRate = goldPerDucat(gemPrice);
  const rate = typedRate !== null && typedRate > 0 ? typedRate : autoRate;

  const rows = useMemo(
    () =>
      DUCAT_ITEMS.filter((item) => group === 'all' || item.group === group)
        .map((item): DucatRow => ({ item, outcome: ducatOutcome(item, rate, quote) }))
        .sort((a, b) => byGainDesc(a.outcome.gain, b.outcome.gain)),
    [group, rate, quote],
  );

  const columns: TableColumnsType<DucatRow> = wide
    ? [
        { title: '물품', key: 'name', render: (_value, row) => <FarmItemLink name={row.item.name} short /> },
        {
          title: '두카트',
          key: 'ducats',
          align: 'right',
          width: 110,
          render: (_value, row) => (
            <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
              {formatNumber(row.item.ducats)}
            </Text>
          ),
        },
        {
          title: '경매장 판매가',
          key: 'market',
          align: 'right',
          width: 140,
          render: (_value, row) => <GoldCell value={row.outcome.market} pending={pending} />,
        },
        {
          title: '두카트로 받는 값',
          key: 'exchanged',
          align: 'right',
          width: 150,
          render: (_value, row) => <GoldCell value={row.outcome.exchanged} pending={pending} />,
        },
        {
          title: '두카트 - 경매장',
          key: 'gain',
          align: 'right',
          width: 140,
          render: (_value, row) => <GainCell value={row.outcome.gain} pending={pending} />,
        },
      ]
    : [
        {
          // 768px 미만에서는 칸을 합친다. 차이만 제 칸에 둔다.
          title: '물품',
          key: 'name',
          render: (_value, row) => (
            <Flex vertical gap={4}>
              <FarmItemLink name={row.item.name} short />
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {formatNumber(row.item.ducats)} 두카트, 경매장 {formatGold(row.outcome.market)}
              </Text>
            </Flex>
          ),
        },
        {
          title: '두카트 - 경매장',
          key: 'gain',
          align: 'right',
          width: 120,
          render: (_value, row) => <GainCell value={row.outcome.gain} pending={pending} />,
        },
      ];

  return (
    <Flex vertical gap={12}>
      <Card variant="outlined">
        {/* 두 칸. 768px 미만에서는 한 단으로 떨어진다. */}
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={10}>
            <Statistic
              title="두카트 1개"
              value={rate === null ? '-' : rateText(rate)}
              styles={{
                content: {
                  color: token.colorPrimary,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                },
              }}
            />
            <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
              {typedRate !== null && typedRate > 0
                ? '직접 넣은 값'
                : `${DUCAT_GEM.name} ${formatGold(gemPrice)} / ${formatNumber(DUCAT_GEM.ducats)} 두카트`}
            </Text>
          </Col>
          <Col xs={24} md={14}>
            <Flex vertical gap={4}>
              <label htmlFor="ducat-rate">
                <Text>두카트 1개 값 직접 넣기</Text>
              </label>
              <InputNumber<number>
                id="ducat-rate"
                min={0}
                step={0.01}
                precision={2}
                controls={false}
                value={typedRate}
                placeholder={autoRate === null ? undefined : `예: ${autoRate.toFixed(2)}`}
                onChange={(value) => setTypedRate(value)}
                suffix="G"
                className="tnum"
                style={{ width: 160 }}
              />
            </Flex>
          </Col>
        </Row>
      </Card>

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
