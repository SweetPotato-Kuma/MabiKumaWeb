import { useState } from 'react';
import { Flex, InputNumber, Typography, theme } from 'antd';
import { atLeastOnce, expectedHits, formatChance } from '@/features/simulator/trials';
import { formatGoldShort } from '@/lib/format';

const { Text } = Typography;

/** 입력 칸이 받는 가장 큰 횟수. 이보다 크면 비용과 기댓값이 읽을 수 없는 숫자가 된다. */
export const MAX_TRIALS = 10_000_000;

/** 기댓값을 읽기 좋게. 1 이상은 소수 둘째 자리, 그 아래는 유효 숫자 세 자리. */
function formatExpected(value: number): string {
  if (value >= 1) return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return value.toLocaleString('ko-KR', { maximumSignificantDigits: 3 });
}

/** "시행 횟수 [10]번". 계산기 창 맨 위에 두고 그 아래 계산들이 같은 횟수를 쓴다. */
export function TrialCountInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Flex gap={8} align="center">
      <Text strong style={{ fontSize: 13 }}>
        시행 횟수
      </Text>
      <InputNumber<number>
        aria-label="시행 횟수"
        size="small"
        min={1}
        max={MAX_TRIALS}
        value={value}
        onChange={(next) => {
          if (next === null) return;
          onChange(Math.min(Math.max(Math.round(next), 1), MAX_TRIALS));
        }}
        suffix="번"
        className="tnum"
        style={{ width: 110 }}
      />
    </Flex>
  );
}

interface TrialOddsProps {
  /** 한 번 할 때 원하는 것이 나올 확률(0~1). */
  chance: number;
  /** 한 번을 부르는 말. "세공", "복원". 영역 이름에 쓴다. */
  verb: string;
  /** 무엇의 확률인지 짧은 이름. 주면 줄 앞에 굵게 붙고, 영역 이름도 이것으로 한다. */
  label?: string;
  /** 한 번에 드는 골드. 모르면 비용 칸을 비운다. */
  costPerTrial?: number | null;
  /**
   * 시행 횟수. 주면 입력 칸을 그리지 않고 이 값으로 센다. 한 창에서 여러 계산이 한 입력 칸을
   * 같이 쓸 때 준다(TrialCountInput). 안 주면 제 입력 칸을 둔다.
   */
  trials?: number;
  /** 제 입력 칸을 쓸 때 처음 들어 있는 횟수. */
  defaultTrials?: number;
  /**
   * 테두리 상자로 감쌀지. 카드 안에서 다른 줄과 이어 쓰면 상자가 카드를 둘로 가른 것처럼 보여 끈다.
   */
  framed?: boolean;
}

/**
 * n 번 하면 원하는 것이 한 번 이상 나올 확률과 나오는 횟수의 기댓값. 매번 같은 확률로 따로
 * 뽑는 시뮬레이터(독립시행)라면 어디든 붙인다.
 */
export function TrialOdds({
  chance,
  verb,
  label,
  costPerTrial = null,
  trials: fixedTrials,
  defaultTrials = 10,
  framed = true,
}: TrialOddsProps) {
  const { token } = theme.useToken();
  const [ownTrials, setOwnTrials] = useState(defaultTrials);
  const trials = fixedTrials ?? ownTrials;

  if (chance <= 0) return null;

  const hit = atLeastOnce(chance, trials);
  const expected = expectedHits(chance, trials);
  const cost = costPerTrial === null ? null : costPerTrial * trials;

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
      <Flex gap={8} align="center" wrap>
        {label ? <Text strong>{label}</Text> : null}
        {fixedTrials === undefined ? (
          <TrialCountInput value={ownTrials} onChange={setOwnTrials} />
        ) : null}
        <Text className="tnum" style={{ fontSize: 13 }}>
          한 번 이상 나올 확률 <Text strong>{formatChance(hit)}</Text>, 평균{' '}
          <Text strong>{formatExpected(expected)}번</Text>
          {cost !== null ? (
            <>
              , <Text strong>{formatGoldShort(cost)}</Text>
            </>
          ) : null}
        </Text>
      </Flex>
    </section>
  );
}
