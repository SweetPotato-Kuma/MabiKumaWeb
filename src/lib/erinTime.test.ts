import { describe, expect, it } from 'vitest';
import {
  ERIN_DAY_REAL_MS,
  erinClock,
  formatErinClock,
  formatShopReset,
  msUntilShopReset,
} from './erinTime';

/** 에린 h 시 m 분이 되는 현실 시각(ms). 기준 시각 0 에서 그 하루 안으로 들어간 현실 시간이다. */
const at = (hour: number, minute: number, erinDays = 0) =>
  ((hour * 60 + minute) * 60 * 1000) / 40 + erinDays * ERIN_DAY_REAL_MS;

describe('에린 시각', () => {
  it('현실 1초가 에린 40초다', () => {
    expect(erinClock(at(14, 16))).toMatchObject({ hour: 14, minute: 16 });
    expect(formatErinClock(erinClock(at(14, 16)))).toBe('14:16');
    // 현실 1.5초 뒤는 에린 1분 뒤다.
    expect(formatErinClock(erinClock(at(14, 16) + 1500))).toBe('14:17');
  });

  it('에린 하루는 현실 36분이라 36분 뒤에는 같은 시각이다', () => {
    expect(formatErinClock(erinClock(at(9, 5, 7)))).toBe('09:05');
    expect(formatErinClock(erinClock(at(9, 5, 7) + ERIN_DAY_REAL_MS))).toBe('09:05');
  });

  it('자정은 00:00 이고 그 전 1.5초는 23:59 다', () => {
    expect(formatErinClock(erinClock(at(0, 0, 3)))).toBe('00:00');
    expect(formatErinClock(erinClock(at(0, 0, 3) - 1500))).toBe('23:59');
  });

  it('낮은 06:00 부터 18:00 전까지다', () => {
    expect(erinClock(at(5, 59)).day).toBe(false);
    expect(erinClock(at(6, 0)).day).toBe(true);
    expect(erinClock(at(17, 59)).day).toBe(true);
    expect(erinClock(at(18, 0)).day).toBe(false);
    expect(erinClock(at(0, 0)).day).toBe(false);
  });

  it('오래 지나도 오차가 쌓이지 않는다', () => {
    // 일주일 뒤에도 같은 계산이 같은 시각을 돌려준다. 타이머를 세지 않고 지금 시각에서 다시 센다.
    const week = 7 * 24 * 60 * 60 * 1000;
    const base = Date.UTC(2026, 9, 1, 0, 0, 0);
    const a = erinClock(base);
    const b = erinClock(base + Math.round(week / ERIN_DAY_REAL_MS) * ERIN_DAY_REAL_MS);

    expect(b).toEqual(a);
  });
});

describe('상점 교체', () => {
  it('에린 자정까지 남은 현실 시간이다', () => {
    // 에린 14:47 에서 자정까지 9시간 13분 = 553 에린 분 = 현실 829.5초.
    expect(msUntilShopReset(at(14, 47))).toBeCloseTo(829_500, -1);
  });

  it('자정 바로 전에는 거의 0, 자정에는 하루가 온전히 남는다', () => {
    expect(msUntilShopReset(at(0, 0, 4) - 1)).toBe(1);
    expect(msUntilShopReset(at(0, 0, 4))).toBe(ERIN_DAY_REAL_MS);
  });

  it('남은 시간을 분과 초로 적는다', () => {
    expect(formatShopReset(12 * 60_000 + 30_000)).toBe('12분 30초 남음');
    expect(formatShopReset(45_000)).toBe('45초 남음');
    expect(formatShopReset(60_000)).toBe('1분 0초 남음');
    expect(formatShopReset(0)).toBe('0초 남음');
    // 남은 것이 1초 미만이어도 0초로 떨어뜨리지 않고 올려 센다.
    expect(formatShopReset(400)).toBe('1초 남음');
  });
});
