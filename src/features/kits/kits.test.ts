import { describe, expect, it } from 'vitest';
import {
  addCounts,
  cumulative,
  isTopGrade,
  openKit,
  openOnce,
  RECENT_LIMIT,
  type Kit,
} from './kits';

const kit: Kit = {
  id: 'official-1',
  name: '나이트메어 판타지아 박스',
  start: '2026-10-01',
  end: '2026-10-14',
  price: 1200,
  grades: [
    { name: 'S 등급', chance: 0.1 },
    { name: 'C 등급', chance: 0.9 },
  ],
  items: [
    { name: '찬란한 나이트메어 판타지아 데몬 윙', chance: 0.1, grade: 0 },
    { name: '베인 풍선(5번)', chance: 0.4, grade: 1 },
    { name: '색동연 풍선(5번)', chance: 0.5, grade: 1 },
  ],
};

/** 정해 둔 값을 차례로 돌려주는 난수. 다 쓰면 처음으로 돌아간다. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe('키트 열기', () => {
  it('누적 확률은 1 에서 끝나고, 합이 100%에서 어긋나도 맞춰 준다', () => {
    expect(cumulative(kit).at(-1)).toBeCloseTo(1, 12);
    const rounded = {
      ...kit,
      items: kit.items.map((item) => ({ ...item, chance: item.chance * 0.9999 })),
    };
    expect(cumulative(rounded).at(-1)).toBeCloseTo(1, 12);
  });

  it('난수가 누적 확률의 어느 칸에 떨어지는지로 아이템이 정해진다', () => {
    const table = cumulative(kit);
    expect(openOnce(table, () => 0)).toBe(0);
    expect(openOnce(table, () => 0.1)).toBe(1);
    expect(openOnce(table, () => 0.49)).toBe(1);
    expect(openOnce(table, () => 0.999)).toBe(2);
  });

  it('여러 번 열면 아이템마다 횟수를 세고, 마지막 몇 개만 남긴다', () => {
    const run = openKit(kit, 20, null, sequence(0.05, 0.3, 0.7, 0.9));
    expect(run.opened).toBe(20);
    expect(run.counts.get(0)).toBe(5);
    expect(run.counts.get(1)).toBe(5);
    expect(run.counts.get(2)).toBe(10);
    expect(run.recent).toHaveLength(RECENT_LIMIT);
  });

  it('목표 아이템이 나오면 거기서 멈추고, 끝까지 안 나오면 상한까지 연다', () => {
    expect(openKit(kit, 100, 0, sequence(0.9, 0.9, 0.05))).toMatchObject({ opened: 3, hit: true });
    expect(openKit(kit, 50, 0, sequence(0.9))).toMatchObject({ opened: 50, hit: false });
  });

  it('여러 번 연 횟수를 합친다', () => {
    const total = addCounts(
      new Map([[0, 1]]),
      new Map([
        [0, 2],
        [1, 1],
      ]),
    );
    expect([...total]).toEqual([
      [0, 3],
      [1, 1],
    ]);
  });

  it('등급이 여럿인 키트의 첫 등급만 가장 높은 등급으로 본다', () => {
    expect(isTopGrade(kit, 0)).toBe(true);
    expect(isTopGrade(kit, 1)).toBe(false);
    expect(isTopGrade({ ...kit, grades: [] }, 0)).toBe(false);
  });
});
