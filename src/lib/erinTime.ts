/**
 * 에린 시각. 에린의 하루는 현실 36분이고 에린 1분은 현실 1.5초, 곧 현실 1초가 에린 40초다.
 *
 * 에린 시각은 현실 시각에서 곧바로 계산한다(누적하지 않는다). 타이머를 몇 번 돌렸는지를 세는 방식은 탭을 오래
 * 열어 두거나 잠들었다 깨면 오차가 쌓이지만, 지금 시각에서 매번 다시 계산하면 오차가 쌓일 곳이 없다.
 *
 * 에린 자정은 현실 시각이 36분(2,160,000ms)의 배수일 때다. 이 기준을 게임 안 시계와 맞춰 본 적은 아직
 * 없다. 어긋나 있으면 ERIN_OFFSET_MS 하나만 고친다(에린 시각이 현실 몇 ms 만큼 늦거나 이른지).
 * NPC 상점은 에린 자정에 바뀐다.
 */

/** 에린 하루를 이루는 현실 시간(ms). */
export const ERIN_DAY_REAL_MS = 36 * 60 * 1000;

const ERIN_DAY_MS = 24 * 60 * 60 * 1000;
/** 현실 1ms 가 에린 몇 ms 인지. */
const SPEED = ERIN_DAY_MS / ERIN_DAY_REAL_MS;

/** 게임 안 시계와 대조해 보정하는 값(현실 ms). 지금은 대조 전이라 0 이다. */
export const ERIN_OFFSET_MS = 0;

export interface ErinClock {
  hour: number;
  minute: number;
  /** 낮(06:00~18:00)인지. 아니면 밤이다. */
  day: boolean;
}

/** 지금(ms) 에린 시각. */
export function erinClock(now: number): ErinClock {
  const erinMs = (((now + ERIN_OFFSET_MS) * SPEED) % ERIN_DAY_MS + ERIN_DAY_MS) % ERIN_DAY_MS;
  const minutes = Math.floor(erinMs / 60_000);
  const hour = Math.floor(minutes / 60);
  return { hour, minute: minutes % 60, day: hour >= 6 && hour < 18 };
}

/** "14:16". */
export function formatErinClock(clock: ErinClock): string {
  return `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
}

/** 다음 에린 자정(NPC 상점이 바뀌는 때)까지 남은 현실 시간(ms). 자정 바로 그때는 하루가 온전히 남는다. */
export function msUntilShopReset(now: number): number {
  const into = (((now + ERIN_OFFSET_MS) % ERIN_DAY_REAL_MS) + ERIN_DAY_REAL_MS) % ERIN_DAY_REAL_MS;
  return ERIN_DAY_REAL_MS - into;
}

/** "12분 30초 남음". 1분 미만이면 "45초 남음". */
export function formatShopReset(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}분 ${rest}초 남음` : `${rest}초 남음`;
}
