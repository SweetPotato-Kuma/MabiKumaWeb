import { describe, expect, it } from 'vitest';
import {
  buildRecipeBook,
  cookingRatios,
  formatPercent,
  isCooking,
  materialSummary,
  materialUseText,
  materialUses,
  usesOfName,
  recipeTitle,
  stationNote,
  type RawRecipeData,
} from './recipes';

/**
 * 요리 둘과 블랙스미스 하나. 요리 재료의 셋째 값은 게임 데이터의 기준 값이다.
 * - 마요네즈(1)는 달걀(2) 75 와 올리브유(3) 20 을 섞는다. 소금(4) 10 이나 설탕(5) 5 를 하나 더 넣을 수 있다.
 * - 버터구이(6)는 불 앞에서 굽는다.
 * - 검(7)은 철괴(8) 3개로 만든다.
 */
const RAW: RawRecipeData = {
  updated: '2026-09-22',
  skills: [
    { id: 10020, name: '요리', count: 2 },
    { id: 10016, name: '블랙스미스', count: 1 },
  ],
  items: {
    1: ['마요네즈', 1, 'e7832c92811f1b93.png'],
    2: ['달걀', 1],
    3: ['올리브유', 1],
    4: ['소금', 1],
    5: ['설탕', 1],
    6: ['버터구이', 1],
    7: ['검', 1],
    8: ['철괴', 1],
  },
  recipes: [
    {
      item: 1,
      skill: 10020,
      rank: 0,
      yield: 1,
      tool: '혼합',
      exp: 100,
      materials: [
        [[2], 1, 75],
        [[3], 1, 20],
      ],
      extras: [
        [[4], 1, 10],
        [[5], 1, 5],
      ],
    },
    {
      item: 6,
      skill: 10020,
      rank: 1,
      yield: 1,
      tool: '굽기',
      station: '불',
      materials: [[[2], 1, 100]],
    },
    { item: 7, skill: 10016, rank: 7, yield: 1, materials: [[[8], 3]] },
  ],
};

const book = buildRecipeBook(RAW);
const [mayo] = book.recipesOf(1);
const [grill] = book.recipesOf(6);
const [sword] = book.recipesOf(7);

const summarize = (extra?: number) =>
  cookingRatios(mayo, extra).map((step) => [
    book.itemName(step.slot.ids[0]),
    step.percent,
    step.cumulative,
  ]);

describe('요리 제작법', () => {
  it('재료는 한 개씩 쓰고 기준 값과 경험치를 가진다', () => {
    expect(isCooking(mayo)).toBe(true);
    expect(mayo.materials).toEqual([
      { ids: [2], count: 1, amount: 75 },
      { ids: [3], count: 1, amount: 20 },
    ]);
    expect(mayo.extras).toEqual([
      { ids: [4], count: 1, amount: 10 },
      { ids: [5], count: 1, amount: 5 },
    ]);
    expect(mayo.exp).toBe(100);
  });

  it('비율은 기준 값의 합에 대한 몫이고, 게이지 자리는 앞 재료부터 쌓는다', () => {
    // 75 / 95 = 78.947..., 20 / 95 = 21.052... 잘린 나머지가 큰 올리브유에 0.1 을 준다.
    expect(summarize()).toEqual([
      ['달걀', 78.9, 78.9],
      ['올리브유', 21.1, 100],
    ]);
  });

  it('추가 재료를 넣으면 모든 비율이 다시 나뉜다', () => {
    expect(summarize(0)).toEqual([
      ['달걀', 71.4, 71.4],
      ['올리브유', 19.1, 90.5],
      ['소금', 9.5, 100],
    ]);
    expect(cookingRatios(mayo, 0).map((step) => step.extra)).toEqual([false, false, true]);
  });

  it('비율은 소수점 아래가 0 이면 떼고 적는다', () => {
    expect(formatPercent(85)).toBe('85%');
    expect(formatPercent(78.9)).toBe('78.9%');
  });

  it('목록에는 재료를 비율로, 추가 재료는 고를 수 있는 것으로 적는다', () => {
    expect(materialSummary(book, mayo)).toBe('달걀 78.9%, 올리브유 21.1% (+ 소금/설탕 중 하나)');
    expect(materialSummary(book, grill)).toBe('달걀 100%');
  });

  it('조리 방법이 도구 자리에, 불이 설비 자리에 온다', () => {
    expect(recipeTitle(book, grill)).toBe('요리(굽기) F');
    expect(stationNote(grill)).toBe('설비: 불');
  });

  it('그림 파일 이름이 적힌 아이템만 그림을 안다', () => {
    expect(book.iconOf(1)).toBe('e7832c92811f1b93.png');
    expect(book.iconOf(2)).toBeUndefined();
  });

  it('다른 스킬은 기준 값도 추가 재료도 없다', () => {
    expect(isCooking(sword)).toBe(false);
    expect(sword.materials).toEqual([{ ids: [8], count: 3 }]);
    expect(sword.extras).toEqual([]);
    expect(materialSummary(book, sword)).toBe('철괴 3');
  });
});

describe('제작 가능 아이템', () => {
  const book = buildRecipeBook(RAW);

  it('재료로 쓰는 제작법을 거꾸로 찾는다', () => {
    // 달걀(2)은 마요네즈와 버터구이에, 철괴(8)는 검에 들어간다.
    expect(book.usedIn(2).map((recipe) => book.itemName(recipe.item))).toEqual(['마요네즈', '버터구이']);
    expect(book.usedIn(8).map((recipe) => book.itemName(recipe.item))).toEqual(['검']);
    expect(book.usedIn(7)).toEqual([]);
  });

  it('요리의 골라 넣는 재료도 쓰임새로 센다', () => {
    expect(usesOfName(book, '소금').map((recipe) => book.itemName(recipe.item))).toEqual(['마요네즈']);
  });

  it('들어가는 자리를 한 줄로 적는다', () => {
    const [mayo] = book.usedIn(2);
    const [sword] = book.usedIn(8);
    // 마요네즈의 달걀은 75 / (75 + 20) = 78.9%
    expect(materialUseText(mayo, materialUses(mayo, [2]))).toBe('비율 78.9%');
    expect(materialUseText(mayo, materialUses(mayo, [4]))).toBe('골라 넣는 재료');
    // 블랙스미스는 공정마다 작업 재료를 다시 넣는다.
    expect(materialUseText(sword, materialUses(sword, [8]))).toBe('공정마다 3개');
  });
});
