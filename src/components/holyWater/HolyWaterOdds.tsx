import { useMemo, useState, type ReactNode } from 'react';
import { Button, Card, Flex, Grid, InputNumber, Table, Tag, Tooltip, Typography, type TableColumnsType } from 'antd';
import { HelpIcon } from '@/components/icons';
import { costOfTrials, oddsCounts, type OddsCounts } from '@/features/holyWater/odds';
import { chanceAbovePercent, HOLY_WATER_TIERS, tierChance } from '@/features/holyWater/simulator';
import { formatNumber } from '@/lib/format';
import { formatChance } from '@/features/simulator/trials';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 등급마다 한 번 발라 그 등급 이상이 나올 확률. 늘 같아 한 번만 센다. */
const TIER_CHANCES = HOLY_WATER_TIERS.map((tier) => ({ tier, chance: tierChance(tier) }));

/** 한 줄. 구간 이름과 그 구간이 한 번에 나올 확률. */
interface OddsLine {
  key: string;
  label: string;
  chance: number;
  counts: OddsCounts | null;
}

/**
 * 성수를 발라 원하는 수치가 나오려면 몇 번, 얼마가 드는지. 등급(50, 90, 95, 98% 이상) 표와, 현재 내 수치를
 * 넣으면 "이보다 높게" 나올 확률을 같은 모양으로 보여 준다. 비용은 횟수에 성수 가격을 곱한 값이고, 가격은
 * 경매장 최저가에서 시작해 직접 고칠 수 있다(직접 만들어 쓰는 사람은 제작비를 넣는다).
 */
