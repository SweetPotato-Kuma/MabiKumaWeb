import { describe, expect, it } from 'vitest';
import { buildRecipeBook, type RawRecipeData } from '@/features/crafting/recipes';
import { buildMemoPlan, mergeShortages, shortKinds, type MemoTargetInput } from './plan';

/**
 * 작은 제작법 책.
 * - 검(1)은 철괴(2) 3개와 가죽(3) 또는 거래 불가 가죽(4) 1개로 만든다. 블랙스미스라 공정마다 작업 재료를 넣는다.
 * - 철괴(2)는 철광석(5) 2개로 한 번에 10개가 나온다.
 * - 활(7)은 거래 불가 시위(8) 2개로 만들고, 시위(8)는 실(9) 4개로 만든다.
 */
const RAW: RawRecipeData = {
  updated: '2026-10-01',
  skills: [
    { id: 10016, name: '블랙스미스', count: 1 },
    { id: 10015, name: '제련', count: 1 },
    { id: 10020, name: '요리', count: 1 },
  ],
  items: {
    1: ['검', 1],
    2: ['철괴', 1],
    3: ['가죽', 1],
    4: ['가죽(거래 불가)', 0],
    5: ['철광석', 1],
    7: ['활', 1],
    8: ['시위', 0],
    9: ['실', 1],
  },
  recipes: [
    {
      item: 1,
      skill: 10016,
      rank: 7,
      yield: 1,
      materials: [
        [[2], 3],
        [[4, 3], 1],
      ],
      finish: [[[3], 2]],
    },
    { item: 2, skill: 10015, rank: 1, yield: 10, materials: [[[5], 2]] },
    { item: 7, skill: 10015, rank: 1, yield: 1, materials: [[[8], 2]] },
    { item: 8, skill: 10015, rank: 1, yield: 1, materials: [[[9], 4]] },
  ],
};

const book = buildRecipeBook(RAW);

const target = (overrides: Partial<MemoTargetInput> = {}): MemoTargetInput => ({
  itemId: 7,
  count: 1,
  owned: {},
  choices: {},
  ...overrides,
});

