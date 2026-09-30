import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Flex,
  Grid,
  InputNumber,
  Row,
  Segmented,
  Skeleton,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { CAUTION_BADGE_COLORS } from '@/app/theme';
import { EmptyState } from '@/components/EmptyState';
import { BeadCraftCalculator } from '@/components/dungeonCoins/BeadCraftCalculator';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { RefreshIcon } from '@/components/icons';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { snapshotAgeLabel } from '@/features/auction/snapshot';
import { DUNGEON_COINS, dungeonCoinOf, type DungeonCoin } from '@/features/dungeonCoins/exchanges';
import { useDungeonPrices } from '@/features/dungeonCoins/prices';
import {
  LOW_VOLUME,
  rankExchanges,
  type Basis,
  type ExchangeRow,
  type ExchangeValue,
  type TradeValue,
} from '@/features/dungeonCoins/value';
import { canLookupMarket, useMarketRecentQuery } from '@/features/market/api';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import { useCanQuery } from '@/lib/settings';
import { useResolvedThemeMode } from '@/lib/themePreference';

const { Title, Text } = Typography;

/** 교환품 그림 한 변. 제작 비용 표의 재료 그림과 같다. */
const ITEM_ICON = 28;

const TAB_ITEMS = DUNGEON_COINS.map((entry) => ({ key: entry.key, label: entry.dungeon }));

/** 값을 모르는 칸. 받는 중이면 자리만, 못 받았거나 매물이 없으면 그 사실을 적는다. */
function UnknownValue({ value }: { value: ExchangeValue }) {
  if (value.status === 'loading')
    return <Skeleton.Input active size="small" style={{ width: 88, minWidth: 88 }} />;
  return (
    <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
      {value.status === 'error' ? '받지 못함' : '매물 없음'}
    </Text>
  );
}

function ExchangeName({ row, category }: { row: ExchangeRow; category?: string }) {
  const mode = useResolvedThemeMode();
  const caution = CAUTION_BADGE_COLORS[mode];
  return (
    <Flex gap={8} align="center">
      <ItemIcon category={category} name={row.name} file={row.icon} size={ITEM_ICON} />
      <Flex gap={6} align="center" wrap style={{ minWidth: 0 }}>
        <ItemInfoLink name={row.name} category={category} />
        {row.best ? (
          <Tag color="processing" style={{ marginInlineEnd: 0 }}>
            가장 이득
          </Tag>
        ) : null}
        {row.lowVolume ? (
          <Tag
            variant="filled"
            style={{ marginInlineEnd: 0, background: caution.background, color: caution.text }}
          >
            거래 적음
          </Tag>
        ) : null}
      </Flex>
    </Flex>
  );
}

/** 거래 기록을 모르는 칸. 거래가 없었던 것과 받지 못한 것을 갈라 적는다. */
function UnknownTrade({ trade }: { trade: TradeValue }) {
  if (trade.status === 'loading')
    return <Skeleton.Input active size="small" style={{ width: 72, minWidth: 72 }} />;
  return (
    <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
      {trade.status === 'unknown' ? '-' : '거래 없음'}
    </Text>
  );
}

type BasisOption = { value: Basis; label: string };

const BASIS_OPTIONS: BasisOption[] = [
  { value: 'lowest', label: '최저가 기준' },
  { value: 'trade', label: '거래가 기준' },
];

