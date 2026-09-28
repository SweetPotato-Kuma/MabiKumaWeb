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
  /** 한 번에 드는 골드. 모르면 비용 칸을 비운다. */
  costPerTrial?: number | null;
  /** 처음 칸에 들어 있는 횟수. */
  defaultTrials?: number;
  /** 무엇을 기준으로 한 확률인지 한 줄. 가정이 있으면 여기 적는다. */
  note?: string;
  /**
   * 테두리 상자로 감쌀지. 카드 안에서 다른 줄과 이어 쓰면 상자가 카드를 둘로 가른 것처럼 보여 끈다.
   */
  framed?: boolean;
}

/**
 * n 번 하면 원하는 것이 한 번 이상 나올 확률과 나오는 횟수의 기댓값. 매번 같은 확률로 따로
 * 뽑는 시뮬레이터(독립시행)라면 어디든 붙인다. 50%, 90%, 99% 로 보려면 몇 번 해야 하는지도 함께 적는다.
 */
export function TrialOdds({
  chance,
  verb,
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

  return (
    <section
      aria-label={`${verb} 횟수별 확률`}
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
            {verb}하면 한 번 이상 나올 확률 <Text strong>{formatChance(hit)}</Text>, 나오는 횟수는
            평균 <Text strong>{formatExpected(expected)}번</Text>
            {trialsCost !== null ? (
              <>
                , 드는 골드 <Text strong>{formatGoldShort(trialsCost)}</Text>
              </>
            ) : null}
          </Text>
          <Tooltip
            title={`${verb}은 매번 앞 결과와 상관없이 같은 확률로 뽑습니다. n번 안에 한 번 이상 나올 확률은 1 - (1 - p)^n, 나오는 횟수의 기댓값은 n x p 입니다. 평균 횟수만큼 해도 한 번 이상 나올 확률은 63% 남짓입니다.`}
          >
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
                {formatChance(goal)} 확률로 보려면{' '}
                <Text strong style={{ fontSize: 12 }}>
                  {Number.isFinite(need) ? `${formatNumber(need)}번` : '-'}
                </Text>
                {needCost !== null ? ` (${formatGoldShort(needCost)})` : ''}
              </Text>
            );
          })}
        </Flex>
        {note ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {note}
          </Text>
        ) : null}
      </Flex>
    </section>
  );
}
