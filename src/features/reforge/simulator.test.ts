import { describe, expect, it } from 'vitest';
import type { PoolRow } from './data';
import {
  advance,
  drawLines,
  levelAtLeast,
  meetsTargets,
  optionEffect,
  parseOption,
  targetChance,
} from './simulator';

/** 정해 둔 값을 차례로 내주는 난수. 모자라면 0 을 준다. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++] ?? 0;
};

const POOL: PoolRow[] = [
  [0, 1, 5],
  [1, 4, 10, 11, 13],
  [2, 2, 5],
  [3, 1, 20],
];

describe('drawLines', () => {
  it('세 줄을 겹치지 않게 뽑는다', () => {
    for (let run = 0; run < 200; run += 1) {
      const lines = drawLines(POOL, 0.001);
      expect(lines).toHaveLength(3);
      expect(new Set(lines.map((line) => line.option)).size).toBe(3);
    }
  });

  it('옵션이 셋보다 적으면 있는 만큼만 붙는다', () => {
    expect(drawLines(POOL.slice(0, 2), 0)).toHaveLength(2);
  });

  it('한계 돌파 확률에 걸리면 한계 돌파 구간에서 레벨을 고른다', () => {
    // 첫 줄에 두 번째 옵션(4~10, 한계 돌파 11~13)을 고르고, 진입 판정에 걸리고, 구간의 끝 레벨.
    const [line] = drawLines(POOL, 0.001, sequence(0.25, 0.0005, 0.99));
    expect(line).toEqual({ option: 1, level: 13, limitBreak: true });
  });

  it('진입 판정에 걸리지 않으면 일반 구간에서 고른다', () => {
    const [line] = drawLines(POOL, 0.001, sequence(0.25, 0.5, 0.99));
    expect(line).toEqual({ option: 1, level: 10, limitBreak: false });
  });
});

describe('advance', () => {
  const setting = { tool: 'fine' as const, type: 1, race: 0, pool: POOL, limitBreakRate: 0 };
  const start = { draws: [], lastBatch: 0, item: null };
  const never = () => false;

  it('옵션이 없는 장비에는 기억의 보석을 쓰지 못해 첫 세공은 바로 붙는다', () => {
    const next = advance(start, setting, 1, true, never, Math.random);
    expect(next.draws[0].gem).toBe(false);
    expect(next.item?.lines).toEqual(next.draws[0].lines);
    expect(next.item?.pending).toBeNull();
  });

  it('기억의 보석을 쓰면 장비 옵션은 그대로 두고 새 옵션만 따로 둔다', () => {
    const first = advance(start, setting, 1, false, never, Math.random);
    const next = advance(first, setting, 3, true, never, Math.random);
    expect(next.draws.slice(1).every((draw) => draw.gem)).toBe(true);
    expect(next.item?.lines).toBe(first.item?.lines);
    expect(next.item?.pending).toEqual(next.draws[3].lines);
  });

  it('보석 없이 세공하면 새 옵션이 바로 붙고 따로 둔 옵션은 사라진다', () => {
    const first = advance(start, setting, 1, false, never, Math.random);
    const gem = advance(first, setting, 1, true, never, Math.random);
    const plain = advance(gem, setting, 1, false, never, Math.random);
    expect(plain.item?.lines).toEqual(plain.draws[2].lines);
    expect(plain.item?.pending).toBeNull();
  });

  it('장비 종류를 바꾸면 빈 새 장비로 시작한다', () => {
    const first = advance(start, setting, 1, false, never, Math.random);
    const other = advance(first, { ...setting, type: 23 }, 1, true, never, Math.random);
    expect(other.draws[1].gem).toBe(false);
    expect(other.item).toMatchObject({ type: 23, pending: null });
  });

  it('멈출 조건을 채우면 거기서 멈춘다', () => {
    const next = advance(start, setting, 50, false, () => true, Math.random);
    expect(next.draws).toHaveLength(1);
    expect(next.lastBatch).toBe(1);
  });
});

describe('levelAtLeast', () => {
  it('일반 구간만 있는 옵션은 폭 안에서 고르게 센다', () => {
    expect(levelAtLeast([0, 1, 5], 4, 0.001)).toBeCloseTo(2 / 5);
    expect(levelAtLeast([0, 1, 5], 1, 0.001)).toBe(1);
    expect(levelAtLeast([0, 1, 5], 6, 0.001)).toBe(0);
  });

  it('한계 돌파가 되는 옵션은 두 구간을 진입 확률로 섞는다', () => {
    // 확률표: 4~10 이 각 14.2714%, 11~13 이 각 0.03333%
    expect(levelAtLeast([1, 4, 10, 11, 13], 10, 0.001)).toBeCloseTo(0.999 / 7 + 0.001, 8);
    expect(levelAtLeast([1, 4, 10, 11, 13], 13, 0.001)).toBeCloseTo(0.001 / 3, 8);
  });
});

describe('targetChance', () => {
  it('목표 옵션 하나는 세 줄 중 하나에 들 확률 3/N 이다', () => {
    expect(targetChance(POOL, [{ option: 0, minLevel: 1 }], 0)).toBeCloseTo(3 / 4);
  });

  it('목표 옵션 둘은 C(N-2, 1) / C(N, 3) 에 레벨 확률을 곱한다', () => {
    const chance = targetChance(
      POOL,
      [
        { option: 0, minLevel: 5 },
        { option: 2, minLevel: 5 },
      ],
      0,
    );
    expect(chance).toBeCloseTo((2 / 4) * (1 / 5) * (1 / 4));
  });

  it('목표가 없거나 장비에 없는 옵션이면 0 이다', () => {
    expect(targetChance(POOL, [], 0)).toBe(0);
    expect(targetChance(POOL, [{ option: 9, minLevel: 1 }], 0)).toBe(0);
  });
});

describe('meetsTargets', () => {
  const lines = [
    { option: 0, level: 5, limitBreak: false },
    { option: 1, level: 8, limitBreak: false },
    { option: 3, level: 12, limitBreak: false },
  ];

  it('목표 옵션이 모두 그 레벨 이상으로 붙어야 한다', () => {
    expect(meetsTargets(lines, [{ option: 1, minLevel: 8 }])).toBe(true);
    expect(meetsTargets(lines, [{ option: 1, minLevel: 9 }])).toBe(false);
    expect(
      meetsTargets(lines, [
        { option: 0, minLevel: 5 },
        { option: 2, minLevel: 1 },
      ]),
    ).toBe(false);
  });

  it('목표가 없으면 달성으로 치지 않는다', () => {
    expect(meetsTargets(lines, [])).toBe(false);
  });
});

describe('parseOption', () => {
  it('확률표 옵션 문장을 이름과 레벨당 효과로 나눈다', () => {
    const option = parseOption('대미지밸런스(1레벨 당 1 % 증가)');
    expect(option).toEqual({ name: '대미지밸런스', base: 1, per: 1, suffix: '% 증가', note: '' });
    expect(optionEffect(option, 7)).toBe('7% 증가');
  });

  it('1레벨 값과 이후 레벨당 값이 따로 적힌 문장을 읽는다', () => {
    const option = parseOption(
      '힐링 수련 경험치(1레벨 1.10 배 수련 경험치 증가/이후 1레벨 당 0.10 배 수련 경험치 증가)',
    );
    expect(option.name).toBe('힐링 수련 경험치');
    expect(optionEffect(option, 1)).toBe('1.1배 수련 경험치 증가');
    expect(optionEffect(option, 5)).toBe('1.5배 수련 경험치 증가');
  });

  it('빗금 뒤의 덧붙임은 괄호로 남긴다', () => {
    const option = parseOption('캐스팅 속도(1레벨 당 1.50 % 증가/원드에는 2회 적용)');
    expect(optionEffect(option, 3)).toBe('4.5% 증가 (원드에는 2회 적용)');
  });

  it('이름과 효과 안의 괄호를 가려 끝의 괄호 묶음만 효과로 읽는다', () => {
    expect(parseOption('랜스 차지 범위 폭(인간)(1레벨 당 2.00 cm 증가)').name).toBe(
      '랜스 차지 범위 폭(인간)',
    );
    const drain = parseOption('라이프 드레인 대미지(1레벨 당 5 증가(초당))');
    expect(drain.name).toBe('라이프 드레인 대미지');
    expect(optionEffect(drain, 3)).toBe('15 증가(초당)');
    const demon = parseOption('데몬 오브 피시스 [변신 중] 최대 대미지(1레벨 당 2 증가)');
    expect(optionEffect(demon, 4)).toBe('8 증가');
  });

  it('레벨로 효과가 달라지지 않는 옵션은 이름만 남긴다', () => {
    const option = parseOption('돌진 인간 및 엘프일 때 방패 없이 사용 가능');
    expect(option.name).toBe('돌진 인간 및 엘프일 때 방패 없이 사용 가능');
    expect(optionEffect(option, 1)).toBeNull();
  });
});
