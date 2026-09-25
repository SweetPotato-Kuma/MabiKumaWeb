import { describe, expect, it } from 'vitest';
import type { DailySummary, HourlySummary } from './api';
import {
  buildHourSlots,
  buildSlots,
  isIsolated,
  isThursday,
  kstDate,
  linePath,
  shortDateLabel,
  thursdayRuns,
  valueRange,
  valueY,
} from './series';

/** 2026-09-25 00:30 KST. UTC 로는 아직 24일이다. */
const NOW = Date.parse('2026-09-24T15:30:00.000Z');

const day = (date: string, mid: number): DailySummary => ({
  date,
  n: 3,
  qty: 3,
  lo: mid - 10,
  hi: mid + 10,
  mid,
  avg: mid,
});

describe('날짜 칸', () => {
  it('오늘은 한국 시각으로 센다', () => {
    expect(kstDate(NOW)).toBe('2026-09-25');
    expect(kstDate(NOW, 1)).toBe('2026-09-24');
  });

  it('오늘을 끝으로 날 수만큼 칸을 만들고 거래 없던 날은 비워 둔다', () => {
    const slots = buildSlots([day('2026-09-23', 100), day('2026-09-25', 120)], 4, NOW);
    expect(slots.map((slot) => [slot.date, slot.summary?.mid ?? null])).toEqual([
      ['2026-09-22', null],
      ['2026-09-23', 100],
      ['2026-09-24', null],
      ['2026-09-25', 120],
    ]);
  });
});

describe('선', () => {
  it('거래가 없던 날에서 선을 끊는다', () => {
    const slots = buildSlots(
      [day('2026-09-22', 100), day('2026-09-23', 200), day('2026-09-25', 150)],
      4,
      NOW,
    );
    const path = linePath(slots, (summary) => summary.mid, { min: 100, max: 200 });
    expect(path).toBe('M12.50 100.00 L37.50 0.00 M87.50 50.00');
  });

  it('값이 하나뿐이어도 가운데에 놓는다', () => {
    const range = valueRange([500]);
    expect(valueY(500, range)).toBeCloseTo(50);
  });

  it('세로 폭은 0 아래로 내려가지 않는다', () => {
    expect(valueRange([1, 100]).min).toBe(0);
  });
});

const hour = (date: string, hourOfDay: number, qty: number): HourlySummary => ({
  date,
  hour: hourOfDay,
  n: 1,
  qty,
  lo: 100,
  hi: 100,
  mid: 100,
  avg: 100,
});

describe('시간 칸', () => {
  it('지금 시간을 끝으로 한국 시각의 날짜와 시를 붙인다', () => {
    // NOW 는 KST 09-25 00:30. 세 칸이면 24일 22시, 23시, 25일 0시다.
    const slots = buildHourSlots([hour('2026-09-24', 23, 5)], 3, NOW);
    expect(slots.map((slot) => [slot.date, slot.hour, slot.summary?.qty ?? null])).toEqual([
      ['2026-09-24', 22, null],
      ['2026-09-24', 23, 5],
      ['2026-09-25', 0, null],
    ]);
  });

  it('앞뒤가 빈 점만 따로 찍을 점으로 고른다', () => {
    const slots = [{ summary: 1 }, { summary: null }, { summary: 1 }, { summary: 1 }];
    expect([0, 1, 2, 3].map((index) => isIsolated(slots, index))).toEqual([true, false, false, false]);
  });
});

describe('목요일', () => {
  it('날짜만으로 목요일을 가린다', () => {
    expect(isThursday('2026-09-24')).toBe(true);
    expect(isThursday('2026-09-25')).toBe(false);
    expect(shortDateLabel('2026-09-24')).toBe('09-24 (목)');
  });

  it('이어진 목요일 칸을 한 덩어리로 묶는다', () => {
    const dates = ['2026-09-23', '2026-09-24', '2026-09-24', '2026-09-25', '2026-10-01'];
    expect(thursdayRuns(dates)).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 5 },
    ]);
  });
});
