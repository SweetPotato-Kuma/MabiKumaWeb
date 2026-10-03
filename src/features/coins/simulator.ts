import { useCallback, useState } from 'react';

/**
 * 주화 시뮬레이터.
 *
 * 던전에서 모은 재료로 토템 주화를 만들면 그 토템의 옵션 세 줄이 모두 붙고, 줄마다 최소부터 최대까지
 * 정해진 간격의 수치 가운데 하나가 고르게 정해진다. 던전마다 재료와 토템이 달라, 던전 하나를 표 한 칸으로
 * 두고 화면은 칸마다 탭을 하나씩 낸다. 새 던전의 주화가 나오면 COIN_DUNGEONS 에 한 칸만 더한다.
 */

export interface CoinOption {
  name: string;
  min: number;
  max: number;
  /** 수치 간격. */
  step: number;
  unit: string;
}

export interface CoinTotem {
  /** "물리 토템" */
  label: string;
  /** 경매장에 오르는 이름. */
  itemName: string;
  options: readonly CoinOption[];
}

export interface CoinDungeon {
  key: string;
  /** 탭 이름. "브리 레흐" */
  label: string;
  /** 화면 제목. "브리 레흐의 주화" */
  title: string;
  /** 주화 하나에 드는 재료. */
  material: { name: string; category: string; count: number };
  /** 주화 그림을 찾는 경매장 카테고리. */
  coinCategory: string;
  totems: readonly CoinTotem[];
}

/** 아직 주화가 나오지 않은 던전. 탭은 보이되 고를 수 없다. */
export interface UpcomingCoinDungeon {
  key: string;
  label: string;
}

const CRITICAL_DAMAGE: CoinOption = {
  name: '크리티컬 대미지',
  min: 1,
  max: 10,
  step: 1,
  unit: '%',
};
const ARCANA_BONUS: CoinOption = {
  name: '아르카나 스킬 보너스 대미지',
  min: 0.15,
  max: 3,
  step: 0.15,
  unit: '%',
};

export const COIN_DUNGEONS: readonly CoinDungeon[] = [
  {
    key: 'brie-lech',
    label: '브리 레흐',
    title: '브리 레흐의 주화',
    material: { name: '브리 레흐의 잔흔석', category: '기타', count: 3 },
    coinCategory: '토템',
    totems: [
      {
        label: '물리 토템',
        itemName: '브리 레흐의 주화(물리 토템)',
        options: [
          { name: '최대 대미지', min: 1, max: 20, step: 1, unit: '' },
          CRITICAL_DAMAGE,
          ARCANA_BONUS,
        ],
      },
      {
        label: '마법 토템',
        itemName: '브리 레흐의 주화(마법 토템)',
        options: [
          { name: '마법 공격력', min: 1, max: 20, step: 1, unit: '' },
          CRITICAL_DAMAGE,
          ARCANA_BONUS,
        ],
      },
      {
        label: '연금 토템',
        itemName: '브리 레흐의 주화(연금 토템)',
        options: [
          { name: '모든 속성 연금술 대미지', min: 1, max: 20, step: 1, unit: '' },
          CRITICAL_DAMAGE,
          ARCANA_BONUS,
        ],
      },
      {
        label: '지원 토템',
        itemName: '브리 레흐의 주화(지원 토템)',
        options: [
          { name: '전장의 서곡, 비바체 공격력', min: 0.1, max: 1, step: 0.1, unit: '%' },
          { name: '음악 버프 지속 시간', min: 1, max: 20, step: 1, unit: '' },
          { name: '힐링 효과', min: 1, max: 20, step: 1, unit: '%' },
        ],
      },
    ],
  },
];

export const UPCOMING_COIN_DUNGEONS: readonly UpcomingCoinDungeon[] = [
  { key: 'talta-gah', label: '탈라 가흐' },
];

/** 그 옵션이 가질 수 있는 수치의 개수. */
export const stepCount = (option: CoinOption) =>
  Math.round((option.max - option.min) / option.step) + 1;

