import { useMemo, type CSSProperties } from 'react';
import { Flex, Tooltip, Typography, theme } from 'antd';
import type { PriceSummary } from '@/features/market/api';
import {
  isIsolated,
  linePath,
  slotX,
  thursdayRuns,
  valueRange,
  valueY,
} from '@/features/market/series';
import { formatGold, formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 가격 칸 높이. 자리를 미리 잡아 두어 값이 도착해도 아래가 밀리지 않는다. */
const PRICE_HEIGHT = 160;
/** 거래량 칸 높이. 가격보다 낮게 둔다. 얼마나 팔렸는지는 크기만 비교하면 된다. */
const VOLUME_HEIGHT = 56;
/** 두 칸 사이. */
const PANEL_GAP = 18;
/** 세로축 글자 칸 폭. 억 단위 가격도 한 줄에 든다. */
const AXIS_WIDTH = 92;
/** 막대 최대 폭. 칸이 넓어도 막대가 칸을 다 채우지 않게 한다. */
const BAR_MAX_WIDTH = 24;
/** 칸이 이보다 적으면 모든 날에 점을 찍는다. 많으면 앞뒤가 빈 점만 찍는다. */
const DOT_ALL_BELOW = 45;

export interface ChartSlot {
  key: string;
  /** 한국 시각 날짜. 목요일 음영이 이걸 본다. */
  date: string;
  /** 칸에 마우스를 올렸을 때 맨 윗줄. 예: "09-25 (목) 13시" */
  title: string;
  summary: PriceSummary | null;
}

export interface ChartTick {
  index: number;
  label: string;
  /** 칸의 왼쪽 끝(날이 바뀌는 곳)에 붙일지, 칸 가운데에 붙일지 */
  at: 'start' | 'center';
}

function SlotTooltip({ slot }: { slot: ChartSlot }) {
  if (!slot.summary) return <span className="tnum">{slot.title} 거래 없음</span>;
  const { summary } = slot;
  return (
    <Flex vertical gap={2} className="tnum">
      <strong>{slot.title}</strong>
      <span>
        거래 {formatNumber(summary.n)}건, {formatNumber(summary.qty)}개
      </span>
      <span>중위 {formatGold(summary.mid)}</span>
      <span>평균 {formatGold(summary.avg)}</span>
      <span>
        {formatGold(summary.lo)} ~ {formatGold(summary.hi)}
      </span>
    </Flex>
  );
}

/** 범례 한 칸. 글자는 글자 색이고, 옆의 작은 표시가 무엇을 가리키는지 알려 준다. */
function LegendKey({ swatch, label }: { swatch: CSSProperties; label: string }) {
  return (
    <Flex align="center" gap={6}>
      <span aria-hidden style={{ display: 'inline-block', flex: '0 0 auto', ...swatch }} />
      <Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Text>
    </Flex>
  );
}

/**
 * 개당 가격과 거래 수량. 위 칸은 가격(실선 중위, 점선 평균), 아래 칸은 수량 막대다.
 *
 * 둘은 단위가 달라 한 칸에 축 둘로 겹치지 않는다. 겹치면 두 축을 맞춘 방식에 따라 없던 관계가
 * 보인다. 대신 가로축을 같이 써서 위아래로 견준다. 목요일은 두 칸 모두 음영을 깐다. 정기 점검
 * 뒤 공급이 몰리는 날이라 가격과 수량이 다른 날과 다르게 움직인다.
 *
 * 최저와 최고는 그리지 않는다. 한 건만 터무니없는 값에 팔려도 세로 폭이 그쪽으로 늘어나 정작 중위의
 * 움직임이 납작해진다. 칸에 마우스를 올리면(누르면) 그 칸의 최저, 최고, 거래 수가 뜬다.
 *
 * 선은 SVG 를 가로세로로 늘려 그리고(선 굵기는 그대로), 점과 막대와 마우스 칸은 같은 좌표를
 * 백분율로 써서 HTML 로 얹는다. 차트 라이브러리를 들이지 않으려는 것이다.
 */
export function PriceHistoryChart({
  slots,
  ticks,
  ariaLabel,
}: {
  slots: readonly ChartSlot[];
  ticks: readonly ChartTick[];
  ariaLabel: string;
}) {
  const { token } = theme.useToken();
  const count = slots.length;

  const { range, midPath, avgPath, maxQty, bands } = useMemo(() => {
    const values = slots.flatMap((slot) => (slot.summary ? [slot.summary.mid, slot.summary.avg] : []));
    const valueRangeOf = valueRange(values);
    return {
      range: valueRangeOf,
      midPath: linePath(slots, (summary) => summary.mid, valueRangeOf),
      avgPath: linePath(slots, (summary) => summary.avg, valueRangeOf),
      maxQty: Math.max(0, ...slots.map((slot) => slot.summary?.qty ?? 0)),
      bands: thursdayRuns(slots.map((slot) => slot.date)),
    };
  }, [slots]);
  const middle = (range.min + range.max) / 2;
  const slotWidth = 100 / Math.max(count, 1);
  const showAllDots = count < DOT_ALL_BELOW;
  const totalHeight = PRICE_HEIGHT + PANEL_GAP + VOLUME_HEIGHT;

  const panelBorder = `1px solid ${token.colorBorderSecondary}`;
  const axisText = { fontSize: 12, lineHeight: 1 } as const;

  return (
    <Flex vertical gap={8}>
      <Flex gap={8}>
        {/* 세로축. 가격은 위, 가운데, 아래 세 값, 수량은 가장 많던 칸의 값만 적는다. */}
        <Flex vertical style={{ width: AXIS_WIDTH, flex: '0 0 auto' }} aria-hidden>
          <Flex vertical justify="space-between" align="flex-end" style={{ height: PRICE_HEIGHT }}>
            {[range.max, middle, range.min].map((value, index) => (
              <Text key={index} type="secondary" className="tnum" style={axisText}>
                {formatGold(Math.round(value))}
              </Text>
            ))}
          </Flex>
          <Flex
            vertical
            justify="space-between"
            align="flex-end"
            style={{ height: VOLUME_HEIGHT, marginTop: PANEL_GAP }}
          >
            <Text type="secondary" className="tnum" style={axisText}>
              {formatNumber(maxQty)}개
            </Text>
            <Text type="secondary" className="tnum" style={axisText}>
              0
            </Text>
          </Flex>
        </Flex>

        <div
          role="img"
          aria-label={ariaLabel}
          style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, height: totalHeight }}
        >
          {/* 목요일 음영. 두 칸을 위아래로 이어 깐다. */}
          {bands.map((band) => (
            <div
              key={band.start}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${band.start * slotWidth}%`,
                width: `${(band.end - band.start) * slotWidth}%`,
                background: token.colorFillTertiary,
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* 가격 칸 */}
          <div
            style={{
              position: 'absolute',
              insetInline: 0,
              top: 0,
              height: PRICE_HEIGHT,
              borderBlock: panelBorder,
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
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* 점. 선으로 이어지지 않는 칸도 점으로는 보이게 한다. */}
            {slots.map((slot, index) =>
              slot.summary && (showAllDots || isIsolated(slots, index)) ? (
                <span
                  key={slot.key}
                  style={{
                    position: 'absolute',
                    left: `${slotX(index, count)}%`,
                    top: `${valueY(slot.summary.mid, range)}%`,
                    width: 8,
                    height: 8,
                    marginLeft: -4,
                    marginTop: -4,
                    borderRadius: '50%',
                    background: token.colorPrimary,
                    boxShadow: `0 0 0 2px ${token.colorBgContainer}`,
                    pointerEvents: 'none',
                  }}
                />
              ) : null,
            )}
          </div>

          {/* 수량 칸. 막대는 한 바닥선에서 올라간다. */}
          <div
            style={{
              position: 'absolute',
              insetInline: 0,
              top: PRICE_HEIGHT + PANEL_GAP,
              height: VOLUME_HEIGHT,
              borderBottom: panelBorder,
            }}
          >
            {slots.map((slot, index) =>
              slot.summary && maxQty > 0 ? (
                <div
                  key={slot.key}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: `${index * slotWidth}%`,
                    width: `${slotWidth}%`,
                    height: `${Math.max((slot.summary.qty / maxQty) * 100, 3)}%`,
                    display: 'flex',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      // 이웃 막대와 2px 띄운다. 칸이 좁으면 막대가 가늘어질 뿐 붙지 않는다.
                      width: 'calc(100% - 2px)',
                      maxWidth: BAR_MAX_WIDTH,
                      height: '100%',
                      background: token.colorPrimary,
                      opacity: 0.55,
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                </div>
              ) : null,
            )}
          </div>

          {/* 칸마다 한 줄. 위아래 두 칸을 통째로 덮어, 어디에 올려도 그 칸의 값이 뜬다. */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {slots.map((slot) => (
              <Tooltip key={slot.key} title={<SlotTooltip slot={slot} />} mouseEnterDelay={0}>
                <div style={{ flex: '1 1 0', height: '100%' }} />
              </Tooltip>
            ))}
          </div>
        </div>
      </Flex>

      {/* 가로축 글자. 오른쪽 끝에 가까운 글자는 넘치지 않게 왼쪽으로 붙인다. */}
      <div style={{ position: 'relative', height: 14, marginLeft: AXIS_WIDTH + 8 }} aria-hidden>
        {ticks.map((tick) => {
          const left = tick.at === 'start' ? tick.index * slotWidth : slotX(tick.index, count);
          const shift = left > 86 ? '-100%' : tick.at === 'center' ? '-50%' : '0';
          return (
            <Text
              key={`${tick.index}-${tick.label}`}
              type="secondary"
              className="tnum"
              style={{
                position: 'absolute',
                left: `${left}%`,
                transform: `translateX(${shift})`,
                fontSize: 12,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {tick.label}
            </Text>
          );
        })}
      </div>

      <Flex gap={16} wrap style={{ marginLeft: AXIS_WIDTH + 8 }}>
        <LegendKey
          swatch={{ width: 16, height: 2, borderRadius: 1, background: token.colorPrimary }}
          label="중위 가격"
        />
        <LegendKey
          swatch={{ width: 16, height: 0, borderTop: `2px dashed ${token.colorTextTertiary}` }}
          label="평균 가격"
        />
        <LegendKey
          swatch={{
            width: 8,
            height: 12,
            borderRadius: '2px 2px 0 0',
            background: token.colorPrimary,
            opacity: 0.55,
          }}
          label="거래 수량"
        />
        <LegendKey
          swatch={{
            width: 12,
            height: 12,
            borderRadius: 2,
            background: token.colorFillTertiary,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
          label="목요일"
        />
      </Flex>
    </Flex>
  );
}