function DungeonCoinView({ entry }: { entry: DungeonCoin }) {
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const queryClient = useQueryClient();

  const names = useMemo(() => entry.exchanges.map((exchange) => exchange.name), [entry]);
  const { prices, collectedAt } = useDungeonPrices(names);
  // 최근 24시간 거래(중위가와 거래량). 조회할 수 없으면 알 수 없는 것으로 두고, 거래가 없었던 것과 가른다.
  const market = useMarketRecentQuery(names);
  const marketAvailable = canLookupMarket();
  const stats = marketAvailable
    ? { items: market.items, loading: market.isLoading, failed: market.failed }
    : undefined;

  // 줄을 세우고 "가장 이득" 을 고르는 기준. 기본은 최저가다.
  const [basis, setBasis] = useState<Basis>('lowest');
  const [skipLowVolume, setSkipLowVolume] = useState(false);
  const [held, setHeld] = useState<number | null>(null);
  const rows = rankExchanges(entry.exchanges, prices, stats, { basis, skipLowVolume });

  /**
   * 그림과 아이템 정보 링크는 이름 사전의 카테고리로 찾는다. 경매장에 오른 적 없는 아이템은
   * 카테고리가 없어도 그림 파일 이름(교환 표에 적어 둔 것)으로 그림이 나온다.
   */
  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];

  const pending = rows.filter((row) => row.value.status === 'loading').length;
  const failed = rows.filter((row) => row.value.status === 'error');
  const best = rows.find((row) => row.best);
  const bestPerCoin =
    basis === 'trade'
      ? best?.trade.status === 'ok'
        ? best.trade.perCoin
        : undefined
      : best?.value.status === 'ok'
        ? best.value.perCoin
        : undefined;
  /** 보유 코인으로 살 수 있는 개수와, 고른 기준의 개당 값으로 센 예상 판매액. 값을 모르면 판매액은 없다. */
  const heldPlan = (row: ExchangeRow) => {
    if (!held || held <= 0) return undefined;
    const count = Math.floor(held / row.cost);
    const unit =
      basis === 'trade'
        ? row.trade.status === 'ok'
          ? row.trade.mid
          : undefined
        : row.value.status === 'ok'
          ? row.value.lowest
          : undefined;
    return { count, total: unit === undefined ? undefined : unit * count };
  };
  const updatedAt = market.updated ? Date.parse(market.updated) : null;

  const retry = () => {
    for (const row of failed)
      void queryClient.refetchQueries({ queryKey: ['crafting', 'price', row.name] });
  };

  const valueText = (value: ExchangeValue, best: boolean) =>
    value.status === 'ok' ? (
      <Text
        strong={best}
        className="tnum"
        style={{ whiteSpace: 'nowrap', color: best ? token.colorPrimary : undefined }}
      >
        {formatGold(value.perCoin)}
      </Text>
    ) : (
      <UnknownValue value={value} />
    );

  const tradeText = (trade: TradeValue, best: boolean) =>
    trade.status === 'ok' ? (
      <Text
        strong={best}
        className="tnum"
        style={{ whiteSpace: 'nowrap', color: best ? token.colorPrimary : undefined }}
      >
        {formatGold(trade.perCoin)}
      </Text>
    ) : (
      <UnknownTrade trade={trade} />
    );

  /** 고른 기준이 최저가일 때 표시할 줄(최고 가치)과 거래가일 때를 갈라, 강조는 고른 기준의 열에만 준다. */
  const lowestBest = (row: ExchangeRow) => row.best && basis === 'lowest';
  const tradeBest = (row: ExchangeRow) => row.best && basis === 'trade';

  const heldColumns: TableColumnsType<ExchangeRow> =
    held && held > 0
      ? [
          {
            title: `${formatNumber(held)}개로`,
            key: 'held',
            align: 'right',
            width: 190,
            render: (_value, row) => {
              const plan = heldPlan(row);
              if (!plan) return null;
              return (
                <Flex vertical gap={0} align="flex-end">
                  <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
                    {plan.count > 0 ? `${formatNumber(plan.count)}개 교환` : '코인 부족'}
                  </Text>
                  {plan.count > 0 && plan.total !== undefined ? (
                    <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      예상 {formatGold(plan.total)}
                    </Text>
                  ) : null}
                </Flex>
              );
            },
          },
        ]
      : [];

  const columns: TableColumnsType<ExchangeRow> = wide
    ? [
        {
          title: '교환품',
          key: 'name',
          render: (_value, row) => <ExchangeName row={row} category={categoryOf(row.name)} />,
        },
        {
          title: '필요 코인',
          dataIndex: 'cost',
          align: 'right',
          width: 100,
          className: 'tnum',
          render: (cost: number) => `${formatNumber(cost)}개`,
        },
        {
          title: '경매장 최저가',
          key: 'lowest',
          align: 'right',
          width: 160,
          render: (_value, row) =>
            row.value.status === 'ok' ? (
              <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
                {formatGold(row.value.lowest)}
              </Text>
            ) : (
              <UnknownValue value={row.value} />
            ),
        },
        {
          title: '최저가 기준 코인당 가치',
          key: 'perCoin',
          align: 'right',
          width: 170,
          render: (_value, row) => valueText(row.value, lowestBest(row)),
        },
        {
          title: '거래가 기준 코인당 가치',
          key: 'tradePerCoin',
          align: 'right',
          width: 170,
          render: (_value, row) => tradeText(row.trade, tradeBest(row)),
        },
        {
          title: '24시간 거래량',
          key: 'volume',
          align: 'right',
          width: 120,
          render: (_value, row) =>
            row.trade.status === 'ok' ? (
              <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
                {formatNumber(row.trade.qty)}개
              </Text>
            ) : (
              <UnknownTrade trade={row.trade} />
            ),
        },
        ...heldColumns,
      ]
    : [
        {
          // 768px 미만에서는 칸을 합친다. 가로로 밀면 가장 중요한 가치 칸이 화면 밖으로 나간다.
          title: '교환품',
          key: 'name',
          render: (_value, row) => {
            const plan = heldPlan(row);
            return (
              <Flex vertical gap={4}>
                <ExchangeName row={row} category={categoryOf(row.name)} />
                <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                  코인 {formatNumber(row.cost)}개
                  {row.value.status === 'ok' ? `, 최저가 ${formatGold(row.value.lowest)}` : ''}
                </Text>
                {row.trade.status === 'ok' ? (
                  <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                    거래가 기준 {formatGold(row.trade.perCoin)} · 24시간 {formatNumber(row.trade.qty)}개
                  </Text>
                ) : row.trade.status === 'none' ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    24시간 거래 없음
                  </Text>
                ) : null}
                {plan ? (
                  <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                    {plan.count > 0
                      ? `${formatNumber(held ?? 0)}개로 ${formatNumber(plan.count)}개 교환${plan.total !== undefined ? `, 예상 ${formatGold(plan.total)}` : ''}`
                      : '보유 코인으로는 부족'}
                  </Text>
                ) : null}
              </Flex>
            );
          },
        },
        {
          title: '코인 1개당',
          key: 'perCoin',
          align: 'right',
          render: (_value, row) =>
            basis === 'trade' ? tradeText(row.trade, row.best) : valueText(row.value, row.best),
        },
      ];

  return (
    <Flex vertical gap={16}>
      <Card variant="outlined">
        {/* 두 칸. 768px 미만에서는 한 단으로 떨어진다. */}
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={10}>
            {bestPerCoin !== undefined && best ? (
              <Flex vertical gap={4}>
                <Statistic
                  title={`${entry.coin.name} 1개 최고 가치`}
                  value={formatGold(bestPerCoin)}
                  styles={{
                    content: {
                      color: token.colorPrimary,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    },
                  }}
                />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {best.name} 교환 기준, {basis === 'trade' ? '거래가' : '최저가'}
                </Text>
              </Flex>
            ) : pending > 0 ? (
              <Flex vertical gap={8} aria-busy="true">
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {entry.coin.name} 1개 최고 가치
                </Text>
                <Skeleton.Input active style={{ width: 180, height: 38 }} />
              </Flex>
            ) : failed.length === 0 ? (
              <EmptyState
                size="small"
                description="지금 경매장에 교환품 매물이 없습니다. 잠시 뒤 다시 열어 보세요."
              />
            ) : null}
          </Col>
          <Col xs={24} md={14}>
            <Flex vertical gap={6}>
              <Text>
                <Text type="secondary">코인</Text> <Text strong>{entry.coin.name}</Text>
              </Text>
              <Text>
                <Text type="secondary">교환 NPC</Text> {entry.npc}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                교환품의 경매장 최저가(매물 한 개의 값)나 최근 24시간 거래 중위가를 필요한 코인 개수로
                나눈 값입니다. 높을수록 코인을 알뜰하게 씁니다.
              </Text>
              <Flex gap={8} align="center" wrap>
                <label htmlFor="held-coins">
                  <Text type="secondary">보유 코인</Text>
                </label>
                <InputNumber
                  id="held-coins"
                  min={0}
                  precision={0}
                  controls={false}
                  placeholder="예: 1200"
                  value={held}
                  onChange={(value) => setHeld(value)}
                  style={{ width: 130 }}
                />
              </Flex>
              {pending > 0 ? (
                <Flex gap={8} align="center">
                  <Spin size="small" />
                  <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
                    시세 {formatNumber(pending)}종을 받는 중입니다
                  </Text>
                </Flex>
              ) : null}
            </Flex>
          </Col>
        </Row>
      </Card>

      {entry.note ? <Alert type="info" showIcon message={entry.note} /> : null}

      {failed.length > 0 ? (
        <Alert
          type="error"
          showIcon
          role="alert"
          message={`시세 ${formatNumber(failed.length)}종을 받지 못했습니다`}
          description="그 교환품은 가치를 매기지 못해 표 아래쪽에 둡니다."
          action={
            <Button size="small" icon={<RefreshIcon />} onClick={retry}>
              다시 받기
            </Button>
          }
        />
      ) : null}

      <Flex gap={16} align="center" wrap>
        <Segmented<Basis>
          aria-label="정렬과 가장 이득의 기준"
          options={BASIS_OPTIONS}
          value={basis}
          onChange={setBasis}
        />
        <Checkbox checked={skipLowVolume} onChange={(event) => setSkipLowVolume(event.target.checked)}>
          거래 적음({LOW_VOLUME}개 미만)은 가장 이득에서 제외
        </Checkbox>
      </Flex>

      <Card variant="outlined" styles={{ body: { padding: 0 } }}>
        <Table<ExchangeRow>
          columns={columns}
          dataSource={rows}
          rowKey="name"
          size="small"
          pagination={false}
        />
      </Card>

      <Text type="secondary" style={{ fontSize: 12 }}>
        경매장 최저가는 매물 한 개의 개당 가격이며 평균 10분 지연됩니다.
        {collectedAt ? ` 시세는 ${snapshotAgeLabel(collectedAt)} 모은 값입니다.` : ''}
        {updatedAt !== null ? ` 거래가는 최근 24시간 기준, ${snapshotAgeLabel(updatedAt)} 갱신.` : ''} 교환 목록은
        게임 안 NPC 교환 창 기준입니다.
      </Text>
    </Flex>
  );
}

