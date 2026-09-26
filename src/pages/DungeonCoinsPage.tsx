import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  Grid,
  Row,
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
import { EmptyState } from '@/components/EmptyState';
import { BeadCraftCalculator } from '@/components/dungeonCoins/BeadCraftCalculator';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { RefreshIcon } from '@/components/icons';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { useMarketPrices } from '@/features/crafting/market';
import { DUNGEON_COINS, dungeonCoinOf, type DungeonCoin } from '@/features/dungeonCoins/exchanges';
import { rankExchanges, type ExchangeRow, type ExchangeValue } from '@/features/dungeonCoins/value';
import { formatGold, formatNumber } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';

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
      </Flex>
    </Flex>
  );
}

function DungeonCoinView({ entry }: { entry: DungeonCoin }) {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const queryClient = useQueryClient();

  const names = useMemo(() => entry.exchanges.map((exchange) => exchange.name), [entry]);
  const prices = useMarketPrices(names);
  const rows = rankExchanges(entry.exchanges, prices);

  /**
   * 그림과 아이템 정보 링크는 이름 사전의 카테고리로 찾는다. 경매장에 오른 적 없는 아이템은
   * 카테고리가 없어도 그림 파일 이름(교환 표에 적어 둔 것)으로 그림이 나온다.
   */
  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];

  const pending = rows.filter((row) => row.value.status === 'loading').length;
  const failed = rows.filter((row) => row.value.status === 'error');
  const best = rows.find((row) => row.best);
  const bestValue = best?.value.status === 'ok' ? best.value : undefined;

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
          width: 110,
          className: 'tnum',
          render: (cost: number) => `${formatNumber(cost)}개`,
        },
        {
          title: '경매장 최저가',
          key: 'lowest',
          align: 'right',
          width: 170,
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
          title: '코인 1개당 가치',
          key: 'perCoin',
          align: 'right',
          width: 170,
          render: (_value, row) => valueText(row.value, row.best),
        },
      ]
    : [
        {
          // 768px 미만에서는 칸을 합친다. 가로로 밀면 가장 중요한 가치 칸이 화면 밖으로 나간다.
          title: '교환품',
          key: 'name',
          render: (_value, row) => (
            <Flex vertical gap={4}>
              <ExchangeName row={row} category={categoryOf(row.name)} />
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                코인 {formatNumber(row.cost)}개
                {row.value.status === 'ok' ? `, 최저가 ${formatGold(row.value.lowest)}` : ''}
              </Text>
            </Flex>
          ),
        },
        {
          title: '코인 1개당',
          key: 'perCoin',
          align: 'right',
          render: (_value, row) => valueText(row.value, row.best),
        },
      ];

  return (
    <Flex vertical gap={16}>
      <Card variant="outlined">
        {/* 두 칸. 768px 미만에서는 한 단으로 떨어진다. */}
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={10}>
            {bestValue && best ? (
              <Flex vertical gap={4}>
                <Statistic
                  title={`${entry.coin.name} 1개 최고 가치`}
                  value={formatGold(bestValue.perCoin)}
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
                  {best.name} 교환 기준
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
                교환품의 경매장 최저가를 필요한 코인 개수로 나눈 값입니다. 높을수록 코인을 알뜰하게
                씁니다.
              </Text>
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

      <Card variant="outlined" styles={{ body: { padding: 0 } }}>
        <Table<ExchangeRow>
          columns={columns}
          dataSource={rows}
          rowKey="id"
          size="small"
          pagination={false}
        />
      </Card>

      <Text type="secondary" style={{ fontSize: 12 }}>
        경매장 최저가는 매물 한 개의 개당 가격이며 평균 10분 지연됩니다. 교환 목록은 게임 안 NPC
        교환 창 기준입니다.
      </Text>

      {entry.craftable ? <BeadCraftCalculator entry={entry} /> : null}
    </Flex>
  );
}

export function DungeonCoinsPage() {
  const canQuery = useCanQuery();
  const [params, setParams] = useSearchParams();
  const entry = dungeonCoinOf(params.get('dungeon'));

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

      {/* 던전을 바꾸면 새로 그린다. 받은 시세는 5분 동안 캐시에 남아 다시 돌아와도 바로 나온다. */}
      <DungeonCoinView key={entry.key} entry={entry} />
    </Flex>
  );
}
