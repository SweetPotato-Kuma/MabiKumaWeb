import { useMemo } from 'react';
import { Flex, Tooltip, Typography, theme } from 'antd';
import type { DailySummary } from '@/features/market/api';
import {
  buildSlots,
  linePath,
  slotX,
  valueRange,
  valueY,
  type Slot,
} from '@/features/market/series';
import { formatGold, formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 그래프 높이. 자리를 미리 잡아 두어 값이 도착해도 아래가 밀리지 않는다. */
const CHART_HEIGHT = 180;
/** 세로축 글자 칸 폭. 억 단위 가격도 한 줄에 든다. */
const AXIS_WIDTH = 92;

function SlotTooltip({ slot }: { slot: Slot }) {
  if (!slot.summary) return <span className="tnum">{slot.date} 거래 없음</span>;
  const { summary } = slot;
  return (
    <Flex vertical gap={2} className="tnum">
      <strong>{slot.date}</strong>
      <span>중위 {formatGold(summary.mid)}</span>
      <span>평균 {formatGold(summary.avg)}</span>
      <span>
        {formatGold(summary.lo)} ~ {formatGold(summary.hi)}
      </span>
      <span>
        거래 {formatNumber(summary.n)}건, {formatNumber(summary.qty)}개
      </span>
    </Flex>
  );
}

/**
 * 날짜별 개당 가격. 실선이 중위, 점선이 평균이다.
 *
 * 최저와 최고는 그리지 않는다. 한 건만 터무니없는 값에 팔려도 세로 폭이 그쪽으로 늘어나 정작 중위의
 * 움직임이 납작해진다. 날마다 칸에 마우스를 올리면(누르면) 그날의 최저, 최고, 거래 수가 뜬다.
 *
 * 선은 SVG 를 가로세로로 늘려 그리고(선 굵기는 그대로), 점과 마우스 칸은 같은 좌표를 백분율로 써서
 * HTML 로 얹는다. 차트 라이브러리를 들이지 않으려는 것이다.
 */
export function PriceHistoryChart({
  daily,
  days,
  now = Date.now(),
}: {
  daily: readonly DailySummary[];
  days: number;
  now?: number;
}) {
  const { token } = theme.useToken();
  const slots = useMemo(() => buildSlots(daily, days, now), [daily, days, now]);
  const values = slots.flatMap((slot) =>
    slot.summary ? [slot.summary.mid, slot.summary.avg] : [],
  );
  const range = valueRange(values);
  const midPath = linePath(slots, (summary) => summary.mid, range);
  const avgPath = linePath(slots, (summary) => summary.avg, range);
  const middle = (range.min + range.max) / 2;

  return (
    <Flex vertical gap={6}>
      <Flex gap={8}>
        {/* 세로축. 위, 가운데, 아래 세 값만 적는다. */}
        <Flex
          vertical
          justify="space-between"
          align="flex-end"
          style={{ width: AXIS_WIDTH, height: CHART_HEIGHT, flex: '0 0 auto' }}
          aria-hidden
        >
          {[range.max, middle, range.min].map((value, index) => (
            <Text
              key={index}
              type="secondary"
              className="tnum"
              style={{ fontSize: 12, lineHeight: 1 }}
            >
              {formatGold(Math.round(value))}
            </Text>
          ))}
        </Flex>

        <div
          role="img"
          aria-label={`최근 ${days}일 날짜별 중위 가격 그래프`}
          style={{
            position: 'relative',
            flex: '1 1 auto',
            minWidth: 0,
            height: CHART_HEIGHT,
            borderBlock: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
          >
            <line
              x1="0"
              x2="100"
              y1="50"
              y2="50"
              stroke={token.colorBorderSecondary}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={avgPath}
              fill="none"
              stroke={token.colorTextTertiary}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={midPath}
              fill="none"
              stroke={token.colorPrimary}
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* 점. 앞뒤가 비어 선이 없는 날도 점으로는 보인다. */}
          {slots.map((slot, index) =>
            slot.summary ? (
              <span
                key={slot.date}
                style={{
                  position: 'absolute',
                  left: `${slotX(index, slots.length)}%`,
                  top: `${valueY(slot.summary.mid, range)}%`,
                  width: 6,
                  height: 6,
                  marginLeft: -3,
                  marginTop: -3,
                  borderRadius: '50%',
                  background: token.colorPrimary,
                  pointerEvents: 'none',
                }}
              />
            ) : null,
          )}

          {/* 날마다 한 칸. 올리면 그날 값이 뜬다. */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {slots.map((slot) => (
              <Tooltip key={slot.date} title={<SlotTooltip slot={slot} />} mouseEnterDelay={0}>
                <div style={{ flex: '1 1 0', height: '100%' }} />
              </Tooltip>
            ))}
          </div>
        </div>
      </Flex>

      <Flex justify="space-between" style={{ marginLeft: AXIS_WIDTH + 8 }} aria-hidden>
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          {slots[0]?.date.slice(5)}
        </Text>
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          {slots[slots.length - 1]?.date.slice(5)}
        </Text>
      </Flex>
    </Flex>
  );
}
