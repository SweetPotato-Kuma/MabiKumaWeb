import { describe, expect, it } from 'vitest';
import type { PriceState } from '@/features/crafting/market';
import { buildRecipeBook } from '@/features/crafting/recipes';
import {
  beadCraftsOf,
  inputCostOf,
  planBeads,
  rankCrafts,
  valueCraft,
  type BeadCraft,
} from './beadCrafts';

function priced(...offers: [number, number][]): PriceState {
  return {
    status: 'ok',
    price: {
      offers: offers.map(([price, count]) => ({ price, count })),
      supply: offers.reduce((sum, [, count]) => sum + count, 0),
      complete: true,
    },
  };
}

/**
 * 이빨(1) 은 구슬 1개, 거래 불가 이빨(2) 은 NPC 가 주는 판이다.
 * 가공한 이빨(10) = 이빨 7 + 마력석(3) 20. 가공한 이빨은 장비(20) 의 재료다.
 * 장비(20) 도 이빨을 쓰지만 다른 제작법의 재료가 아니므로 후보가 아니다.
 */
const book = buildRecipeBook({
  updated: '2026-09-26',
  skills: [{ id: 10013, name: '핸디크래프트', count: 2 }],
  items: {
    1: ['이빨', 1],
    2: ['이빨(거래 불가)', 0],
    3: ['마력석', 1],
    4: ['마력석(거래 불가)', 0],
    10: ['가공한 이빨', 1],
    20: ['장비', 1],
  },
  recipes: [
    {
      item: 10,
      skill: 10013,
      rank: 13,
      yield: 1,
      materials: [
        [[1, 2], 7],
        [[3, 4], 20],
      ],
    },
    {
      item: 20,
      skill: 10013,
      rank: 15,
      yield: 1,
      materials: [
        [[1, 2], 4],
        [[10], 24],
      ],
    },
  ],
});

const EXCHANGES = [{ id: 1, name: '이빨', cost: 1 }];

describe('beadCraftsOf', () => {
  it('구슬 재료를 쓰는 중간 재료만 고르고, 구슬 칸과 살 칸을 나눈다', () => {
    const crafts = beadCraftsOf(book, EXCHANGES);
    expect(crafts.map((craft) => craft.name)).toEqual(['가공한 이빨']);
    const [craft] = crafts;
    expect(craft.beads).toBe(7);
    expect(craft.beadInputs).toEqual([{ itemId: 1, name: '이빨', count: 7, beads: 7 }]);
    // 거래 불가 판이 함께 적힌 칸은 거래되는 판으로 산다.
    expect(craft.buyInputs).toEqual([{ itemId: 3, name: '마력석', count: 20 }]);
  });
});

describe('inputCostOf', () => {
  const input = { itemId: 3, name: '마력석', count: 20 };

  it('싼 매물부터 필요한 개수만큼 채운 값을 쓴다', () => {
    expect(inputCostOf(input, priced([100, 15], [200, 50]), undefined)).toEqual({
      status: 'ok',
      cost: 15 * 100 + 5 * 200,
      from: 'auction',
    });
  });

  it('NPC 가 더 싸거나 매물이 모자라면 NPC 에서 산다', () => {
    expect(inputCostOf(input, priced([100, 20]), 50)).toEqual({
      status: 'ok',
      cost: 1_000,
      from: 'npc',
    });
    expect(inputCostOf(input, priced([10, 5]), 50)).toMatchObject({ from: 'npc' });
    expect(inputCostOf(input, { status: 'loading' }, 50)).toMatchObject({ from: 'npc' });
  });

  it('NPC 가 팔지 않으면 매물이 없거나 모자란 사실을 그대로 알린다', () => {
    expect(inputCostOf(input, priced(), undefined)).toEqual({ status: 'none' });
    expect(inputCostOf(input, priced([10, 5]), undefined)).toEqual({ status: 'short', filled: 5 });
    expect(inputCostOf(input, undefined, undefined)).toEqual({ status: 'loading' });
    expect(inputCostOf(input, { status: 'error', error: new Error('x') }, undefined)).toEqual({
      status: 'error',
    });
  });
});

