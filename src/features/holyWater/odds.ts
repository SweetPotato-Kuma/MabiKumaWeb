import { trialsFor } from '@/features/simulator/trials';

/**
 * 한 번 발라 원하는 수치가 나올 확률 chance 로 센 횟수. 세 가지를 함께 보인다.
 *
 * 평균만 보면 운이 나쁜 경우를 알 수 없다. "평균 22번에 한 번" 이라도 22번 해서 한 번 이상 나올 확률은
 * 63% 남짓이다(trials.ts). 그래서 "이 안에 나올 확률이 절반, 9할" 인 횟수도 함께 말한다.
 */
export interface OddsCounts {
  /** 평균 몇 번에 한 번(1/chance 를 정수로). */
  mean: number;
  /** 이 횟수 안에 한 번 이상 나올 확률이 50% 를 넘는 가장 적은 횟수. */
  half: number;
  /** 같은 확률이 90% 를 넘는 가장 적은 횟수. */
  ninety: number;
}

/** 나올 수 없는 수치(확률 0)는 횟수를 세지 못해 null 이다. */
export function oddsCounts(chance: number): OddsCounts | null {
  if (!(chance > 0)) return null;
  return {
    mean: Math.max(1, Math.round(1 / chance)),
    half: trialsFor(chance, 0.5),
    ninety: trialsFor(chance, 0.9),
  };
}

/** 횟수만큼 바르는 데 드는 골드. 성수 가격을 모르면 null. */
export function costOfTrials(trials: number, price: number | null): number | null {
  return price === null ? null : trials * price;
}