export function HolyWaterOdds({
  price,
  auctionPrice,
  priceLoading,
  priceOverridden,
  onPriceChange,
}: {
  /** 비용을 셀 성수 한 개의 가격. 직접 고친 값이 있으면 그 값이다. 모르면 null. */
  price: number | null;
  /** 경매장 최저가. 없으면 null. */
  auctionPrice: number | null;
  priceLoading: boolean;
  priceOverridden: boolean;
  /** null 이면 직접 고친 값을 버리고 경매장 최저가로 돌아간다. */
  onPriceChange: (price: number | null) => void;
}) {
  const formatGold = useGoldFormatter();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const [percent, setPercent] = useState<number | null>(null);

  const lines = useMemo<OddsLine[]>(() => {
    const tiers = TIER_CHANCES.map(({ tier, chance }) => ({
      key: `tier-${tier}`,
      label: `${tier}% 이상`,
      chance,
      counts: oddsCounts(chance),
    }));
    if (percent === null) return tiers;
    const chance = chanceAbovePercent(percent);
    return [
      { key: 'mine', label: `내 수치 ${percent}% 초과`, chance, counts: oddsCounts(chance) },
      ...tiers,
    ];
  }, [percent]);

  /** 횟수와 그 횟수의 비용. 비용을 모르면 횟수만 적는다. */
  const trialsCell = (trials: number, suffix: string): ReactNode => {
    const cost = costOfTrials(trials, price);
    return (
      <Flex vertical gap={0} align={wide ? 'flex-end' : 'flex-start'}>
        <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
          {formatNumber(trials)}번{suffix}
        </Text>
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {cost === null ? '-' : formatGold(cost)}
        </Text>
      </Flex>
    );
  };

  const columns: TableColumnsType<OddsLine> = [
    {
      title: '구간',
      key: 'label',
      render: (_value, line) => (
        <Text strong={line.key === 'mine'} style={{ whiteSpace: 'nowrap' }}>
          {line.label}
        </Text>
      ),
    },
    {
      title: '확률',
      key: 'chance',
      align: 'right',
      className: 'tnum',
      render: (_value, line) => formatChance(line.chance),
    },
    {
      title: '평균',
      key: 'mean',
      align: 'right',
      render: (_value, line) => (line.counts ? trialsCell(line.counts.mean, '에 한 번') : '-'),
    },
    {
      title: '절반 확률로',
      key: 'half',
      align: 'right',
      render: (_value, line) => (line.counts ? trialsCell(line.counts.half, ' 안') : '-'),
    },
    {
      title: '90% 확률로',
      key: 'ninety',
      align: 'right',
      render: (_value, line) => (line.counts ? trialsCell(line.counts.ninety, ' 안') : '-'),
    },
  ];

  return (
    <Card
      variant="outlined"
      role="region"
      aria-label="확률과 비용"
      title={
        <Flex gap={8} align="center" wrap>
          <span>확률과 비용</span>
          <Tooltip
            title={
              <div style={{ fontSize: 12, maxWidth: 300 }}>
                공식 확률이 아닙니다. 게임 데이터의 성수 스크롤 102장을 같은 확률로 고르고, 그 스크롤의 폭
                안에서 수치를 고르게 고른다고 보고 센 값입니다. 평균은 확률의 역수이고, 절반·90% 확률로는
                그 횟수 안에 한 번 이상 나올 확률이 처음으로 그 값을 넘는 횟수입니다. 실제와 다를 수 있습니다.
              </div>
            }
          >
            <Tag
              tabIndex={0}
              icon={<HelpIcon />}
              style={{ marginInlineEnd: 0, cursor: 'help' }}
              aria-label="추정치, 확률의 출처와 계산 방식"
            >
              추정치
            </Tag>
          </Tooltip>
        </Flex>
      }
    >
      <Flex vertical gap={14}>
        <Flex gap={16} align="center" wrap>
          <Flex gap={8} align="center" wrap>
            <label htmlFor="holy-water-price">
              <Text type="secondary">성수 가격</Text>
            </label>
            <InputNumber<number>
              id="holy-water-price"
              min={0}
              precision={0}
              controls={false}
              // 큰 금액이라 자릿수를 끊어 보여 준다. 쉼표는 읽을 때 뗀다.
              formatter={(value) => (value === undefined ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
              parser={(text) => Number((text ?? '').replace(/,/g, ''))}
              placeholder={priceLoading ? '받는 중' : '가격 없음'}
              value={price}
              onChange={(value) => onPriceChange(value)}
              suffix="G"
              className="tnum"
              style={{ width: 170 }}
            />
            {priceOverridden && auctionPrice !== null ? (
              <Button size="small" type="link" onClick={() => onPriceChange(null)}>
                경매장 최저가 {formatGold(auctionPrice)}로
              </Button>
            ) : auctionPrice !== null ? (
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                경매장 최저가
              </Text>
            ) : null}
          </Flex>
          <Flex gap={8} align="center" wrap>
            <label htmlFor="holy-water-mine">
              <Text type="secondary">현재 내 수치</Text>
            </label>
            <InputNumber<number>
              id="holy-water-mine"
              min={0}
              max={100}
              step={0.5}
              precision={1}
              controls={false}
              placeholder="예: 97.5"
              value={percent}
              onChange={(value) => setPercent(value)}
              suffix="%"
              className="tnum"
              style={{ width: 120 }}
            />
          </Flex>
        </Flex>

        {wide ? (
          <Table<OddsLine>
            columns={columns}
            dataSource={lines}
            rowKey="key"
            size="small"
            pagination={false}
          />
        ) : (
          <Flex vertical gap={12}>
            {lines.map((line) => (
              <Flex
                key={line.key}
                vertical
                gap={4}
                role="group"
                aria-label={line.label}
                style={{ paddingBottom: 8, borderBottom: '1px solid rgba(128,128,128,0.2)' }}
              >
                <Flex justify="space-between" gap={8}>
                  <Text strong>{line.label}</Text>
                  <Text className="tnum">확률 {formatChance(line.chance)}</Text>
                </Flex>
                {line.counts ? (
                  <Flex gap={16} wrap>
                    <Flex vertical gap={0}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        평균
                      </Text>
                      {trialsCell(line.counts.mean, '에 한 번')}
                    </Flex>
                    <Flex vertical gap={0}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        절반 확률로
                      </Text>
                      {trialsCell(line.counts.half, ' 안')}
                    </Flex>
                    <Flex vertical gap={0}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        90% 확률로
                      </Text>
                      {trialsCell(line.counts.ninety, ' 안')}
                    </Flex>
                  </Flex>
                ) : (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    이 수치보다 높게는 나오지 않습니다.
                  </Text>
                )}
              </Flex>
            ))}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
