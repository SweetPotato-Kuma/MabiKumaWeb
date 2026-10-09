import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/features/crafting/plan';
import { buildRecipeBook, type RawRecipeData } from '@/features/crafting/recipes';
import { goalBeads, goalCoins, goalsRecipe, memoBook } from './goalPlan';
import type { Goal } from './store';

/**
 * 검(1)은 철괴(2) 3개와 가죽(3) 1개로 만든다. 철괴는 철광석(5) 2개로 10개씩 나온다.
 * 이름이 같은 아이템 둘: 거래 가능한 활(7)과 거래 불가인 활(8). 제작법은 거래 불가 쪽에만 있다.
 */
const RAW: RawRecipeData = {
  updated: '2026-10-01',
  skills: [
    { id: 10013, name: '핸디크래프트', count: 1 },
    { id: 10015, name: '제련', count: 1 },
  ],
  items: {
    1: ['검', 1],
    2: ['철괴', 1],
    3: ['가죽', 1],
    5: ['철광석', 1],
    7: ['활', 1],
    8: ['활', 0],
    9: ['실', 1],
  },
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
    { item: 8, skill: 10013, rank: 1, yield: 1, materials: [[[9], 4]] },
  ],
};

const base = buildRecipeBook(RAW);
const goal = (id: string, name: string, quantity = 1): Goal => ({ id, name, quantity });

describe('memoBook', () => {
  it('제작법 데이터에 없는 이름은 번호를 받아 거래되는 아이템이 된다', () => {
    const book = memoBook(base, ['오래된 지팡이']);
    const [id] = book.idsByName('오래된 지팡이');
    expect(id).toBeLessThan(0);
    expect(book.itemName(id)).toBe('오래된 지팡이');
    expect(book.isTradable(id)).toBe(true);
    expect(book.iconOf(id)).toBeUndefined();
    expect(book.recipesOf(id)).toEqual([]);
    expect(book.subRecipesOf(id)).toEqual([]);
  });

  it('데이터에 있는 이름은 원래 번호를 그대로 쓴다', () => {
    const book = memoBook(base, ['검']);
    expect(book.idsByName('검')).toEqual([1]);
    expect(book.itemName(1)).toBe('검');
  });

  it('이름이 같은 아이템은 제작법을 합쳐 어느 번호로 물어도 같은 제작법이 나온다', () => {
    const book = memoBook(base, ['활']);
    expect(book.subRecipesOf(7).map((recipe) => recipe.item)).toEqual([8]);
    expect(book.subRecipesOf(8).map((recipe) => recipe.item)).toEqual([8]);
  });

  it('목록에 없는 번호는 원래 책에 묻는다', () => {
    expect(memoBook(base, []).itemName(999)).toBe('#999');
  });
});

describe('목표를 재료 트리 계산에 넣기', () => {
  const run = (goals: Goal[], overrides = {}) => {
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
      methods: {},
      expanded: new Set(),
      ...overrides,
    });
    return { book, plan };
  };

  it('목표마다 맨 위 줄이 되고 줄의 자리 이름은 목표 번호다', () => {
    const { plan } = run([goal('g1', '검', 2), goal('g2', '오래된 지팡이', 3)]);
    expect(plan.nodes.map((node) => [node.key, node.required])).toEqual([
      ['g1', 2],
      ['g2', 3],
    ]);
  });

  it('제작법이 있는 목표는 펼쳐 재료를 볼 수 있고, 없는 목표는 사는 값만 나온다', () => {
    const { plan } = run([goal('g1', '검'), goal('g2', '오래된 지팡이')], {
      methods: { g1: 0 },
    });
    expect(plan.nodes[0].recipes).toHaveLength(1);
    expect(plan.nodes[0].children?.map((node) => node.required)).toEqual([3, 1]);
    expect(plan.nodes[1].recipes).toEqual([]);
    expect(plan.nodes[1].children).toBeUndefined();
  });

  it('목표의 현재 개수를 빼면 모자란 만큼만 하위 재료를 센다', () => {
    const { plan } = run([goal('g1', '검', 5)], { methods: { g1: 0 }, owned: { g1: 3 } });
    expect(plan.nodes[0]).toMatchObject({ required: 5, owned: 3, short: 2 });
    expect(plan.nodes[0].children?.map((node) => node.required)).toEqual([6, 2]);
  });

  it('같은 재료가 여러 목표 아래 있으면 합쳐 한 줄로 산다', () => {
    const { plan } = run([goal('g1', '검', 1), goal('g2', '검', 1)], {
      methods: { g1: 0, g2: 0 },
    });
    expect(plan.shopping.find((row) => row.itemId === 3)?.required).toBe(2);
  });
});

describe('목표가 쓰는 코인', () => {
  it('코인으로 사는 재료가 없으면 코인이 없고 구슬 계산도 없다', () => {
    const book = memoBook(base, ['검']);
    expect(goalCoins(book, ['검'])).toEqual([]);
    expect(goalBeads(book, [], new Set())).toBeUndefined();
  });
});