describe('valueCraft', () => {
  const [craft] = beadCraftsOf(book, EXCHANGES);
  const noNpc = () => undefined;

  it('판매가에서 살 재료 값을 뺀 차익을 구슬 수로 나눈다', () => {
    const prices: Record<string, PriceState> = {
      '가공한 이빨': priced([100_000, 1]),
      마력석: priced([1_000, 20]),
    };
    const valued = valueCraft(craft, (name) => prices[name], noNpc);
    expect(valued.value).toEqual({
      status: 'ok',
      sale: 100_000,
      materialCost: 20_000,
      profit: 80_000,
      perBead: Math.floor(80_000 / 7),
    });
  });

  it('판매 매물이나 재료 매물이 없으면 값을 매기지 않는다', () => {
    const noSale = valueCraft(
      craft,
      (name) => (name === '마력석' ? priced([1_000, 20]) : priced()),
      noNpc,
    );
    expect(noSale.value).toEqual({ status: 'unknown', reason: 'no-sale' });
    const noMaterial = valueCraft(
      craft,
      (name) => (name === '마력석' ? priced() : priced([100_000, 1])),
      noNpc,
    );
    expect(noMaterial.value).toEqual({ status: 'unknown', reason: 'no-material' });
    expect(valueCraft(craft, () => undefined, noNpc).value).toEqual({ status: 'loading' });
  });
});

/** 계산용 가짜 제작법. 구슬과 차익만 본다. */
function fakeCraft(name: string, beads: number, profit: number | null) {
  const craft = { name, beads, itemId: beads } as unknown as BeadCraft;
  return {
    ...craft,
    inputs: [],
    value:
      profit === null
        ? ({ status: 'unknown', reason: 'no-sale' } as const)
        : ({
            status: 'ok',
            sale: profit,
            materialCost: 0,
            profit,
            perBead: Math.floor(profit / beads),
          } as const),
  };
}

describe('rankCrafts', () => {
  it('구슬 1개당 차익이 큰 순으로 세우고, 차익이 날 때만 가장 이득을 표시한다', () => {
    const ranked = rankCrafts([
      fakeCraft('가', 10, 1_000),
      fakeCraft('나', 3, 900),
      fakeCraft('다', 5, null),
      fakeCraft('라', 1, -50),
    ]);
    expect(ranked.map((craft) => craft.name)).toEqual(['나', '가', '라', '다']);
    expect(ranked.map((craft) => craft.best)).toEqual([true, false, false, false]);
    expect(rankCrafts([fakeCraft('라', 1, -50)])[0].best).toBe(false);
  });
});

describe('planBeads', () => {
  it('가진 구슬 안에서 차익 합이 가장 큰 조합을 고른다', () => {
    // 구슬 10개: 3개짜리(900) 세 번 = 2,700 이 10개짜리(1,000) 한 번보다 낫다.
    const crafts = rankCrafts([fakeCraft('큰 것', 10, 1_000), fakeCraft('작은 것', 3, 900)]);
    const plan = planBeads(crafts, 10);
    expect(plan.picks.map((pick) => [pick.craft.name, pick.times])).toEqual([['작은 것', 3]]);
    expect(plan.beadsUsed).toBe(9);
    expect(plan.profit).toBe(2_700);
  });

  it('구슬 1개당은 낮아도 남는 구슬을 채워 합이 커지면 섞는다', () => {
    // 구슬 7개: 3개짜리 두 번(1,800) + 남는 1개로는 아무것도 못 한다.
    // 7개짜리 한 번(2,000) 이 낫다.
    const crafts = rankCrafts([fakeCraft('칠', 7, 2_000), fakeCraft('삼', 3, 900)]);
    expect(planBeads(crafts, 7).picks.map((pick) => pick.craft.name)).toEqual(['칠']);
    expect(planBeads(crafts, 10).profit).toBe(2_900);
  });

  it('차익이 나지 않거나 값을 모르는 제작법은 고르지 않는다', () => {
    const crafts = rankCrafts([fakeCraft('손해', 1, -10), fakeCraft('모름', 1, null)]);
    expect(planBeads(crafts, 100)).toEqual({ picks: [], beadsUsed: 0, profit: 0 });
    expect(planBeads(crafts, 0).picks).toEqual([]);
  });
});
