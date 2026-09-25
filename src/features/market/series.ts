import type { DailySummary, HourlySummary, PriceSummary } from './api';

/**
 * 날짜별 그래프의 계산. 그리는 쪽(PriceHistoryChart)과 떼어 두어 숫자만 따로 시험한다.
 *
 * 좌표는 가로세로 0~100 이다. SVG 는 viewBox 를 그대로 늘려 쓰고, 점과 마우스 칸은 같은 값을
 * 백분율로 써서 HTML 로 얹는다. 그래서 화면 폭이 바뀌어도 선과 점이 어긋나지 않는다.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const KST_OFFSET_MS = 9 * HOUR_MS;

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

export interface HourSlot {
  date: string;
  /** 0~23, 한국 시각 */
  hour: number;
  summary: HourlySummary | null;
}

/** 지금 시각이 든 시간을 끝으로 hours 칸. 거래가 없던 시간은 summary 가 null 이다. */
export function buildHourSlots(
  hourly: readonly HourlySummary[],
  hours: number,
  now: number,
): HourSlot[] {
  const byKey = new Map(hourly.map((row) => [`${row.date} ${row.hour}`, row]));
  return Array.from({ length: hours }, (_, index) => {
    const at = new Date(now + KST_OFFSET_MS - (hours - 1 - index) * HOUR_MS);
    const date = at.toISOString().slice(0, 10);
    const hour = at.getUTCHours();
    return { date, hour, summary: byKey.get(`${date} ${hour}`) ?? null };
  });
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** "2026-09-25" 의 요일 번호. 0 이 일요일이다. 날짜만 보므로 시간대와 상관없다. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * 목요일. 마비노기는 목요일 정기 점검 뒤에 보상과 재료가 풀려 경매장 공급이 가장 많다.
 * 그래프가 목요일을 음영으로 따로 보여 주는 이유다.
 */
export function isThursday(date: string): boolean {
  return weekdayOf(date) === 4;
}

/** "09-25 (목)" */
export function shortDateLabel(date: string): string {
  return `${date.slice(5)} (${WEEKDAY_LABELS[weekdayOf(date)]})`;
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
export function linePath<S extends PriceSummary>(
  slots: readonly { summary: S | null }[],
  pick: (summary: S) => number,
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

/**
 * 앞뒤 칸이 모두 비어 선으로는 보이지 않는 점. 칸이 촘촘한 시간별 그래프는 이런 점만 찍는다.
 * 모든 칸에 점을 찍으면 점끼리 겹쳐 선이 묻힌다.
 */
export function isIsolated(slots: readonly { summary: unknown }[], index: number): boolean {
  return Boolean(slots[index]?.summary) && !slots[index - 1]?.summary && !slots[index + 1]?.summary;
}

/** 이어진 목요일 칸을 한 덩어리로. 음영을 칸마다 따로 그리면 칸 사이에 틈이 보인다. */
export function thursdayRuns(dates: readonly string[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  dates.forEach((date, index) => {
    if (!isThursday(date)) return;
    const last = runs[runs.length - 1];
    if (last && last.end === index) last.end = index + 1;
    else runs.push({ start: index, end: index + 1 });
  });
  return runs;
}