describe('buildMemoPlan', () => {
  it('거래 불가 재료는 제작법이 있으면 기본으로 만들어 하위 재료를 센다', () => {
    const plan = buildMemoPlan(book, target({ count: 3 }));
    expect(plan.nodes).toHaveLength(1);
    const [string] = plan.nodes;
    expect(string).toMatchObject({ itemId: 8, required: 6, choice: expect.any(Number), chosen: false });
    expect(string.children?.map((node) => [node.itemId, node.required])).toEqual([[9, 24]]);
    expect(plan.materials).toEqual([{ itemId: 9, required: 24, owned: 0, short: 24 }]);
  });

  it('만들기로 한 재료를 이미 가졌다면 모자란 만큼만 하위 재료를 센다', () => {
    const plan = buildMemoPlan(book, target({ count: 3, owned: { m0: 4 } }));
    const [string] = plan.nodes;
    expect(string).toMatchObject({ required: 6, owned: 4, short: 2, crafts: 2 });
    expect(string.children?.[0].required).toBe(8);
  });

  it('다 가졌으면 하위 재료는 필요 없고 구할 재료 목록에도 오르지 않는다', () => {
    const plan = buildMemoPlan(book, target({ count: 1, owned: { m0: 2 } }));
    expect(plan.nodes[0].short).toBe(0);
    expect(plan.nodes[0].children?.[0].required).toBe(0);
    expect(plan.materials).toEqual([]);
  });

  it('구하기를 고르면 거래 불가 재료도 만들지 않는다', () => {
    const plan = buildMemoPlan(book, target({ choices: { m0: 'gather' } }));
    expect(plan.nodes[0]).toMatchObject({ choice: 'gather', chosen: true });
    expect(plan.nodes[0].children).toBeUndefined();
    expect(plan.materials).toEqual([{ itemId: 8, required: 2, owned: 0, short: 2 }]);
  });

  it('살 수 있는 재료는 구하는 쪽이 기본이고, 제작법을 고르면 만든다', () => {
    const base = target({ itemId: 1 });
    const plain = buildMemoPlan(book, base);
    const ingot = plain.nodes[0];
    expect(ingot).toMatchObject({ itemId: 2, choice: 'gather', chosen: false });

    const crafted = buildMemoPlan(book, { ...base, choices: { m0: ingot.recipes[0].index } });
    // 기준 공정 7번 x 3개 = 철괴 21개. 10개씩 3번 만들고 철광석은 한 번에 2개.
    expect(crafted.nodes[0]).toMatchObject({ required: 21, crafts: 3 });
    expect(crafted.nodes[0].children?.[0]).toMatchObject({ itemId: 5, required: 6 });
  });

  it('작업 재료는 공정 수만큼 곱하고 마무리 재료는 한 번만 센다', () => {
    const plan = buildMemoPlan(book, target({ itemId: 1, works: 5 }));
    const [ingot, leather, finish] = plan.nodes;
    expect(ingot).toMatchObject({ required: 15, perWork: 3 });
    expect(leather).toMatchObject({ required: 5, perWork: 1 });
    expect(finish).toMatchObject({ finish: true, required: 2 });
    expect(finish.perWork).toBeUndefined();
  });

  it('칸에 거래 가능한 아이템이 있으면 그것을 고른다', () => {
    const plan = buildMemoPlan(book, target({ itemId: 1 }));
    expect(plan.nodes[1].itemId).toBe(3);
  });

  it('같은 재료가 여러 곳에 나오면 한 줄로 합친다', () => {
    const plan = buildMemoPlan(book, target({ itemId: 1, works: 1, owned: { m1: 1 } }));
    const leather = plan.materials.find((row) => row.itemId === 3);
    expect(leather).toEqual({ itemId: 3, required: 3, owned: 1, short: 2 });
  });

  it('한 번에 여러 개 나오는 제작법은 올림해서 센다', () => {
    const [ingot] = buildMemoPlan(book, target({ itemId: 1, works: 7 })).nodes;
    const crafted = buildMemoPlan(book, {
      ...target({ itemId: 1, works: 7 }),
      choices: { m0: ingot.recipes[0].index },
    }).nodes[0];
    expect(crafted).toMatchObject({ required: 21, crafts: 3, yieldCount: 10 });
  });

  it('제작법이 없는 아이템은 빈 계획이다', () => {
    expect(buildMemoPlan(book, target({ itemId: 5 })).nodes).toEqual([]);
  });

  it('없는 제작법 순번을 가리키는 저장값은 기본값으로 돌아간다', () => {
    const plan = buildMemoPlan(book, target({ choices: { m0: 999 } }));
    expect(plan.nodes[0].chosen).toBe(false);
    expect(plan.nodes[0].children).toBeDefined();
  });

  it('isBuyable 로 NPC 가 파는 재료를 구하는 쪽으로 둔다', () => {
    const plan = buildMemoPlan(book, target(), { isBuyable: (id) => id === 8 });
    expect(plan.nodes[0].choice).toBe('gather');
  });
});

describe('mergeShortages', () => {
  it('목표 여럿의 재료를 아이템별로 합치고 모자란 것을 위로 올린다', () => {
    const first = buildMemoPlan(book, target({ itemId: 1, works: 1, owned: { m1: 1, f0: 2 } }));
    const second = buildMemoPlan(book, target({ itemId: 7, count: 1 }));
    const merged = mergeShortages([first, second]);
    expect(merged.find((row) => row.itemId === 3)).toEqual({
      itemId: 3,
      required: 3,
      owned: 3,
      short: 0,
    });
    expect(merged.at(-1)?.itemId).toBe(3);
    expect(shortKinds(merged)).toBe(merged.length - 1);
  });
});