/** step 번째(0부터) 수치. 0.15 를 거듭 더하며 생기는 부동소수 찌꺼기를 소수 둘째 자리에서 자른다. */
export const valueAt = (option: CoinOption, index: number) =>
  Math.round((option.min + option.step * index) * 100) / 100;

/** 그 옵션의 모든 수치. */
export const optionValues = (option: CoinOption) =>
  Array.from({ length: stepCount(option) }, (_, index) => valueAt(option, index));

/** 수치를 간격의 자릿수로. 0.15 는 "0.15", 3 은 "3.00", 0.1 간격은 "0.5". */
export function formatCoinValue(option: CoinOption, value: number): string {
  const digits = option.step >= 1 ? 0 : (option.step.toString().split('.')[1]?.length ?? 2);
  return `${value.toFixed(digits)}${option.unit}`;
}

/**
 * 높은 수치인지. 수치 칸 순번(1부터)이 전체 칸 수의 90% 이상이면 높다.
 * 1~20 은 18 부터, 1~10 은 9 부터 굵게 칠한다.
 */
export const isHighValue = (option: CoinOption, index: number) =>
  (index + 1) / stepCount(option) >= 0.9;

/** 한 번에 그 옵션이 그 수치 이상으로 나올 확률. */
export function atLeastChance(option: CoinOption, minValue: number): number {
  const count = stepCount(option);
  const hits = optionValues(option).filter((value) => value >= minValue - 1e-9).length;
  return hits / count;
}

/** 옵션마다 최솟값을 정했을 때 셋을 한꺼번에 넘을 확률. 줄마다 따로 뽑으므로 곱한다. */
export const coinTargetChance = (totem: CoinTotem, minValues: readonly number[]) =>
  totem.options.reduce(
    (chance, option, index) => chance * atLeastChance(option, minValues[index] ?? option.min),
    1,
  );

export interface CoinDraw {
  /** 몇 번째로 만든 것인지. 1부터. 표의 키로도 쓴다. */
  no: number;
  /** 토템 순번. */
  totem: number;
  /** 옵션마다 수치 칸 순번(0부터). */
  steps: number[];
}

/** [0, 1) 난수. 테스트에서 바꿔 끼운다. */
export type RandomSource = () => number;

const pick = (length: number, random: RandomSource) =>
  Math.min(length - 1, Math.floor(random() * length));

export function drawCoin(
  dungeon: CoinDungeon,
  totem: number,
  no: number,
  random: RandomSource = Math.random,
): CoinDraw {
  return {
    no,
    totem,
    steps: dungeon.totems[totem].options.map((option) => pick(stepCount(option), random)),
  };
}

/** 만든 주화가 옵션마다 정한 최솟값을 모두 넘는지. */
export const meetsCoinTarget = (
  dungeon: CoinDungeon,
  draw: CoinDraw,
  minValues: readonly number[],
) =>
  dungeon.totems[draw.totem].options.every(
    (option, index) =>
      valueAt(option, draw.steps[index]) >= (minValues[index] ?? option.min) - 1e-9,
  );

export interface CoinSimulator {
  /** 지금까지 만든 것. 먼저 만든 것이 앞이다. */
  draws: CoinDraw[];
  /** 마지막으로 누른 단추가 몇 개 만들었는지. */
  lastBatch: number;
  draw: (totem: number, times: number) => void;
  reset: () => void;
}

/** 만든 기록. 던전마다 따로 둔다. 새로 고치거나 화면을 떠나면 처음부터다. */
export function useCoinSimulator(dungeon: CoinDungeon, random?: RandomSource): CoinSimulator {
  const [state, setState] = useState<{ draws: CoinDraw[]; lastBatch: number }>({
    draws: [],
    lastBatch: 0,
  });
  const draw = useCallback(
    (totem: number, times: number) =>
      setState((prev) => {
        const added = Array.from({ length: times }, (_, index) =>
          drawCoin(dungeon, totem, prev.draws.length + index + 1, random ?? Math.random),
        );
        return { draws: [...prev.draws, ...added], lastBatch: times };
      }),
    [dungeon, random],
  );
  const reset = useCallback(() => setState({ draws: [], lastBatch: 0 }), []);
  return { ...state, draw, reset };
}
