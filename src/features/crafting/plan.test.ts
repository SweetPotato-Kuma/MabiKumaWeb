import { describe, expect, it } from 'vitest';
import { quoteBuy, summarizeListings, type MarketPrice, type PriceState } from './market';
import { buildPlan, isComplete, type Method } from './plan';
import { buildRecipeBook, rankLabel, type RawRecipeData } from './recipes';

/**
 * 작은 제작법 책.
 * - 검(1)은 철괴(2) 3개와 가죽(3) 또는 가죽(거래 불가)(4) 1개로 만든다.
 * - 철괴(2)는 철광석(5) 2개로 한 번에 10개가 나온다.
 * - 철광석(5)은 금속 변환으로 광석 조각(6)에서도 나오지만, 트리에서는 풀지 않는다.
 */
const RAW: RawRecipeData = {
  updated: '2026-09-22',
  skills: [
    { id: 10016, name: '블랙스미스', count: 1 },
    { id: 10015, name: '제련', count: 1 },
    { id: 35012, name: '금속 변환', count: 1 },
  ],
  items: {
    1: ['검', 1],
    2: ['철괴', 1],
    3: ['가죽', 1],
    4: ['가죽(거래 불가)', 0],
    5: ['철광석', 1],
    6: ['광석 조각', 1],
  },
  recipes: [
    {
      item: 1,
      skill: 10016,
      rank: 7,
      yield: 1,
      materials: [
        [[2], 3],
        [[3, 4], 1],
      ],
    },
    { item: 2, skill: 10015, rank: 1, yield: 10, materials: [[[5], 2]] },
    { item: 5, skill: 35012, rank: 1, yield: 1, materials: [[[6], 3]] },
  ],
};

const book = buildRecipeBook(RAW);
const sword = book.recipesOf(1)[0];

function market(...offers: [price: number, count: number][]): PriceState {
  const price: MarketPrice = {
    offers: offers.map(([p, count]) => ({ price: p, count })),
    supply: offers.reduce((sum, [, count]) => sum + count, 0),
    complete: true,
  };
  return { status: 'ok', price };
}

function plan(
  prices: Record<number, PriceState>,
  options: { quantity?: number; methods?: Record<string, Method>; expanded?: string[] } = {},
) {
  return buildPlan({
    book,
    recipe: sword,
    // 공정 수와 상관없는 계산을 보므로 한 번으로 둔다.
    works: 1,
    quantity: options.quantity ?? 1,
    priceOf: (id) => prices[id],
    methods: options.methods ?? {},
    expanded: new Set(options.expanded ?? []),
  });
}

describe('quoteBuy', () => {
  it('싼 매물부터 필요한 개수만큼 채운다', () => {
    const state = market([100, 2], [150, 5]);
    if (state.status !== 'ok') throw new Error();
    expect(quoteBuy(state.price, 4)).toEqual({ cost: 2 * 100 + 2 * 150, filled: 4, lowest: 100 });
  });

  it('매물이 모자라면 채운 만큼만 값을 매긴다', () => {
    const state = market([100, 2]);
    if (state.status !== 'ok') throw new Error();
    expect(quoteBuy(state.price, 5)).toEqual({ cost: 200, filled: 2, lowest: 100 });
  });
});

describe('summarizeListings', () => {
  it('다른 이름과 0원 매물을 빼고 개당 가격순으로 둔다', () => {
    const listing = (name: string, price: number, count: number) => ({
      item_name: name,
      item_display_name: name,
      item_count: count,
      auction_item_category: '기타 재료',
      auction_price_per_unit: price,
      date_auction_expire: '',
    });
    const price = summarizeListings(
      [
        listing('철괴', 300, 1),
        listing('철괴', 0, 5),
        listing('강철괴', 10, 1),
        listing('철괴', 200, 3),
      ],
      '철괴',
      true,
    );
    expect(price.offers).toEqual([
      { price: 200, count: 3 },
      { price: 300, count: 1 },
    ]);
    expect(price.supply).toBe(4);
  });
});

describe('rankLabel', () => {
  it('게임의 랭크 표기로 바꾼다', () => {
    expect([0, 1, 6, 7, 15, 16, 18].map(rankLabel)).toEqual([
      '연습',
      'F',
      'A',
      '9랭크',
      '1랭크',
      '1단',
      '3단',
    ]);
  });
});

