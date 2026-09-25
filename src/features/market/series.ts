import type { DailySummary } from './api';

/**
 * 날짜별 그래프의 계산. 그리는 쪽(PriceHistoryChart)과 떼어 두어 숫자만 따로 시험한다.
 *
 * 좌표는 가로세로 0~100 이다. SVG 는 viewBox 를 그대로 늘려 쓰고, 점과 마우스 칸은 같은 값을
 * 백분율로 써서 HTML 로 얹는다. 그래서 화면 폭이 바뀌어도 선과 점이 어긋나지 않는다.
 */

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

export interface Slot {
  date: string;
  summary: DailySummary | null;
}

/** 한국 시각 기준 오늘 날짜. 워커도 한국 시각으로 날을 가른다. */
export function kstDate(now: number, daysAgo = 0): string {
  return new Date(now + KST_OFFSET_MS - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

/** 오늘을 끝으로 days 칸. 거래가 없던 날은 summary 가 null 이다. */
export function buildSlots(daily: readonly DailySummary[], days: number, now: number): Slot[] {
  const byDate = new Map(daily.map((row) => [row.date, row]));
  return Array.from({ length: days }, (_, index) => {
    const date = kstDate(now, days - 1 - index);
    return { date, summary: byDate.get(date) ?? null };
  });
}

/** 세로 폭. 위아래로 조금 띄운다. 값이 하나뿐이면 그 값을 가운데 둔다. */
export function valueRange(values: readonly number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = hi > lo ? (hi - lo) * 0.12 : Math.max(Math.abs(hi) * 0.1, 1);
  return { min: Math.max(0, lo - pad), max: hi + pad };
}

/** 칸의 가로 가운데(0~100). */
export function slotX(index: number, count: number): number {
  return ((index + 0.5) / count) * 100;
}

/** 값의 세로 자리(0~100, 위가 0). */
export function valueY(value: number, range: { min: number; max: number }): number {
  const span = range.max - range.min || 1;
  return 100 - ((value - range.min) / span) * 100;
}

/**
 * 선 경로. 거래가 없던 날에서 끊는다. 이어 그리면 없던 거래가 있었던 것처럼 보인다.
 */
export function linePath(
  slots: readonly Slot[],
  pick: (summary: DailySummary) => number,
  range: { min: number; max: number },
): string {
  const parts: string[] = [];
  let drawing = false;
  slots.forEach((slot, index) => {
    if (!slot.summary) {
      drawing = false;
      return;
    }
    const x = slotX(index, slots.length).toFixed(2);
    const y = valueY(pick(slot.summary), range).toFixed(2);
    parts.push(`${drawing ? 'L' : 'M'}${x} ${y}`);
    drawing = true;
  });
  return parts.join(' ');
}
