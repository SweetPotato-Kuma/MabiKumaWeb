/**
 * 독립시행 계산. 시뮬레이터들이 같이 쓴다.
 *
 * 세공이나 유물 복원처럼 매번 앞 결과와 상관없이 같은 확률 p 로 원하는 것이 나오면, n 번 안에 한 번
 * 이상 나올 확률은 1 - (1 - p)^n 이고 n 번 동안 나오는 횟수의 기댓값은 n * p 다. "평균 1/p 번에 한 번"
 * 이라는 말은 1/p 번 하면 나온다는 뜻이 아니다. 1/p 번 해도 한 번 이상 나올 확률은 63% 남짓이다.
 *
 * p 가 아주 작으면(0.001% 같은) 1 - p 를 거듭제곱하는 동안 자릿수가 날아간다. log1p, expm1 로 센다.
 */

/** 화면에 늘 보여 주는 목표 확률. 반반, 거의, 사실상 확실. */
export const TRIAL_GOALS = [0.5, 0.9, 0.99] as const;

/** 한 번에 p 인 일이 n 번 안에 한 번 이상 일어날 확률. */
export function atLeastOnce(p: number, n: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return 1;
  return -Math.expm1(n * Math.log1p(-p));
}

/** n 번 동안 일어나는 횟수의 기댓값. */
export function expectedHits(p: number, n: number): number {
  return Math.max(0, n) * Math.max(0, p);
}

/** 한 번 이상 일어날 확률이 goal 이상이 되려면 해야 하는 가장 적은 횟수. 일어날 수 없으면 Infinity. */
export function trialsFor(p: number, goal: number): number {
  if (p <= 0) return Infinity;
  if (p >= 1 || goal <= 0) return 1;
  // 부동소수 오차로 경계에서 한 번 모자라게 나오지 않게 끝에 조금 여유를 둔다.
  return Math.max(1, Math.ceil(Math.log1p(-goal) / Math.log1p(-p) - 1e-9));
}

/** 확률을 사람이 읽는 퍼센트로. 아주 작은 값도 0% 로 뭉개지 않는다. */
export function formatChance(chance: number): string {
  const percent = chance * 100;
  if (percent >= 99.995 && chance < 1) return '99.99% 이상';
  if (percent >= 1) return `${percent.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`;
  return `${percent.toLocaleString('ko-KR', { maximumSignificantDigits: 3 })}%`;
}

/** 기댓값을 읽기 좋게. 1 이상은 소수 둘째 자리, 그 아래는 유효 숫자 세 자리. */
export function formatExpected(value: number): string {
  if (value >= 1) return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return value.toLocaleString('ko-KR', { maximumSignificantDigits: 3 });
}
