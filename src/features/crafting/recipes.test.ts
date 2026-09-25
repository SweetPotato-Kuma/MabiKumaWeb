import { describe, expect, it } from 'vitest';
import {
  buildRecipeBook,
  materialSummary,
  ratioNote,
  recipeTitle,
  stationNote,
  type RawRecipeData,
} from './recipes';

/**
 * 요리 둘과 블랙스미스 하나.
 * - 마요네즈(1)는 달걀(2)과 올리브유(3)를 섞는다. 소금(4)이나 설탕(5)을 하나 더 넣을 수 있다.
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
    1: ['마요네즈', 1],
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
      materials: [
        [[2], 1, 79],
        [[3], 1, 21],
      ],
      extras: [
        [[4], 1],
        [[5], 1],
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

describe('요리 제작법', () => {
  it('재료는 한 개씩 쓰고 비율을 함께 가진다', () => {
    const [mayo] = book.recipesOf(1);
    expect(mayo.materials).toEqual([
      { ids: [2], count: 1, ratio: 79 },
      { ids: [3], count: 1, ratio: 21 },
    ]);
    expect(mayo.extras).toEqual([
      { ids: [4], count: 1 },
      { ids: [5], count: 1 },
    ]);
  });

  it('재료는 비율로, 추가 재료는 고를 수 있는 것으로 적는다', () => {
    expect(materialSummary(book, book.recipesOf(1)[0])).toBe(
      '달걀 79%, 올리브유 21% (+ 소금/설탕 중 하나)',
    );
  });

  it('상세 화면에는 비율과 더 넣을 수 있는 재료를 문장으로 적는다', () => {
    expect(ratioNote(book, book.recipesOf(1)[0])).toBe(
      '재료 비율: 달걀 79%, 올리브유 21%. 소금, 설탕 가운데 하나를 더 넣을 수 있습니다.',
    );
    expect(ratioNote(book, book.recipesOf(6)[0])).toBe('재료 비율: 달걀 100%');
    expect(ratioNote(book, book.recipesOf(7)[0])).toBe('');
  });

  it('조리 방법이 도구 자리에, 불이 설비 자리에 온다', () => {
    const [grill] = book.recipesOf(6);
    expect(recipeTitle(book, grill)).toBe('요리(굽기) F');
    expect(stationNote(grill)).toBe('설비: 불');
  });

  it('다른 스킬은 비율도 추가 재료도 없다', () => {
    const [sword] = book.recipesOf(7);
    expect(sword.materials).toEqual([{ ids: [8], count: 3 }]);
    expect(sword.extras).toEqual([]);
    expect(materialSummary(book, sword)).toBe('철괴 3');
  });
});
