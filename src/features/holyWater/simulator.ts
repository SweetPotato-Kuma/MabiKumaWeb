import { useCallback, useState } from 'react';

/**
 * 무리아스의 성수 시뮬레이터.
 *
 * 성수 효과는 인챈트처럼 붙는다. 효과마다 단계(A, B, ...)가 나뉜 인챈트 스크롤이 있고, 성수를 바르면
 * 102장 가운데 한 장이 똑같은 확률로 골라진 뒤 그 스크롤의 폭 안에서 수치가 고르게 정해진다. 스크롤마다
 * 가중치가 따로 있지 않다(게임 클라이언트 데이터 기준).
 */

export interface HolyWaterEffect {
  /** 효과 이름. "최대 대미지" */
  name: string;
  /** 단계마다 [최소, 최대]. A 부터 차례로. */
  ranges: readonly (readonly [number, number])[];
  /** 단계 글자(A, B, ...)가 붙는지. 세트 효과는 스크롤이 한 장이고 글자가 없다. */
  graded: boolean;
}

/** 폭이 같은 단계를 count 개 잇는다. 1~step, step+1~2step, ... */
const steps = (name: string, step: number, count: number): HolyWaterEffect => ({
  name,
  ranges: Array.from({ length: count }, (_, index) => [index * step + 1, (index + 1) * step]),
  graded: true,
});

const setEffect = (skill: string): HolyWaterEffect => ({
  name: `${skill} 세트 효과`,
  ranges: [[1, 1]],
  graded: false,
});

/** 성수로 붙을 수 있는 효과. 스크롤은 모두 102장이다. */
export const HOLY_WATER_EFFECTS: readonly HolyWaterEffect[] = [
  steps('최대 대미지', 6, 5),
  steps('마법 공격력', 6, 5),
  steps('4대 속성 연금 대미지', 10, 5),
  steps('마리오네트 최대 대미지', 10, 5),
  steps('힐링 효과', 5, 2),
  steps('크리티컬', 5, 1),
  steps('크리티컬 대미지', 2, 2),
  steps('생명력', 50, 6),
  steps('마나', 50, 6),
  steps('스태미나', 50, 6),
  steps('체력', 10, 3),
  steps('지력', 10, 3),
  steps('솜씨', 10, 3),
  steps('의지', 10, 3),
  steps('행운', 10, 3),
  steps('방어', 20, 5),
  steps('마법 방어', 20, 5),
  steps('보호', 3, 1),
  steps('마법 보호', 3, 1),
  steps('생명력 자연 회복량', 100, 5),
  steps('마나 자연 회복량', 100, 5),
  steps('스태미나 자연 회복량', 100, 5),
  steps('피어싱 저항', 1, 1),
  steps('음악 버프 효과', 1, 1),
  setEffect('아이스볼트'),
  setEffect('파이어볼트'),
  setEffect('플레이머'),
  setEffect('워터캐논'),
  setEffect('라이프 드레인'),
  setEffect('공격 속도'),
  setEffect('매그넘 샷 강화'),
  setEffect('배쉬 강화'),
  setEffect('서포트 샷 강화'),
  setEffect('충격 흡수 강화'),
  setEffect('스매시 강화'),
  setEffect('윈드밀 강화'),
  setEffect('돌진 강화'),
  setEffect('힐링 강화'),
  setEffect('다운어택 강화'),
];

export interface HolyWaterScroll {
  /** HOLY_WATER_EFFECTS 의 순번. */
  effect: number;
  /** "E". 세트 효과는 null. */
  grade: string | null;
  min: number;
  max: number;
}

const GRADES = 'ABCDEF';

/** 스크롤 한 장 한 장. 성수는 이 가운데 하나를 고르게 고른다. */
export const HOLY_WATER_SCROLLS: readonly HolyWaterScroll[] = HOLY_WATER_EFFECTS.flatMap(
  (effect, index) =>
    effect.ranges.map(([min, max], step) => ({
      effect: index,
      grade: effect.graded ? GRADES[step] : null,
      min,
      max,
    })),
);

/** 그 효과가 가질 수 있는 가장 큰 수치. */
export const effectMax = (effect: HolyWaterEffect) => effect.ranges[effect.ranges.length - 1][1];

/**
 * "최대 대미지 E". 스크롤을 가려내는 식별용 이름이다. 단계와 폭은 확률을 세는 데만 쓰고 화면에는
 * 효과 이름과 수치만 보인다.
 */
export const scrollLabel = (scroll: HolyWaterScroll) =>
  `${HOLY_WATER_EFFECTS[scroll.effect].name}${scroll.grade ? ` ${scroll.grade}` : ''}`;

