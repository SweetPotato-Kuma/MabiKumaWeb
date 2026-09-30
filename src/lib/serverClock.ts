import { useEffect, useSyncExternalStore } from 'react';
import { getProxyUrl } from '@/lib/settings';

/**
 * 서버 시계와 이 PC 시계의 차이. 방문자 PC 시계가 틀려도 에린 시각이 맞게 보이도록 조회 서버에 한 번 묻는다.
 *
 * 요청을 보낸 때와 답을 받은 때의 가운데를 서버가 답한 순간으로 본다. 오가는 시간이 같다고 가정하는 것이라
 * 오차는 왕복 시간의 절반 안이다. 왕복이 너무 길면(망이 막혔다) 믿지 않는다. 조회 서버가 없거나 답이 없으면
 * 차이를 0 으로 두고 PC 시계를 그대로 쓴다.
 */

/** 이보다 왕복이 길면 그 측정은 버린다. 에린 1분이 현실 1.5초라 그 안에서 재야 뜻이 있다. */
const MAX_ROUND_TRIP_MS = 1500;
/** 다시 재는 간격. 시계가 흘러가 어긋나거나 PC 가 잠들었다 깬 것을 바로잡는다. */
const RESYNC_MS = 30 * 60 * 1000;

let offsetMs = 0;
const listeners = new Set<() => void>();

/** 서버 기준 지금(ms). 차이를 잰 적이 없으면 PC 시계다. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** 측정 하나로 차이를 갱신한다. 왕복이 길면 버리고 false 를 돌려준다. */
export function applyServerTime(serverMs: number, sentAt: number, receivedAt: number): boolean {
  const roundTrip = receivedAt - sentAt;
  if (!Number.isFinite(serverMs) || roundTrip < 0 || roundTrip > MAX_ROUND_TRIP_MS) return false;
  offsetMs = serverMs - (sentAt + receivedAt) / 2;
  for (const listener of listeners) listener();
  return true;
}

/** 시험에서 차이를 0 으로 돌린다. */
export function resetServerClockForTest(): void {
  offsetMs = 0;
}

/** 조회 서버에 지금 시각을 묻는다. 실패하면 조용히 넘어간다. 시계는 PC 시계로 계속 돈다. */
export async function syncServerClock(signal?: AbortSignal): Promise<boolean> {
  const base = getProxyUrl();
  if (!base) return false;
  try {
    const sentAt = Date.now();
    const response = await fetch(`${base}/time`, { signal, cache: 'no-store' });
    const receivedAt = Date.now();
    if (!response.ok) return false;
    const body = (await response.json()) as { now?: unknown };
    return typeof body.now === 'number' && applyServerTime(body.now, sentAt, receivedAt);
  } catch {
    return false;
  }
}

/** 화면이 열려 있는 동안 서버 시계와의 차이를 재 둔다. 처음 한 번, 그 뒤 30분마다. */
export function useServerClockSync(): void {
  useEffect(() => {
    const controller = new AbortController();
    void syncServerClock(controller.signal);
    const timer = window.setInterval(() => void syncServerClock(controller.signal), RESYNC_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);
}

/** 다시 그리는 간격. 에린 1분이 현실 1.5초라 1초 간격이면 분이 바뀐 것을 최대 1초 늦게 보인다. 절반으로 줄여 둔다. */
const TICK_MS = 500;

const tickListeners = new Set<() => void>();
let ticker: number | undefined;

function subscribeTick(listener: () => void): () => void {
  tickListeners.add(listener);
  // 한 곳에서 깨운다. 쓰는 곳이 여럿이어도 타이머는 하나다.
  if (ticker === undefined) {
    ticker = window.setInterval(() => {
      for (const each of tickListeners) each();
    }, TICK_MS);
  }
  const offsetListener = listener;
  listeners.add(offsetListener);
  return () => {
    tickListeners.delete(listener);
    listeners.delete(offsetListener);
    if (tickListeners.size === 0 && ticker !== undefined) {
      window.clearInterval(ticker);
      ticker = undefined;
    }
  };
}

/**
 * 서버 기준 지금(ms). 0.5초마다 다시 그려지지만 값은 그릴 때마다 지금 시각에서 새로 읽는다. 틱을 세어 더하지
 * 않으므로 탭을 오래 열어 두거나 잠들었다 깨도 오차가 쌓이지 않는다.
 */
export function useServerNow(): number {
  // 틱마다 다른 값(초)을 돌려주어 다시 그리게 하고, 실제로 쓰는 시각은 그 아래에서 새로 읽는다.
  useSyncExternalStore(
    subscribeTick,
    () => Math.floor(serverNow() / TICK_MS),
    () => Math.floor(Date.now() / TICK_MS),
  );
  return serverNow();
}
