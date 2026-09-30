import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyServerTime,
  resetServerClockForTest,
  serverNow,
  syncServerClock,
} from './serverClock';

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProxyUrl: () => 'https://w.example',
}));

beforeEach(() => resetServerClockForTest());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetServerClockForTest();
});

describe('서버 시계와의 차이', () => {
  it('요청과 응답의 가운데를 서버가 답한 순간으로 본다', () => {
    // PC 시계는 10:00:00.000 에 보내 10:00:00.200 에 받았다. 서버는 10:00:05.100 이라고 답했다.
    // 가운데(10:00:00.100)에서 서버가 5초 앞서 있다.
    const sent = Date.UTC(2026, 9, 1, 10, 0, 0, 0);
    expect(applyServerTime(sent + 5_100, sent, sent + 200)).toBe(true);

    vi.useFakeTimers();
    vi.setSystemTime(sent + 200);
    expect(serverNow()).toBe(sent + 200 + 5_000);
  });

  it('왕복이 너무 길면 믿지 않는다', () => {
    const sent = Date.UTC(2026, 9, 1, 10, 0, 0, 0);

    expect(applyServerTime(sent + 60_000, sent, sent + 4_000)).toBe(false);
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(50);
  });

  it('숫자가 아닌 답이나 거꾸로 간 시각은 버린다', () => {
    expect(applyServerTime(Number.NaN, 1000, 1100)).toBe(false);
    expect(applyServerTime(5000, 1100, 1000)).toBe(false);
  });

  it('조회 서버에 시각을 물어 차이를 갱신한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 1, 10, 0, 0, 0));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        vi.advanceTimersByTime(100);
        return new Response(JSON.stringify({ now: Date.UTC(2026, 9, 1, 10, 0, 0, 0) + 3_050 }));
      }),
    );

    expect(await syncServerClock()).toBe(true);
    // 서버는 PC 보다 3초 앞서 있다.
    expect(serverNow() - Date.now()).toBe(3_000);
  });

  it('응답이 실패해도 던지지 않고 PC 시계를 그대로 쓴다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    await expect(syncServerClock()).resolves.toBe(false);
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(50);
  });

  it('상태가 좋지 않은 응답은 버린다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));

    await expect(syncServerClock()).resolves.toBe(false);
  });
});
