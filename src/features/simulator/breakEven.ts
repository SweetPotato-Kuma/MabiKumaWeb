/**
 * n 번 해서 얻은 것의 값 합이 목표 이상일 확률. 유물 복원의 "n 번 복원해 본전 이상 얻을 확률" 이다.
 *
 * 한 번에 나오는 값은 values 가운데 하나가 똑같은 확률로 나온다고 본다. 합의 분포는 식으로 딱
 * 떨어지지 않아, 횟수가 적으면 고정 씨앗 난수로 여러 번 뽑아 보고(같은 입력이면 늘 같은 답이
 * 나온다), 많으면 중심극한정리로 정규분포에 기대어 센다. 뽑아 보는 셈은 소수 첫째 자리까지만 믿는다.
 */

/** 이보다 많이 하면 정규 근사로 센다. 뽑아 보는 셈은 횟수에 비례해 느려진다. */
const SIMULATE_UP_TO = 2000;
/** 한 번 셈에 쓰는 난수 수의 한도. 이만큼이면 화면이 멈추지 않는다. */
const DRAW_BUDGET = 4_000_000;

/** 고정 씨앗 난수(mulberry32). 같은 씨앗이면 같은 수열이다. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 표준정규분포의 누적 확률. Abramowitz-Stegun 7.1.26 근사, 오차 1.5e-7. */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * values 에서 고르게 n 번 뽑아 더한 합이 n x threshold 이상일 확률. n 이 1 이면 정확히 센다.
 * values 가 비었으면 null 이다.
 */
export function sumAtLeastChance(
  values: readonly number[],
  n: number,
  threshold: number,
): number | null {
  if (values.length === 0 || n < 1) return null;
  const target = n * threshold;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }
  if (min * n >= target) return 1;
  if (max * n < target) return 0;
  if (n === 1) return values.filter((value) => value >= threshold).length / values.length;

  if (n > SIMULATE_UP_TO) {
    const mean = sum / values.length;
    const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
    if (variance === 0) return mean >= threshold ? 1 : 0;
    return 1 - normalCdf((target - n * mean) / Math.sqrt(n * variance));
  }

  const samples = Math.max(2000, Math.min(20000, Math.floor(DRAW_BUDGET / n)));
  const random = seeded(0x5eed + n);
  let hits = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    let total = 0;
    for (let draw = 0; draw < n; draw += 1) {
      total += values[Math.floor(random() * values.length)];
    }
    if (total >= target) hits += 1;
  }
  return hits / samples;
}

/** 뽑아 보고 센 확률을 믿을 만한 자리까지만 적는다. 소수 첫째 자리, 끝은 "미만" 과 "이상" 으로. */
export function formatEstimatedChance(chance: number): string {
  if (chance <= 0) return '0%';
  if (chance >= 1) return '100%';
  if (chance < 0.001) return '0.1% 미만';
  if (chance > 0.999) return '99.9% 이상';
  return `${(chance * 100).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
