import { useState } from 'react';
import { Flex, InputNumber, Tooltip, Typography, theme } from 'antd';
import { InfoIcon } from '@/components/icons';
import {
  atLeastOnce,
  expectedHits,
  formatChance,
  trialsFor,
  TRIAL_GOALS,
} from '@/features/simulator/trials';
import { formatGoldShort, formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 입력 칸이 받는 가장 큰 횟수. 이보다 크면 비용과 기댓값이 읽을 수 없는 숫자가 된다. */
const MAX_TRIALS = 10_000_000;

/** 기댓값을 읽기 좋게. 1 이상은 소수 둘째 자리, 그 아래는 유효 숫자 세 자리. */
function formatExpected(value: number): string {
  if (value >= 1) return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return value.toLocaleString('ko-KR', { maximumSignificantDigits: 3 });
}

interface TrialOddsProps {
  /** 한 번 할 때 원하는 것이 나올 확률(0~1). */
  chance: number;
  /** 한 번을 부르는 말. "세공", "복원". */
  verb: string;
  /** 무엇의 확률인지 짧은 이름. "본전". 주면 줄 앞에 굵게 붙고, 영역 이름도 이것으로 한다. */
  label?: string;
  /** 한 번에 드는 골드. 모르면 비용 칸을 비운다. */
  costPerTrial?: number | null;
  /** 처음 칸에 들어 있는 횟수. */
  defaultTrials?: number;
  /** 확률에 섞인 가정. 화면에 늘어놓지 않고 ⓘ 툴팁에 덧붙인다. */
  note?: string;
  /**
   * 테두리 상자로 감쌀지. 카드 안에서 다른 줄과 이어 쓰면 상자가 카드를 둘로 가른 것처럼 보여 끈다.
   */
  framed?: boolean;
}

/**
 * n 번 하면 원하는 것이 한 번 이상 나올 확률과 나오는 횟수의 기댓값. 매번 같은 확률로 따로
 * 뽑는 시뮬레이터(독립시행)라면 어디든 붙인다. 50%, 90%, 99% 로 보려면 몇 번 해야 하는지도 함께 적는다.
 * 설명 문장은 늘어놓지 않는다. 계산 방법과 가정은 ⓘ 툴팁에 있다.
 */
export function TrialOdds({
  chance,
  verb,
  label,
  costPerTrial = null,
  defaultTrials = 10,
  note,
  framed = true,
}: TrialOddsProps) {
  const { token } = theme.useToken();
  const [trials, setTrials] = useState(defaultTrials);
  const cost = (n: number) => (costPerTrial === null ? null : costPerTrial * n);

  if (chance <= 0) return null;

  const hit = atLeastOnce(chance, trials);
  const expected = expectedHits(chance, trials);
  const trialsCost = cost(trials);
  const help = [
    `n번 안에 한 번 이상 나올 확률은 1 - (1 - p)^n, 나오는 횟수의 기댓값은 n x p 입니다. 한 번에 나올 확률 p 는 ${formatChance(chance)}입니다.`,
    note,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      aria-label={label ?? `${verb} 횟수별 확률`}
      style={
        framed
          ? {
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadius,
              background: token.colorFillQuaternary,
              padding: '10px 12px',
            }
          : undefined
      }
    >
      <Flex vertical gap={6}>
        <Flex gap={8} align="center" wrap>
          {label ? <Text strong>{label}</Text> : null}
          <InputNumber<number>
            aria-label={`${verb} 횟수`}
            size="small"
            min={1}
            max={MAX_TRIALS}
            value={trials}
            onChange={(value) => {
              if (value === null) return;
              setTrials(Math.min(Math.max(Math.round(value), 1), MAX_TRIALS));
            }}
            suffix="번"
            className="tnum"
            style={{ width: 110 }}
          />
          <Text className="tnum" style={{ fontSize: 13 }}>
            {verb}하면 <Text strong>{formatChance(hit)}</Text>, 평균{' '}
            <Text strong>{formatExpected(expected)}번</Text>
            {trialsCost !== null ? (
              <>
                , <Text strong>{formatGoldShort(trialsCost)}</Text>
              </>
            ) : null}
          </Text>
          <Tooltip title={help}>
            <InfoIcon
              aria-label="계산 방법"
              tabIndex={0}
              style={{ cursor: 'help', color: token.colorTextTertiary }}
            />
          </Tooltip>
        </Flex>
        <Flex gap={16} wrap>
          {TRIAL_GOALS.map((goal) => {
            const need = trialsFor(chance, goal);
            const needCost = Number.isFinite(need) ? cost(need) : null;
            return (
              <Text key={goal} type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {formatChance(goal)}{' '}
                <Text strong style={{ fontSize: 12 }}>
                  {Number.isFinite(need) ? `${formatNumber(need)}번` : '-'}
                </Text>
                {needCost !== null ? ` (${formatGoldShort(needCost)})` : ''}
              </Text>
            );
          })}
        </Flex>
      </Flex>
    </section>
  );
}
