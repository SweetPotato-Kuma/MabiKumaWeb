import { describe, expect, it } from 'vitest';
import { buildRecipeBook } from '@/features/crafting/recipes';
import { beadsToMake, mainCoinOf } from './subBeads';

const book = buildRecipeBook({
  updated: '2026-09-22',
  skills: [{ id: 10013, name: '핸디크래프트', count: 1 }],
  items: {
    1: ['소울', 1],
    2: ['순도 높은 힘의 결정', 1],
    4: ['깨어난 힘의 정수', 1],
    5: ['깨어난 힘의 정수(거래 불가)', 0],
    6: ['갑옷', 1],
    7: ['빛바랜 에너지 회로', 1],
  },
  recipes: [
    { item: 1, skill: 10013, rank: 7, yield: 1, materials: [[[2], 2]] },
    { item: 2, skill: 10013, rank: 1, yield: 1, materials: [[[4, 5], 20]] },
    { item: 6, skill: 10013, rank: 7, yield: 1, materials: [[[7], 2]] },
  ],
});

describe('구슬 하위 재료', () => {
  it('트리에서 살 수 있는 재료가 가장 많은 코인이 그 물건의 코인이다', () => {
    expect(mainCoinOf(book, book.recipesOf(1)[0])).toBe('브리 레흐 구슬');
    expect(mainCoinOf(book, book.recipesOf(6)[0])).toBe('탈라 가흐 구슬');
  });

  it('하위 재료를 만들 때 드는 고른 코인의 개수를 센다', () => {
    expect(beadsToMake(book, '브리 레흐 구슬', 2, 2)).toBe(200);
    expect(beadsToMake(book, '탈라 가흐 구슬', 2, 2)).toBe(0);
  });
});