describe('buildPlan', () => {
  it('처음에는 직접 재료의 시세만 묻는다', () => {
    const result = plan({});
    // 거래 불가 가죽은 묻지 않는다. 철괴 아래 철광석은 펼치기 전까지 묻지 않는다.
    expect(result.needed.sort()).toEqual([2, 3]);
    expect(result.total.pending).toBe(2);
  });

  it('모두 살 수 있으면 사는 값의 합이 총액이다', () => {
    const result = plan({ 2: market([50, 10]), 3: market([400, 1]) }, { quantity: 2 });
    expect(result.crafts).toBe(2);
    expect(result.nodes.map((node) => [node.itemId, node.required, node.method])).toEqual([
      [2, 6, 'buy'],
      [3, 2, 'buy'],
    ]);
    // 가죽은 매물이 1개뿐이라 2개를 다 채우지 못한다.
    expect(result.total.gold).toBe(6 * 50 + 400);
    expect(result.total.short).toEqual([3]);
    expect(isComplete(result.total)).toBe(false);
  });

  it('매물이 없으면 만드는 쪽으로 가고, 한 번에 여러 개 나오는 것은 올려서 센다', () => {
    const result = plan(
      { 2: market(), 3: market([400, 1]), 5: market([30, 100]) },
      { quantity: 4 },
    );
    const ingot = result.nodes[0];
    expect(ingot.method).toBe(book.recipesOf(2)[0].index);
    // 철괴 12개 = 10개씩 두 번. 철광석은 2 x 2 = 4개.
    expect(ingot.crafts).toBe(2);
    expect(ingot.children?.map((child) => [child.itemId, child.required])).toEqual([[5, 4]]);
    // 철광석은 금속 변환으로만 만들 수 있어 더 내려가지 않는다.
    expect(ingot.children?.[0].recipes).toEqual([]);
    expect(result.shopping.map((row) => [row.itemId, row.required])).toEqual([
      [5, 4],
      [3, 4],
    ]);
  });

  it('고른 방법을 따르고, 사는 재료는 펼쳐도 값에 넣지 않는다', () => {
    const prices = { 2: market([50, 100]), 3: market([400, 5]), 5: market([1, 100]) };
    const viewing = plan(prices, { expanded: ['m0'] });
    expect(viewing.nodes[0].method).toBe('buy');
    expect(viewing.nodes[0].children).toHaveLength(1);
    expect(viewing.nodes[0].craftCost?.gold).toBe(2);
    expect(viewing.total.gold).toBe(3 * 50 + 400);

    const crafting = plan(prices, { methods: { m0: book.recipesOf(2)[0].index } });
    expect(crafting.total.gold).toBe(2 * 1 + 400);
  });

  it('칸에 거래 불가 대체품이 있으면 거래되는 쪽을 쓴다', () => {
    const result = plan({ 2: market([50, 10]), 3: market([400, 1]) });
    expect(result.nodes[1].itemId).toBe(3);
    expect(result.nodes[1].alternatives).toEqual([4]);
  });
});

describe('buildPlan 의 NPC 판매가', () => {
  it('NPC 가 파는 재료는 경매장을 묻지 않고 그 값에 모자람 없이 산다', () => {
    const result = buildPlan({
      book,
      recipe: sword,
      works: 1,
      quantity: 2,
      priceOf: () => undefined,
      methods: {},
      expanded: new Set(),
      npcPriceOf: (id) => (id === 3 ? 350 : undefined),
      preferNpc: true,
    });
    // 가죽은 NPC 값, 철괴는 아직 시세를 받는 중.
    expect(result.needed).toEqual([2]);
    expect(result.nodes[1].price).toEqual({ status: 'npc', unit: 350 });
    expect(result.nodes[1].quote).toEqual({ cost: 700, filled: 2, lowest: 350 });
    expect(result.total.gold).toBe(700);
    expect(result.total.pending).toBe(1);
  });

  it('거래 불가라도 NPC 가 팔면 살 수 있다', () => {
    const result = buildPlan({
      book,
      recipe: sword,
      works: 1,
      quantity: 1,
      priceOf: (id) => (id === 2 ? market([50, 10]) : market()),
      methods: {},
      expanded: new Set(),
      // 가죽(3)은 매물이 없고, 거래 불가 가죽(4)을 NPC 가 판다고 친다.
      npcPriceOf: (id) => (id === 4 ? 500 : undefined),
      preferNpc: true,
    });
    expect(result.nodes[1].itemId).toBe(4);
    expect(result.total.gold).toBe(3 * 50 + 500);
    expect(isComplete(result.total)).toBe(true);
  });

  it('줄마다 경매장과 NPC 가운데 고른 곳에서 산다', () => {
    const base = {
      book,
      recipe: sword,
      works: 1,
      quantity: 1,
      priceOf: (id: number) => (id === 2 ? market([50, 10]) : market([300, 5])),
      expanded: new Set<string>(),
      npcPriceOf: (id: number) => (id === 3 ? 350 : undefined),
    };
    // 기본은 NPC 인데 가죽 줄만 경매장으로 바꾼다.
    const auction = buildPlan({ ...base, preferNpc: true, methods: { m1: 'buy' } });
    expect(auction.nodes[1].method).toBe('buy');
    expect(auction.total.gold).toBe(3 * 50 + 300);
    // 기본은 경매장인데 가죽 줄만 NPC 로 바꾼다.
    const npc = buildPlan({ ...base, preferNpc: false, methods: { m1: 'npc' } });
    expect(npc.nodes[1].method).toBe('npc');
    expect(npc.nodes[1].npcUnit).toBe(350);
    expect(npc.total.gold).toBe(3 * 50 + 350);
    // NPC 목록이 없는 비교 계산에서는 NPC 를 고른 것이 무효라 경매장으로 돌아간다.
    const compare = buildPlan({ ...base, npcPriceOf: undefined, methods: { m1: 'npc' } });
    expect(compare.nodes[1].method).toBe('buy');
  });
});

