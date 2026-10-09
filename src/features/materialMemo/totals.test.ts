import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/features/crafting/plan';
import { buildRecipeBook, type RawRecipeData } from '@/features/crafting/recipes';
import { goalsRecipe, memoBook } from './goalPlan';
import type { Goal } from './store';
import { materialTotals } from './totals';

/** 검(1) = 철괴(2) 3개 + 가죽(3) 1개. 철괴는 철광석(5) 2개로 10개씩 나온다. */
const RAW: RawRecipeData = {
  updated: '2026-10-01',
  skills: [
    { id: 10013, name: '핸디크래프트', count: 1 },
    { id: 10015, name: '제련', count: 1 },
  ],
  items: { 1: ['검', 1], 2: ['철괴', 1], 3: ['가죽', 1], 5: ['철광석', 1] },
  recipes: [
    {
      item: 1,
      skill: 10013,
      rank: 7,
      yield: 1,
      materials: [
        [[2], 3],
        [[3], 1],
      ],
    },
    { item: 2, skill: 10015, rank: 1, yield: 10, materials: [[[5], 2]] },
  ],
};

const base = buildRecipeBook(RAW);
const goal = (id: string, name: string, quantity = 1): Goal => ({ id, name, quantity });

function totals(
  goals: Goal[],
  options: { methods?: Record<string, number | 'buy'>; owned?: Record<string, number> } = {},
) {
  const book = memoBook(
    base,
    goals.map((each) => each.name),
  );
  const plan = buildPlan({
    book,
    recipe: goalsRecipe(book, goals),
    quantity: 1,
    slotKeys: goals.map((each) => each.id),
    priceOf: () => undefined,
    methods: options.methods ?? {},
    expanded: new Set(),
    owned: options.owned,
  });
  return materialTotals(plan.nodes);
}

describe('materialTotals', () => {
  it('만들기로 한 목표는 아래 재료로 풀고, 사기로 한 재료는 그 줄로 센다', () => {
    // 검 2개 = 철괴 6개 + 가죽 2개. 철괴는 사는 쪽이 기본이다.
    expect(totals([goal('g1', '검', 2)], { methods: { g1: 0 } })).toEqual([
      { itemId: 2, required: 6, owned: 0 },
      { itemId: 3, required: 2, owned: 0 },
    ]);
  });

  it('철괴까지 만들기로 하면 철광석으로 풀린다', () => {
    const result = totals([goal('g1', '검', 2)], { methods: { g1: 0, 'g1.0/m0': 1 } });
    // 철괴 6개 = 10개씩 한 번, 철광석 2개.
    expect(result).toEqual([
      { itemId: 5, required: 2, owned: 0 },
      { itemId: 3, required: 2, owned: 0 },
    ]);
  });

  it('목표 자신도 사기로 했거나 제작법이 없으면 한 줄로 센다', () => {
    expect(totals([goal('g1', '검', 2)])).toEqual([{ itemId: 1, required: 2, owned: 0 }]);
  });

  it('같은 재료는 목표가 달라도 한 줄로 합치고 가진 개수도 더한다', () => {
    const result = totals([goal('g1', '검', 1), goal('g2', '가죽', 2)], {
      methods: { g1: 0 },
      owned: { 'g1.0/m1': 1, g2: 1 },
    });
    expect(result.find((row) => row.itemId === 3)).toEqual({ itemId: 3, required: 3, owned: 2 });
  });

  it('윗줄을 다 가져 만들 필요가 없어진 가지는 뺀다', () => {
    const result = totals([goal('g1', '검', 1)], {
      methods: { g1: 0, 'g1.0/m0': 1 },
      owned: { 'g1.0/m0': 3 },
    });
    // 철괴 3개를 이미 가졌다. 철광석은 필요 없고 가죽만 남는다.
    expect(result).toEqual([{ itemId: 3, required: 1, owned: 0 }]);
  });

  it('가진 개수가 필요한 개수보다 많아도 있는 그대로 보인다', () => {
    const result = totals([goal('g1', '가죽', 2)], { owned: { g1: 5 } });
    expect(result).toEqual([{ itemId: 3, required: 2, owned: 5 }]);
  });
});
