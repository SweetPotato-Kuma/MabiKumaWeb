import { describe, expect, it } from 'vitest';
import type { DailySummary } from './api';
import { buildSlots, kstDate, linePath, valueRange, valueY } from './series';

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
