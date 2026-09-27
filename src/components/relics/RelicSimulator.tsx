import { memo, useDeferredValue, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  Flex,
  Grid,
  Row,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { SkillIcon } from '@/components/crafting/RecipeInfo';
import { EmptyState } from '@/components/EmptyState';
import { InfoIcon, ResetIcon, StarFillIcon } from '@/components/icons';
import {
  skillOfOption,
  useArcanaQuery,
  type Arcana,
  type ArcanaSkill,
} from '@/features/relics/arcana';
import {
  formatRelicValue,
  muriasAuctionPath,
  RELIC_MAX_LEVEL,
  relicValueAt,
} from '@/features/relics/murias';
import type { RelicPriceState } from '@/features/relics/priceFile';
import {
  drawPrice,
  MURIAS_RELIC_POOL,
  RELIC_OUTCOMES,
  type DrawPrice,
  type RelicDraw,
  type RelicPoolEntry,
  type RelicSimulator as Simulator,
} from '@/features/relics/simulator';
import { snapshotAgeLabel } from '@/features/auction/snapshot';
import { formatGold, formatGoldShort, formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 방금 나온 유물 카드의 스킬 그림. */
const CARD_ICON = 36;
/** 기록 표의 스킬 그림. */
const ROW_ICON = 24;
/** 기록 표 한 쪽의 줄 수. */
const PAGE_SIZE = 20;

/** 시세를 받는 중, 받았음, 받을 수 없음. */
type PriceState = RelicPriceState['status'];

/** 결과 하나를 그릴 때 필요한 것. 값은 시세를 받기 전이거나 모르면 null. */
interface PricedDraw extends RelicDraw {
  price: DrawPrice | null;
  found: { arcana: Arcana; skill: ArcanaSkill } | null;
}

/** "490% 증가". 레벨의 수치와 증감 말. */
const valueText = (option: RelicPoolEntry, level: number) =>
  `${formatRelicValue(option, relicValueAt(option, level))}${option.verb ? ` ${option.verb}` : ''}`;

/**
 * 레벨. 10레벨은 액센트 색과 별로 가른다. 색만으로 가르지 않게 별 그림이 함께 붙는다.
 */
function LevelLabel({ level, size = 13 }: { level: number; size?: number }) {
  const { token } = theme.useToken();
  const top = level === RELIC_MAX_LEVEL;
  return (
    <Flex gap={2} align="center" style={{ whiteSpace: 'nowrap' }}>
      {top ? (
        <StarFillIcon aria-hidden style={{ color: token.colorPrimary, fontSize: size }} />
      ) : null}
      <Text
        className="tnum"
        strong={top}
        style={{ fontSize: size, color: top ? token.colorPrimary : undefined }}
      >
        {level}레벨
      </Text>
    </Flex>
  );
}

/** 이데아 최저가 이상인 결과인지. 복원한 값보다 비싼 것이 나온 것이다. */
const isAboveIdea = (price: DrawPrice | null, ideaPrice: number | null) =>
  ideaPrice !== null && price !== null && price.price >= ideaPrice;

/**
 * 값 한 칸. 지금 최저가는 본문색, 매물이 없어 최종 거래가를 쓴 것은 흐리게 "최종" 을 붙인다.
 * 이데아 최저가 이상이면 굵은 빨강으로 적는다. 색만으로 가르지 않게 카드와 표에 글자 표시가 함께 붙는다.
 */
function PriceText({
  price,
  ideaPrice,
  state,
}: {
  price: DrawPrice | null;
  ideaPrice: number | null;
  state: PriceState;
}) {
  const { token } = theme.useToken();
  if (state !== 'ready')
    return (
      <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {state === 'loading' ? '시세 받는 중' : '-'}
      </Text>
    );
  if (!price)
    return (
      <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        기록 없음
      </Text>
    );
  const above = isAboveIdea(price, ideaPrice);
  const trade = price.source === 'trade';
  return (
    <Text
      type={trade && !above ? 'secondary' : undefined}
      className="tnum"
      title={trade ? `최종 거래가 ${formatGold(price.price)}` : formatGold(price.price)}
      style={{
        whiteSpace: 'nowrap',
        fontWeight: above ? 700 : undefined,
        color: above ? token.colorError : undefined,
      }}
    >
      {formatGoldShort(price.price)}
      {trade ? ' 최종' : ''}
    </Text>
  );
}

/** 이데아 최저가 이상 표시. 빨간 색에 더해 글자로도 알린다. */
function IdeaTag() {
  return (
    <Tag color="error" variant="solid" style={{ marginInlineEnd: 0, whiteSpace: 'nowrap' }}>
      이데아 이상
    </Tag>
  );
}

/** 옵션 이름. 누르면 경매장에서 그 옵션 그 레벨의 매물을 본다. */
function OptionName({ draw }: { draw: PricedDraw }) {
  return (
    <Link
      to={muriasAuctionPath(draw.option.name, draw.level)}
      style={{ fontWeight: 600, lineHeight: 1.35 }}
    >
      {draw.option.name}
    </Link>
  );
}

/** 방금 나온 유물 하나. */
function DrawCard({
  draw,
  ideaPrice,
  state,
}: {
  draw: PricedDraw;
  ideaPrice: number | null;
  state: PriceState;
}) {
  const { token } = theme.useToken();
  const above = state === 'ready' && isAboveIdea(draw.price, ideaPrice);
  return (
    <Card
      type="inner"
      size="small"
      variant="outlined"
      style={
        above
          ? {
              borderColor: token.colorError,
              // 테두리를 두껍게 보이되 칸 크기는 그대로 둔다.
              boxShadow: `inset 0 0 0 1px ${token.colorError}`,
              background: token.colorErrorBg,
            }
          : undefined
      }
    >
      <Flex gap={10} align="flex-start">
        {draw.found ? <SkillIcon skillId={draw.found.skill.id} size={CARD_ICON} /> : null}
        <Flex vertical gap={2} style={{ minWidth: 0, flex: 1 }}>
          <OptionName draw={draw} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {draw.found?.arcana.name ?? '아르카나 정보 없음'}
          </Text>
          <Flex gap={8} align="center" wrap>
            <LevelLabel level={draw.level} size={15} />
            <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
              {valueText(draw.option, draw.level)}
            </Text>
            <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              최대 {formatRelicValue(draw.option, draw.option.max)}
            </Text>
          </Flex>
        </Flex>
        <Flex vertical align="flex-end" style={{ flex: '0 0 auto' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            시세
          </Text>
          <PriceText price={draw.price} ideaPrice={ideaPrice} state={state} />
          {above ? <IdeaTag /> : null}
        </Flex>
      </Flex>
    </Card>
  );
}

/** 제목 옆 설명 그림. 올리거나 키보드로 닿으면 풀어 쓴 설명이 뜬다. */
function StatTitle({ label, detail }: { label: string; detail: string }) {
  return (
    <Flex gap={4} align="center">
      {label}
      <Tooltip title={detail}>
        <InfoIcon aria-label={detail} tabIndex={0} style={{ cursor: 'help' }} />
      </Tooltip>
    </Flex>
  );
}

/** 시세가 언제 것인지, 받는 중인지. 게임 데이터 지연 고지를 함께 적는다. */
function PriceFreshness({ prices }: { prices: RelicPriceState }) {
  const note = (text: string) => (
    <Text type="secondary" style={{ fontSize: 12 }}>
      {text}
    </Text>
  );
  if (prices.status === 'loading')
    return (
      <Flex gap={6} align="center" role="status">
        <Spin size="small" />
        {note('시세를 받는 중입니다. 뽑기는 기다리지 않고 됩니다.')}
      </Flex>
    );
  if (prices.status === 'off')
    return note(
      prices.error
        ? '시세를 받지 못했습니다. 뽑기는 그대로 되고, 시세 칸만 비어 있습니다.'
        : '지금은 시세를 받을 수 없습니다. 뽑기는 그대로 되고, 시세 칸만 비어 있습니다.',
    );
  return (
    <Flex gap={6} align="center" wrap>
      {note(
        `${snapshotAgeLabel(prices.prices.at)} 모은 경매장 시세입니다. 게임 데이터는 평균 10분 지연됩니다.`,
      )}
      {prices.refreshing ? (
        <Flex gap={4} align="center" role="status">
          <Spin size="small" />
          {note('새 시세를 받는 중입니다.')}
        </Flex>
      ) : null}
    </Flex>
  );
}

/**
 * 복원 기록 표. 기록이 쌓일수록 그리는 데 오래 걸려, 방금 나온 유물 카드보다 한 박자 늦게 그린다
 * (rows 는 useDeferredValue 로 늦춘 값이다). 같은 rows 면 다시 그리지 않는다.
 */
const HistoryTable = memo(function HistoryTable({
  rows,
  ideaPrice,
  state,
}: {
  rows: PricedDraw[];
  ideaPrice: number | null;
  state: PriceState;
}) {
  const { token } = theme.useToken();
  const columns: TableColumnsType<PricedDraw> = [
    {
      title: '번째',
      dataIndex: 'no',
      width: 64,
      align: 'right',
      render: (no: number) => <span className="tnum">{formatNumber(no)}</span>,
    },
    {
      title: '옵션',
      key: 'option',
      render: (_value, draw) => (
        <Flex gap={8} align="center">
          {draw.found ? <SkillIcon skillId={draw.found.skill.id} size={ROW_ICON} /> : null}
          <Flex vertical gap={0} style={{ minWidth: 0 }}>
            <OptionName draw={draw} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {draw.found?.arcana.name ?? '아르카나 정보 없음'}
            </Text>
          </Flex>
        </Flex>
      ),
    },
    {
      title: '레벨',
      dataIndex: 'level',
      width: 88,
      align: 'right',
      sorter: (a, b) => a.level - b.level,
      render: (level: number) => (
        <Flex justify="flex-end">
          <LevelLabel level={level} />
        </Flex>
      ),
    },
    {
      title: '수치',
      key: 'value',
      width: 120,
      align: 'right',
      render: (_value, draw) => (
        <Flex vertical gap={0} align="flex-end">
          <span className="tnum" style={{ whiteSpace: 'nowrap' }}>
            {valueText(draw.option, draw.level)}
          </span>
          <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            최대 {formatRelicValue(draw.option, draw.option.max)}
          </Text>
        </Flex>
      ),
    },
    {
      title: '시세',
      key: 'price',
      width: 128,
      align: 'right',
      sorter: (a, b) => (a.price?.price ?? -1) - (b.price?.price ?? -1),
      render: (_value, draw) => (
        <Flex vertical gap={2} align="flex-end">
          <PriceText price={draw.price} ideaPrice={ideaPrice} state={state} />
          {state === 'ready' && isAboveIdea(draw.price, ideaPrice) ? <IdeaTag /> : null}
        </Flex>
      ),
    },
  ];

  return (
    <Card variant="outlined" style={{ minWidth: 0 }} styles={{ body: { padding: 0 } }}>
      <Table<PricedDraw>
        columns={columns}
        dataSource={rows}
        rowKey="no"
        size="small"
        // 이데아 최저가 이상인 줄은 빨갛게 깐다. 시세 칸에 글자 표시도 함께 붙는다.
        onRow={(draw) =>
          state === 'ready' && isAboveIdea(draw.price, ideaPrice)
            ? { style: { background: token.colorErrorBg } }
            : {}
        }
        pagination={
          rows.length > PAGE_SIZE
            ? { pageSize: PAGE_SIZE, showSizeChanger: false, size: 'small' }
            : false
        }
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '아직 복원하지 않았습니다.' }}
      />
    </Card>
  );
});

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

/**
 * 무리아스의 유물(이데아) 복원 시뮬레이터. 단추를 누르면 옵션과 레벨을 고르게 뽑아 쌓는다.
 * 골드도 아이템도 들지 않는다. 나온 유물에는 지금 시세를 붙여, 실제로 열었다면 무엇이 나왔을지와
 * 그 값이 어느 정도인지를 함께 본다. 시세는 워커가 모아 둔 작은 파일에서 오고(priceFile.ts), 받지 못해도 뽑기는 된다.
 */
export function RelicSimulatorView({
  simulator,
  prices,
}: {
  simulator: Simulator;
  /** 시세. 받지 못해도 뽑기는 된다. */
  prices: RelicPriceState;
}) {
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const arcanaQuery = useArcanaQuery();
  const arcanas = arcanaQuery.data?.arcanas;

  // 옵션마다 스킬과 아르카나. 옵션은 30가지뿐이라 한 번에 찾아 둔다.
  const foundByName = useMemo(
    () =>
      new Map(
        MURIAS_RELIC_POOL.map((option) => [option.name, skillOfOption(option.name, arcanas ?? [])]),
      ),
    [arcanas],
  );
  const ready = prices.status === 'ready' ? prices.prices : null;
  const priced = useMemo(
    () =>
      simulator.draws.map((draw): PricedDraw => ({
        ...draw,
        price: ready ? drawPrice(draw, ready) : null,
        found: foundByName.get(draw.option.name) ?? null,
      })),
    [simulator.draws, ready, foundByName],
  );

  const state = prices.status;
  const loading = state === 'loading';
  const ideaPrice = ready?.ideaPrice ?? null;
  const count = priced.length;
  const latest = priced.slice(count - simulator.lastBatch).reverse();
  const history = useMemo(() => [...priced].reverse(), [priced]);
  // 표는 카드보다 늦게 그린다. 누르자마자 카드에 결과와 시세가 먼저 뜬다.
  const settledHistory = useDeferredValue(history);

  const stats = useMemo(() => {
    let top = 0;
    let known = 0;
    let total = 0;
    let above = 0;
    for (const draw of priced) {
      if (draw.level === RELIC_MAX_LEVEL) top += 1;
      if (!draw.price) continue;
      known += 1;
      total += draw.price.price;
      if (ideaPrice !== null && draw.price.price >= ideaPrice) above += 1;
    }
    return { top, known, total, above };
  }, [priced, ideaPrice]);

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined">
        <Flex vertical gap={12}>
          <Flex gap={8} wrap align="center">
            <Button type="primary" onClick={() => simulator.draw(1)}>
              1번 복원
            </Button>
            <Button onClick={() => simulator.draw(10)}>10번 복원</Button>
            <Button
              icon={<ResetIcon />}
              onClick={simulator.reset}
              disabled={count === 0}
              style={{ marginLeft: wide ? 'auto' : undefined }}
            >
              처음부터
            </Button>
          </Flex>
          <Text type="secondary" style={{ fontSize: 13 }}>
            옵션 {formatNumber(MURIAS_RELIC_POOL.length)}종과 1~{RELIC_MAX_LEVEL}레벨이 모두 똑같이
            나온다고 보고 뽑습니다. 결과 하나가 나올 확률은 1/{formatNumber(RELIC_OUTCOMES)}입니다.
            실제 확률은 공개되지 않았고, 골드나 아이템은 들지 않습니다.
          </Text>
        </Flex>
      </Card>
      <PriceFreshness prices={prices} />

      {/*
        뽑기 전에도 틀을 모두 그려 둔다. 첫 복원에서 요약 칸과 표를 새로 만들면 그만큼 결과가
        늦게 떴다. 첫 복원은 빈칸을 채우기만 한다.
      */}
      <Card variant="outlined">
        {/* 네 칸. 768px 미만에서는 두 칸, 576px 미만에서는 한 칸으로 떨어진다. */}
        <Row gutter={[24, 16]} align="top">
          <Col xs={24} sm={12} md={6}>
            <Statistic title="복원" value={formatNumber(count)} suffix="번" styles={NUMERIC} />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title={`${RELIC_MAX_LEVEL}레벨`}
              value={formatNumber(stats.top)}
              suffix="번"
              styles={NUMERIC}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title={
                <StatTitle
                  label="이데아 최저가 이상"
                  detail={
                    ideaPrice === null
                      ? '이데아 매물이 없거나 시세를 아직 받지 못해 견줄 수 없습니다.'
                      : `나온 유물의 시세가 이데아 최저가 ${formatGold(ideaPrice)} 이상인 횟수입니다. 시세를 아는 ${formatNumber(stats.known)}번 가운데서 셉니다.`
                  }
                />
              }
              value={ideaPrice === null ? '-' : formatNumber(stats.above)}
              suffix={ideaPrice === null ? undefined : '번'}
              loading={loading}
              styles={NUMERIC}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title={
                <StatTitle
                  label="나온 유물 시세 합계"
                  detail={`그 옵션 그 레벨의 지금 최저가, 매물이 없으면 최종 거래가로 더했습니다. 매물도 거래 기록도 없는 ${formatNumber(count - stats.known)}번은 뺐습니다.`}
                />
              }
              value={ready ? formatGoldShort(stats.total) : '-'}
              loading={loading}
              styles={NUMERIC}
            />
            {ideaPrice !== null && count > 0 ? (
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                이데아 {formatNumber(count)}개 최저가로는 {formatGoldShort(ideaPrice * count)}
              </Text>
            ) : null}
          </Col>
        </Row>
      </Card>

      <Flex vertical gap={8} role="region" aria-labelledby="relic-sim-latest">
        <Text strong style={{ fontSize: 16 }} id="relic-sim-latest">
          방금 나온 유물
        </Text>
        {/* 넓은 화면에서는 두 칸, 768px 미만에서는 한 칸. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              wide && latest.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
            gap: 8,
          }}
        >
          {latest.map((draw) => (
            <DrawCard key={draw.no} draw={draw} ideaPrice={ideaPrice} state={state} />
          ))}
        </div>
        {count === 0 ? (
          <EmptyState
            size="small"
            variant="search"
            description="복원 단추를 누르면 나온 유물과 지금 시세가 여기에 쌓입니다."
          />
        ) : null}
      </Flex>

      <Flex
        vertical
        gap={8}
        role="region"
        aria-labelledby="relic-sim-history"
        style={{ minWidth: 0 }}
      >
        <Text strong style={{ fontSize: 16 }} id="relic-sim-history">
          복원 기록
        </Text>
        <HistoryTable rows={settledHistory} ideaPrice={ideaPrice} state={state} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          빨간 줄과 "이데아 이상" 표시는 시세가 이데아 최저가 이상인 결과, "최종" 이 붙은 흐린
          시세는 매물이 없어 최종 거래가를 적은 것입니다. 옵션 이름을 누르면 경매장에서 그 레벨의
          매물을 봅니다.
        </Text>
      </Flex>
    </Flex>
  );
}
