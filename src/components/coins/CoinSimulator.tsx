import { memo, useDeferredValue, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Flex,
  Grid,
  Popover,
  Row,
  Segmented,
  Select,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { ItemIcon } from '@/components/ItemIcon';
import { CalculateIcon, CloseIcon, ResetIcon } from '@/components/icons';
import { TrialCountInput, TrialOdds } from '@/components/simulator/TrialOdds';
import { useMarketPrices, type PriceState } from '@/features/crafting/market';
import {
  coinTargetChance,
  formatCoinValue,
  isHighValue,
  meetsCoinTarget,
  optionValues,
  stepCount,
  valueAt,
  type CoinDraw,
  type CoinDungeon,
  type CoinOption,
  type CoinSimulator,
} from '@/features/coins/simulator';
import { formatChance } from '@/features/simulator/trials';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 기록 표 한 쪽의 줄 수. */
const PAGE_SIZE = 20;

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

/** 경매장 최저가. 매물이 없거나 받지 못했으면 null. */
function lowestOf(state: PriceState | undefined): number | null {
  if (state?.status !== 'ok') return null;
  return state.price.offers[0]?.price ?? null;
}

/** "물리 토템" 에서 "토템" 을 뗀 짧은 이름. 토템을 고르는 칸이 휴대폰 폭에 들게 한다. */
const shortTotem = (label: string) => label.replace(/\s*토템$/, '');

/**
 * 옵션 수치 하나. 높은 수치(isHighValue)는 액센트 굵은 글자, 최대치는 "최대" 표시가 붙는다. 색만으로 가르지 않게
 * 최대치에는 글자 표시를 함께 둔다.
 */
function CoinValue({ option, step, size }: { option: CoinOption; step: number; size?: number }) {
  const { token } = theme.useToken();
  const high = isHighValue(option, step);
  const max = step === stepCount(option) - 1;
  return (
    <Flex gap={6} align="center" style={{ flex: 'none' }}>
      <Text
        className="tnum"
        strong={high}
        style={{
          fontSize: size,
          whiteSpace: 'nowrap',
          color: high ? token.colorPrimary : undefined,
        }}
      >
        {formatCoinValue(option, valueAt(option, step))}
      </Text>
      {max ? <Tag style={{ marginInlineEnd: 0 }}>최대</Tag> : null}
    </Flex>
  );
}

/** 주화 한 개의 옵션 세 줄. 이름, 수치, 가장 큰 수치. */
function CoinLines({
  dungeon,
  draw,
  big,
}: {
  dungeon: CoinDungeon;
  draw: CoinDraw;
  big?: boolean;
}) {
  const totem = dungeon.totems[draw.totem];
  return (
    <Flex vertical gap={big ? 10 : 2}>
      {totem.options.map((option, index) => (
        <Flex key={option.name} gap={8} align="center">
          <Text style={{ flex: 1, minWidth: 0, fontSize: big ? 15 : 13 }}>{option.name}</Text>
          <CoinValue option={option} step={draw.steps[index]} size={big ? 20 : undefined} />
          {big ? (
            <Text
              type="secondary"
              className="tnum"
              style={{ fontSize: 13, minWidth: 56, textAlign: 'right' }}
            >
              / {formatCoinValue(option, option.max)}
            </Text>
          ) : null}
        </Flex>
      ))}
    </Flex>
  );
}

const HistoryTable = memo(function HistoryTable({
  dungeon,
  rows,
}: {
  dungeon: CoinDungeon;
  rows: CoinDraw[];
}) {
  const columns: TableColumnsType<CoinDraw> = [
    {
      title: '번째',
      dataIndex: 'no',
      width: 64,
      align: 'right',
      render: (no: number) => <span className="tnum">{formatNumber(no)}</span>,
    },
    {
      title: '토템',
      key: 'totem',
      width: 96,
      render: (_value, draw) => <Text strong>{dungeon.totems[draw.totem].label}</Text>,
    },
    {
      title: '옵션',
      key: 'options',
      render: (_value, draw) => <CoinLines dungeon={dungeon} draw={draw} />,
    },
  ];
  return (
    <Table<CoinDraw>
      columns={columns}
      dataSource={rows}
      rowKey="no"
      size="small"
      pagination={
        rows.length > PAGE_SIZE
          ? { pageSize: PAGE_SIZE, showSizeChanger: false, size: 'small' }
          : false
      }
      locale={{ emptyText: '아직 만들지 않았습니다.' }}
    />
  );
});

/**
 * 주화 만들기 창. 토템을 고르고 만들면 옵션 세 줄이 붙는다. 쓴 골드는 만든 수에 재료 개수와 재료의
 * 경매장 최저가를 곱한다.
 */
export function CoinSimulatorView({
  dungeon,
  simulator,
}: {
  dungeon: CoinDungeon;
  simulator: CoinSimulator;
}) {
  const formatGold = useGoldFormatter();
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();
  const [totem, setTotem] = useState(0);
  const selected = dungeon.totems[totem];

  const priceNames = useMemo(
    () => [dungeon.material.name, ...dungeon.totems.map((each) => each.itemName)],
    [dungeon],
  );
  const prices = useMarketPrices(priceNames);
  const materialState = prices.get(dungeon.material.name);
  const materialPrice = lowestOf(materialState);
  const coinPrice = lowestOf(prices.get(selected.itemName));
  const priceLoading = materialState?.status === 'loading';
  const perCoin = materialPrice === null ? null : materialPrice * dungeon.material.count;

  const count = simulator.draws.length;
  const last = simulator.draws[count - 1] ?? null;
  const latest = simulator.draws.slice(count - simulator.lastBatch).reverse();
  const history = useMemo(() => [...simulator.draws].reverse(), [simulator.draws]);
  const settledHistory = useDeferredValue(history);

  // 특정 주화 기댓값. 토템마다 옵션별 최솟값을 따로 기억한다.
  const [calcOpen, setCalcOpen] = useState(false);
  const [trials, setTrials] = useState(10);
  const [minValues, setMinValues] = useState<Record<number, number[]>>({});
  const targetMins = useMemo(
    () => minValues[totem] ?? selected.options.map((option) => option.min),
    [minValues, totem, selected],
  );
  const chance = coinTargetChance(selected, targetMins);
  const targetHits = useMemo(
    () =>
      simulator.draws.filter(
        (draw) => draw.totem === totem && meetsCoinTarget(dungeon, draw, targetMins),
      ).length,
    [simulator.draws, totem, dungeon, targetMins],
  );

  const calculator = (
    <Flex vertical gap={10} style={{ width: 'min(440px, calc(100vw - 88px))' }}>
      <TrialCountInput value={trials} onChange={setTrials} />
      <Divider style={{ margin: 0 }} />
      <Text strong>{selected.label}</Text>
      {selected.options.map((option, index) => (
        <Flex key={option.name} gap={8} align="center">
          <Text style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{option.name}</Text>
          <Select<number>
            aria-label={`${option.name} 가장 낮은 수치`}
            size="small"
            value={targetMins[index]}
            onChange={(value) => {
              const next = [...targetMins];
              next[index] = value;
              setMinValues({ ...minValues, [totem]: next });
            }}
            options={optionValues(option).map((value) => ({
              value,
              label: value === option.min ? '상관없음' : `${formatCoinValue(option, value)} 이상`,
            }))}
            popupMatchSelectWidth={false}
            className="tnum"
            style={{ width: 120 }}
          />
        </Flex>
      ))}
      <Text className="tnum" style={{ fontSize: 13 }}>
        한 번에 <Text strong>{formatChance(chance)}</Text>, 평균{' '}
        <Text strong>{formatNumber(Math.ceil(1 / chance))}번</Text>에 한 번
        {count > 0 ? `, 지금까지 ${formatNumber(targetHits)}번` : ''}
      </Text>
      {chance < 1 ? (
        <TrialOdds
          framed={false}
          trials={trials}
          chance={chance}
          verb="만들기"
          costPerTrial={perCoin}
        />
      ) : null}
    </Flex>
  );

  const single = simulator.lastBatch <= 1;

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined" role="region" aria-label="주화 만들기">
        {/* 만들기와 방금 만든 주화 두 칸. 768px 미만에서는 위아래로 쌓는다. */}
        <Row gutter={[24, 20]} align="stretch">
          <Col xs={24} md={10} xl={9}>
            <Flex vertical gap={12} align="center">
              <ItemIcon category={dungeon.coinCategory} name={selected.itemName} size={56} />
              <Text strong style={{ fontSize: 16 }}>
                {dungeon.title}
              </Text>
              <Segmented<number>
                aria-label="토템"
                block
                value={totem}
                onChange={setTotem}
                options={dungeon.totems.map((each, index) => ({
                  value: index,
                  label: shortTotem(each.label),
                }))}
                style={{ width: '100%', maxWidth: 320 }}
              />
              <Flex
                vertical
                gap={4}
                style={{
                  width: '100%',
                  maxWidth: 320,
                  padding: '10px 12px',
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: token.borderRadius,
                }}
              >
                {selected.options.map((option) => (
                  <Flex key={option.name} gap={8} justify="space-between">
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {option.name}
                    </Text>
                    <Text className="tnum" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatCoinValue(option, option.min)} ~ {formatCoinValue(option, option.max)}
                    </Text>
                  </Flex>
                ))}
              </Flex>
              <Button
                type="primary"
                size="large"
                onClick={() => simulator.draw(totem, 1)}
                style={{ minWidth: 200 }}
              >
                만들기
              </Button>
              <Flex gap={8} wrap justify="center">
                <Button onClick={() => simulator.draw(totem, 10)}>10번 만들기</Button>
                <Popover
                  open={calcOpen}
                  trigger={[]}
                  placement={screens.md ? 'bottomLeft' : 'bottom'}
                  title={
                    <Flex justify="space-between" align="center" gap={8}>
                      <span>특정 주화 기댓값</span>
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseIcon />}
                        aria-label="특정 주화 기댓값 닫기"
                        onClick={() => setCalcOpen(false)}
                      />
                    </Flex>
                  }
                  content={calculator}
                >
                  <Button
                    icon={<CalculateIcon />}
                    aria-expanded={calcOpen}
                    onClick={() => setCalcOpen(!calcOpen)}
                  >
                    특정 주화 기댓값
                  </Button>
                </Popover>
                <Button icon={<ResetIcon />} onClick={simulator.reset} disabled={count === 0}>
                  처음부터
                </Button>
              </Flex>
            </Flex>
          </Col>
          <Col xs={24} md={14} xl={15}>
            <section
              aria-labelledby="coin-latest"
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 280,
                maxHeight: 520,
                overflowY: 'auto',
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                background: token.colorFillQuaternary,
                padding: 16,
              }}
            >
              <Text strong id="coin-latest" style={{ display: 'block', marginBottom: 12 }}>
                방금 만든 주화
                {simulator.lastBatch > 1 ? ` ${formatNumber(simulator.lastBatch)}개` : ''}
              </Text>
              {last === null ? (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  아직 만들지 않았습니다.
                </Text>
              ) : single ? (
                <Flex flex={1} align="center" justify="center">
                  <Flex vertical gap={14} style={{ width: '100%', maxWidth: 420 }}>
                    <Flex gap={12} align="center">
                      <ItemIcon
                        category={dungeon.coinCategory}
                        name={dungeon.totems[last.totem].itemName}
                        size={40}
                      />
                      <Text strong style={{ fontSize: 18 }}>
                        {dungeon.totems[last.totem].label}
                      </Text>
                    </Flex>
                    <CoinLines dungeon={dungeon} draw={last} big />
                  </Flex>
                </Flex>
              ) : (
                <Flex vertical gap={8}>
                  {latest.map((draw) => (
                    <Flex
                      key={draw.no}
                      vertical
                      gap={4}
                      style={{
                        padding: '8px 10px',
                        borderRadius: token.borderRadiusSM,
                        background: token.colorBgContainer,
                      }}
                    >
                      <Text strong style={{ fontSize: 13 }}>
                        {dungeon.totems[draw.totem].label}
                      </Text>
                      <CoinLines dungeon={dungeon} draw={draw} />
                    </Flex>
                  ))}
                </Flex>
              )}
            </section>
          </Col>
        </Row>

        <Divider style={{ marginBlock: 16 }} />

        <Flex vertical gap={14}>
          {/* 골드 칸은 열 자리를 넘기도 해서 576px 미만에서는 한 줄을 다 쓴다. */}
          <Row gutter={[24, 16]} align="top">
            <Col xs={12} lg={6}>
              <Statistic
                title="만든 주화"
                value={formatNumber(count)}
                suffix="개"
                styles={NUMERIC}
              />
            </Col>
            <Col xs={12} lg={6}>
              <Statistic
                title="쓴 잔흔석"
                value={formatNumber(count * dungeon.material.count)}
                suffix="개"
                styles={NUMERIC}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Statistic
                title="쓴 골드"
                value={perCoin === null ? '-' : formatGold(perCoin * count)}
                loading={priceLoading}
                styles={NUMERIC}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Statistic
                title={`${selected.label} 최저가`}
                value={coinPrice === null ? '-' : formatGold(coinPrice)}
                loading={prices.get(selected.itemName)?.status === 'loading'}
                styles={NUMERIC}
              />
            </Col>
          </Row>
          <Flex gap={6} align="center" wrap>
            {priceLoading ? <Spin size="small" /> : null}
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {priceLoading
                ? '잔흔석 시세를 받는 중입니다.'
                : materialPrice === null
                  ? '잔흔석 시세가 없습니다.'
                  : `${dungeon.material.name} 최저가 ${formatGold(materialPrice)}, 주화 하나에 ${formatNumber(dungeon.material.count)}개. 게임 데이터는 평균 10분 지연됩니다.`}
            </Text>
          </Flex>
        </Flex>
      </Card>

      <Collapse
        items={[
          {
            key: 'history',
            label: (
              <Text strong className="tnum">
                만든 기록 {formatNumber(count)}개
              </Text>
            ),
            styles: { body: { padding: 0 } },
            children: <HistoryTable dungeon={dungeon} rows={settledHistory} />,
          },
        ]}
      />
    </Flex>
  );
}