/**
 * 연출과 표시를 가르는 등급. 수치가 그 효과 최대치의 몇 % 이상인지다. 효과의 단계들이 1부터 최대치까지
 * 빈틈없이 같은 폭으로 이어져 있어, 이 비율이 곧 같은 효과 안에서 몇 백분위에 있는지와 같다.
 */
export const HOLY_WATER_TIERS = [50, 90, 95, 99] as const;
export type HolyWaterTier = (typeof HOLY_WATER_TIERS)[number];

/** 그 효과에서 그 등급이 되는 가장 낮은 수치. */
export const tierFloor = (effect: HolyWaterEffect, tier: HolyWaterTier) =>
  Math.ceil((effectMax(effect) * tier) / 100);

/**
 * 수치의 등급. 수치가 하나뿐인 효과(세트 효과, 음악 버프 효과 같은)는 늘 최대치라 등급을 매기지 않는다.
 * 매기면 여섯 번에 한 번꼴로 가장 높은 연출이 돈다.
 */
export function tierOf(effect: HolyWaterEffect, value: number): HolyWaterTier | null {
  if (effectMax(effect) <= 1) return null;
  for (let index = HOLY_WATER_TIERS.length - 1; index >= 0; index -= 1) {
    const tier = HOLY_WATER_TIERS[index];
    if (value >= tierFloor(effect, tier)) return tier;
  }
  return null;
}

/** 한 번 발라 그 효과가 minValue 이상으로 붙을 확률. 스크롤마다 1/102 에 폭 가운데 minValue 이상인 몫을 곱해 더한다. */
export function effectChance(effect: number, minValue: number): number {
  let chance = 0;
  for (const scroll of HOLY_WATER_SCROLLS) {
    if (scroll.effect !== effect) continue;
    const hits = scroll.max - Math.max(scroll.min, minValue) + 1;
    if (hits > 0) chance += hits / (scroll.max - scroll.min + 1);
  }
  return chance / HOLY_WATER_SCROLLS.length;
}

/** 그 효과가 붙었을 때 수치가 value 이상일 몫. 같은 효과 안에서 상위 몇 % 인지다. */
export const topShare = (effect: number, value: number) =>
  effectChance(effect, value) / effectChance(effect, 1);

/** 한 번 발라 그 등급 이상이 나올 확률. */
export function tierChance(tier: HolyWaterTier): number {
  return HOLY_WATER_EFFECTS.reduce(
    (sum, effect, index) =>
      effectMax(effect) <= 1 ? sum : sum + effectChance(index, tierFloor(effect, tier)),
    0,
  );
}

export interface HolyWaterDraw {
  /** 몇 번째로 바른 것인지. 1부터. 표의 키로도 쓴다. */
  no: number;
  /** HOLY_WATER_SCROLLS 의 순번. */
  scroll: number;
  value: number;
}

/** [0, 1) 난수. 테스트에서 바꿔 끼운다. */
export type RandomSource = () => number;

const pick = (length: number, random: RandomSource) =>
  Math.min(length - 1, Math.floor(random() * length));

/** 한 번 바른다. 스크롤을 고르게 고르고, 그 스크롤의 폭 안에서 수치를 고르게 고른다. */
export function drawHolyWater(no: number, random: RandomSource = Math.random): HolyWaterDraw {
  const scroll = pick(HOLY_WATER_SCROLLS.length, random);
  const { min, max } = HOLY_WATER_SCROLLS[scroll];
  return { no, scroll, value: min + pick(max - min + 1, random) };
}

export interface HolyWaterSimulator {
  /** 지금까지 나온 것. 먼저 나온 것이 앞이다. */
  draws: HolyWaterDraw[];
  /** 마지막으로 누른 단추가 몇 번 발랐는지. 끝에서 이만큼이 "방금 나온 것" 이다. */
  lastBatch: number;
  draw: (times: number) => void;
  reset: () => void;
}

/** 바른 기록. 새로 고치거나 화면을 떠나면 처음부터다. */
export function useHolyWaterSimulator(random?: RandomSource): HolyWaterSimulator {
  const [state, setState] = useState<{ draws: HolyWaterDraw[]; lastBatch: number }>({
    draws: [],
    lastBatch: 0,
  });
  const draw = useCallback(
    (times: number) =>
      setState((prev) => {
        const added = Array.from({ length: times }, (_, index) =>
          // 난수는 뽑을 때 찾는다. 처음 그릴 때의 Math.random 을 붙잡아 두지 않는다.
          drawHolyWater(prev.draws.length + index + 1, random ?? Math.random),
        );
        return { draws: [...prev.draws, ...added], lastBatch: times };
      }),
    [random],
  );
  const reset = useCallback(() => setState({ draws: [], lastBatch: 0 }), []);
  return { ...state, draw, reset };
}
