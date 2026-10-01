import { useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  Flex,
  Grid,
  InputNumber,
  Select,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from 'antd';
import { HelpIcon } from '@/components/icons';
import { TrialCountInput } from '@/components/simulator/TrialOdds';
import { costOfTrials, oddsCounts, type OddsCounts } from '@/features/holyWater/odds';
import {
  effectChance,
  effectMax,
  HOLY_WATER_EFFECTS,
  HOLY_WATER_SCROLLS,
  HOLY_WATER_TIERS,
  tierChance,
  type HolyWaterDraw,
} from '@/features/holyWater/simulator';
import {
  atLeastOnce,
  expectedHits,
  formatChance,
  formatExpected,
} from '@/features/simulator/trials';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 등급마다 한 번 발라 그 등급 이상이 나올 확률. 늘 같아 한 번만 센다. */
const TIER_CHANCES = HOLY_WATER_TIERS.map((tier) => ({ tier, chance: tierChance(tier) }));

/** 효과 고르기 목록. 수치가 하나뿐인 효과도 넣는다(음악 버프 효과를 노리는 사람이 있다). */
const EFFECT_OPTIONS = HOLY_WATER_EFFECTS.map((effect, index) => ({
  value: index,
  label: effect.name,
}));

/** 지금 가진 효과와 수치. effect 는 HOLY_WATER_EFFECTS 의 순번이고, value 가 0 이면 아직 없는 것이다. */
interface Mine {
  effect: number;
  value: number;
}

/** 한 줄. 구간 이름과 그 구간이 한 번에 나올 확률. */
interface OddsLine {
  key: string;
  label: string;
  chance: number;
  counts: OddsCounts | null;
  /** 내 수치 줄만. 지금까지 바른 것 가운데 이 줄에 드는 횟수. */
  hits?: number;
}

/**
 * 성수를 발라 원하는 수치가 나오려면 몇 번, 얼마가 드는지. 등급(50, 90, 95, 98% 이상) 표와, 지금 가진 효과와
 * 수치(최대 대미지 27 처럼)를 고르면 "이보다 높게" 나올 확률을 같은 모양으로 보여 준다. 시행 횟수를 넣으면
 * 줄마다 그 횟수 안에 한 번 이상 나올 확률과 나오는 횟수의 기댓값도 센다. 비용은 횟수에 성수 가격을 곱한
 * 값이고, 가격은 경매장 최저가에서 시작해 직접 고칠 수 있다(직접 만들어 쓰는 사람은 제작비를 넣는다).
 */
export function HolyWaterOdds({
  price,
  auctionPrice,
  priceLoading,
  priceOverridden,
  onPriceChange,
  draws,
}: {
  /** 비용을 셀 성수 한 개의 가격. 직접 고친 값이 있으면 그 값이다. 모르면 null. */
  price: number | null;
  /** 경매장 최저가. 없으면 null. */
  auctionPrice: number | null;
  priceLoading: boolean;
  priceOverridden: boolean;
  /** null 이면 직접 고친 값을 버리고 경매장 최저가로 돌아간다. */
  onPriceChange: (price: number | null) => void;
  /** 지금까지 바른 것. 내 수치 줄의 "지금까지 몇 번" 을 센다. */
  draws: readonly HolyWaterDraw[];
}) {
  const formatGold = useGoldFormatter();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;
  const [mine, setMine] = useState<Mine | null>(null);
  const [trials, setTrials] = useState(10);
  const mineEffect = mine ? HOLY_WATER_EFFECTS[mine.effect] : null;

  const lines = useMemo<OddsLine[]>(() => {
    const tiers = TIER_CHANCES.map(({ tier, chance }) => ({
      key: `tier-${tier}`,
      label: `${tier}% 이상`,
      chance,
      counts: oddsCounts(chance),
    }));
    if (!mine) return tiers;
    const effect = HOLY_WATER_EFFECTS[mine.effect];
    // 내 수치보다 높게, 곧 한 칸 위부터다. 0 이면 그 효과가 붙기만 하면 된다.
    const chance = effectChance(mine.effect, mine.value + 1);
    const hits = draws.filter(
      (draw) => HOLY_WATER_SCROLLS[draw.scroll].effect === mine.effect && draw.value > mine.value,
    ).length;
    const label =
      mine.value === 0 ? effect.name : `${effect.name} ${formatNumber(mine.value)} 초과`;
    return [{ key: 'mine', label, chance, counts: oddsCounts(chance), hits }, ...tiers];
  }, [mine, draws]);

  /** 횟수와 그 횟수의 비용. 비용을 모르면 횟수만 적는다. */
  const trialsCell = (count: number, suffix: string): ReactNode => {
    const cost = costOfTrials(count, price);
    return (
      <Flex vertical gap={0} align={wide ? 'flex-end' : 'flex-start'}>
        <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
          {formatNumber(count)}번{suffix}
        </Text>
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {cost === null ? '-' : formatGold(cost)}
        </Text>
      </Flex>
    );
  };

  /** 시행 횟수 안에 한 번 이상 나올 확률과 나오는 횟수의 기댓값. */
  const inTrialsCell = (line: OddsLine): ReactNode => (
    <Flex vertical gap={0} align={wide ? 'flex-end' : 'flex-start'}>
      <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
        한 번 이상 {formatChance(atLeastOnce(line.chance, trials))}
      </Text>
      <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        평균 {formatExpected(expectedHits(line.chance, trials))}번 나옴
      </Text>
    </Flex>
  );

  /** 줄 이름. 내 수치 줄은 지금까지 몇 번 나왔는지, 더 높게 나올 수 없는지를 아래에 적는다. */
  const labelCell = (line: OddsLine): ReactNode => (
    <Flex vertical gap={0}>
      <Text strong={line.key === 'mine'} style={{ whiteSpace: 'nowrap' }}>
        {line.label}
      </Text>
      {line.key === 'mine' ? (
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {line.counts === null
            ? '이 수치보다 높게는 나오지 않습니다.'
            : `지금까지 ${formatNumber(line.hits ?? 0)}번`}
        </Text>
      ) : null}
    </Flex>
  );

  const trialsLabel = `${formatNumber(trials)}번 하면`;
  const columns: TableColumnsType<OddsLine> = [
    { title: '구간', key: 'label', render: (_value, line) => labelCell(line) },
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
    {
      title: trialsLabel,
      key: 'trials',
      align: 'right',
      render: (_value, line) => (line.counts ? inTrialsCell(line) : '-'),
    },
  ];

  const trialsCost = costOfTrials(trials, price);

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
                공식 확률이 아닙니다. 게임 데이터의 성수 스크롤 102장을 같은 확률로 고르고, 그
                스크롤의 폭 안에서 수치를 고르게 고른다고 보고 센 값입니다. 평균은 확률의 역수이고,
                절반·90% 확률로는 그 횟수 안에 한 번 이상 나올 확률이 처음으로 그 값을 넘는
                횟수입니다. 실제와 다를 수 있습니다.
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
              formatter={(value) =>
                value === undefined ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
              }
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
            <Text type="secondary">현재 내 수치</Text>
            <Select<number>
              aria-label="현재 내 효과"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="예: 최대 대미지"
              value={mine?.effect ?? null}
              onChange={(effect) =>
                setMine(effect === undefined || effect === null ? null : { effect, value: 0 })
              }
              options={EFFECT_OPTIONS}
              popupMatchSelectWidth={false}
              style={{ width: 200 }}
            />
            <InputNumber<number>
              aria-label="현재 내 수치"
              min={0}
              max={mineEffect ? effectMax(mineEffect) : 0}
              precision={0}
              value={mine?.value ?? null}
              disabled={!mine}
              onChange={(value) => {
                if (!mine || !mineEffect) return;
                const next = Math.min(Math.max(Math.round(value ?? 0), 0), effectMax(mineEffect));
                setMine({ ...mine, value: next });
              }}
              className="tnum"
              style={{ width: 96 }}
            />
          </Flex>
          <Flex gap={8} align="center" wrap>
            <TrialCountInput value={trials} onChange={setTrials} />
            {trialsCost !== null ? (
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {formatGold(trialsCost)}
              </Text>
            ) : null}
          </Flex>
        </Flex>

        {wide ? (
          <Table<OddsLine>
            columns={columns}
            dataSource={lines}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
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
                  {labelCell(line)}
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
                    <Flex vertical gap={0}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {trialsLabel}
                      </Text>
                      {inTrialsCell(line)}
                    </Flex>
                  </Flex>
                ) : null}
              </Flex>
            ))}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