describe('공정', () => {
  /**
   * 장갑(1)은 천옷만들기. 공정마다 옷감(2) 2개, 마무리에 실(3) 1개. 기준 7공정.
   * 장갑을 재료로 쓰는 상자(4)는 핸디크래프트라 공정이 한 번이다.
   */
  const workBook = buildRecipeBook({
    updated: '2026-09-26',
    skills: [
      { id: 10001, name: '천옷만들기', count: 1 },
      { id: 10013, name: '핸디크래프트', count: 1 },
    ],
    items: { 1: ['장갑', 1], 2: ['옷감', 1], 3: ['실', 1], 4: ['상자', 1] },
    recipes: [
      {
        item: 1,
        skill: 10001,
        rank: 6,
        yield: 1,
        materials: [[[2], 2]],
        finish: [[[3], 1]],
      },
      { item: 4, skill: 10013, rank: 1, yield: 1, materials: [[[1], 1]] },
    ],
  });
  const gloves = workBook.recipesOf(1)[0];
  const prices = { 1: market([5000, 9]), 2: market([10, 99]), 3: market([100, 9]) };
  const workPlan = (options: { recipe?: typeof gloves; works?: number; quantity?: number }) =>
    buildPlan({
      book: workBook,
      recipe: options.recipe ?? gloves,
      quantity: options.quantity ?? 1,
      works: options.works,
      priceOf: (id) => prices[id as 1 | 2 | 3],
      methods: {},
      expanded: new Set(),
    });

  it('작업 재료는 공정 수만큼, 마무리 재료는 한 번만 넣는다', () => {
    const result = workPlan({ quantity: 2 });
    const [cloth, thread] = result.nodes;
    // 옷감 2개 x 2벌 x 7공정, 실 1개 x 2벌
    expect(cloth.required).toBe(28);
    expect(cloth.perWork).toBe(4);
    expect(thread.required).toBe(2);
    expect(thread.perWork).toBeUndefined();
    expect(result.total.gold).toBe(28 * 10 + 2 * 100);
  });

  it('공정 재료와 마감 재료의 값을 따로 매긴다', () => {
    const result = workPlan({});
    expect(result.sections?.work.gold).toBe(14 * 10);
    expect(result.sections?.finish.gold).toBe(100);
    expect(result.total.gold).toBe(14 * 10 + 100);
  });

  it('마감 재료가 없는 제작법은 구역을 나누지 않는다', () => {
    expect(workPlan({ recipe: workBook.recipesOf(4)[0] }).sections).toBeUndefined();
  });

  it('고른 공정 수가 기준보다 먼저다', () => {
    expect(workPlan({ works: 3 }).nodes[0].required).toBe(6);
  });

  it('하위 재료로 만들 때는 기준 공정 수를 쓴다', () => {
    const box = workBook.recipesOf(4)[0];
    const result = buildPlan({
      book: workBook,
      recipe: box,
      quantity: 1,
      priceOf: (id) => prices[id as 1 | 2 | 3],
      methods: { m0: gloves.index },
      expanded: new Set(),
    });
    const glovesNode = result.nodes[0];
    expect(glovesNode.children?.map((child) => child.required)).toEqual([14, 1]);
  });
});