/** 가공 계산기가 있는 던전의 두 화면. 주소의 view 로 고른다. */
type View = 'exchange' | 'craft';

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'exchange', label: '교환 가치' },
  { value: 'craft', label: '가공해 팔기' },
];

export function DungeonCoinsPage() {
  const canQuery = useCanQuery();
  const [params, setParams] = useSearchParams();
  const entry = dungeonCoinOf(params.get('dungeon'));
  const view: View = entry.craftable && params.get('view') === 'craft' ? 'craft' : 'exchange';

  return (
    <Flex vertical gap={20}>
      <Title level={3} style={{ margin: 0 }}>
        던전 코인 가치
      </Title>

      {!canQuery ? (
        <Alert
          type="warning"
          showIcon
          message="지금은 경매장 시세를 받을 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      <Tabs
        activeKey={entry.key}
        onChange={(key) => setParams({ dungeon: key }, { replace: true })}
        items={TAB_ITEMS}
        tabBarStyle={{ marginBottom: 0 }}
      />

      {/*
        가공 계산기는 탭 바로 아래에서 고른다. 교환 표 밑에 두면 스크롤을 내려야 보여 있는 줄 모른다.
        모달은 19줄짜리 표를 담기에 좁다. 한 번에 한 화면만 그려 시세도 그 화면 것만 받는다.
      */}
      {entry.craftable ? (
        <Segmented<View>
          options={VIEW_OPTIONS}
          value={view}
          onChange={(next) =>
            setParams(
              next === 'craft' ? { dungeon: entry.key, view: next } : { dungeon: entry.key },
              { replace: true },
            )
          }
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}

      {/* 던전을 바꾸면 새로 그린다. 받은 시세는 5분 동안 캐시에 남아 다시 돌아와도 바로 나온다. */}
      {view === 'craft' ? (
        <BeadCraftCalculator key={entry.key} entry={entry} />
      ) : (
        <DungeonCoinView key={entry.key} entry={entry} />
      )}
    </Flex>
  );
}
