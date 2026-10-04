import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DUCAT_GEM,
  DUCAT_ITEMS,
  FARM_ORDERS,
  FARM_PRICE_NAMES,
  FARM_RECIPES,
  REWARD_ITEMS,
  shortName,
} from './data';
import { byGainDesc, ducatOutcome, goldPerDucat, materialsTotal, orderOutcome, recipeOutcome } from './value';

const P = '탈틴 농장 ';

const prices: Record<string, number> = {
  [`${P}일반 블랙베리`]: 1_000,
  [`${P}일반 재스민`]: 2_000,
  [`${P}블랙베리 주스`]: 5_000,
  [`${P}일반 석영`]: 3_000,
  [DUCAT_GEM.name]: 70_000,
};
const quote = (name: string) => prices[name] ?? null;

describe('탈틴 농장 데이터', () => {
  it('주문 32종, 가공품 20종, 두카트 물품 47종이다', () => {
    expect(FARM_ORDERS).toHaveLength(32);
    expect(FARM_RECIPES).toHaveLength(20);
    expect(DUCAT_ITEMS).toHaveLength(47);
    expect(new Set(FARM_ORDERS.map((order) => order.name)).size).toBe(32);
    expect(new Set(DUCAT_ITEMS.map((item) => item.name)).size).toBe(47);
  });

  it('등급별 농작물의 두카트가 제자리에 들어간다', () => {
    const ducatsOf = (name: string) => DUCAT_ITEMS.find((item) => item.name === name)?.ducats;
    expect(ducatsOf(`${P}일반 블랙베리`)).toBe(600);
    expect(ducatsOf(`${P}고급 황금 호박`)).toBe(18_000);
    expect(ducatsOf(`${P}최고급 마법 거미줄`)).toBe(6_800);
    expect(ducatsOf(`${P}이브닝 드레스`)).toBe(25_000);
  });

  it('가공품은 모두 두카트 목록에 있고, 주문의 물품은 농작물이거나 가공품이다', () => {
    const ducatNames = new Set(DUCAT_ITEMS.map((item) => item.name));
    const recipeNames = new Set(FARM_RECIPES.map((recipe) => recipe.name));
    for (const recipe of FARM_RECIPES) expect(ducatNames).toContain(recipe.name);
    for (const order of FARM_ORDERS)
      for (const [name] of order.materials) expect(ducatNames.has(name) || recipeNames.has(name)).toBe(true);
  });

  it('시세를 묻는 이름이 모두 아이템 사전에 있다', () => {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/items/names.json'), 'utf8')) as {
      items: [string, number][];
    };
    const known = new Set(raw.items.map(([name]) => name));
    expect(FARM_PRICE_NAMES.filter((name) => !known.has(name))).toEqual([]);
  });

  it('목록 안에서는 "탈틴 농장" 을 뗀다', () => {
    expect(shortName(`${P}일반 블랙베리`)).toBe('일반 블랙베리');
    expect(shortName(DUCAT_GEM.name)).toBe(DUCAT_GEM.name);
  });
});

describe('materialsTotal', () => {
  it('개당 시세에 개수를 곱해 더한다', () => {
    expect(
      materialsTotal(
        [
          [`${P}일반 블랙베리`, 7],
          [`${P}일반 재스민`, 5],
        ],
        quote,
      ),
    ).toBe(17_000);
  });

  it('하나라도 시세를 모르면 null 이다', () => {
    expect(
      materialsTotal(
        [
          [`${P}일반 블랙베리`, 1],
          [`${P}일반 고무`, 1],
        ],
        quote,
      ),
    ).toBeNull();
  });
});

describe('orderOutcome', () => {
  const order = FARM_ORDERS[0]; // 블랙베리 7, 재스민 5 → 17,000

  it('보상 가치에서 물품 값을 뺀다', () => {
    const outcome = orderOutcome(order, [{ key: 'key', qty: 1 }], REWARD_ITEMS, {}, quote);
    expect(outcome).toEqual({ cost: 17_000, reward: 25_000, profit: 8_000 });
  });

  it('보상 두 칸을 더하고, 고친 보상 가치를 쓴다', () => {
    const outcome = orderOutcome(
      order,
      [
        { key: 'brick', qty: 2 },
        { key: 'glass', qty: 1 },
      ],
      REWARD_ITEMS,
      { brick: 5_000 },
      quote,
    );
    expect(outcome.reward).toBe(2 * 5_000 + 40_000);
    expect(outcome.profit).toBe(50_000 - 17_000);
  });

  it('보상을 고르지 않았으면 보상 가치와 손익이 없다', () => {
    expect(orderOutcome(order, [], REWARD_ITEMS, {}, quote)).toEqual({ cost: 17_000, reward: null, profit: null });
  });
});

describe('recipeOutcome', () => {
  it('가공품 값에서 농작물 값을 뺀다', () => {
    const juice = FARM_RECIPES.find((recipe) => recipe.name === `${P}블랙베리 주스`)!;
    expect(recipeOutcome(juice, quote)).toEqual({ raw: 3_000, crafted: 5_000, gain: 2_000 });
  });

  it('가공품 시세를 모르면 차익이 없다', () => {
    const earring = FARM_RECIPES.find((recipe) => recipe.name === `${P}레드문 귀걸이`)!;
    expect(recipeOutcome(earring, quote).gain).toBeNull();
  });
});

describe('두카트', () => {
  it('두카트 1개 값은 티어드롭 젬스톤 값을 35,000 으로 나눈 것이다', () => {
    expect(goldPerDucat(70_000)).toBe(2);
    expect(goldPerDucat(null)).toBeNull();
  });

  it('두카트로 받는 값에서 경매장 판매가를 빼고, 골드는 반올림한다', () => {
    const blackberry = DUCAT_ITEMS.find((item) => item.name === `${P}일반 블랙베리`)!;
    expect(ducatOutcome(blackberry, 2, quote)).toEqual({ market: 1_000, exchanged: 1_200, gain: 200 });
    expect(ducatOutcome(blackberry, 1.0004, quote).exchanged).toBe(600);
    expect(ducatOutcome(blackberry, null, quote).gain).toBeNull();
  });
});

describe('byGainDesc', () => {
  it('큰 것부터, 모르는 것은 맨 뒤', () => {
    expect([3, null, 10, -5].sort(byGainDesc)).toEqual([10, 3, -5, null]);
  });
});
