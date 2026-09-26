import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { RecipeInfo } from '@/components/crafting/RecipeInfo';
import { buildRecipeBook } from '@/features/crafting/recipes';

/**
 * 고구마 맛탕(1) = 고구마(2) 85 + 설탕(3) 15. 튀기기는 불 앞에서 A랭크부터 쓴다.
 * 철괴(4)는 제련으로 한 번에 10개가 나온다. 제련은 설명이 없는 스킬로 둔다.
 */
const book = buildRecipeBook({
  updated: '2026-09-22',
  skills: [
    {
      id: 10020,
      name: '요리',
      count: 1,
      category: '생활',
      desc: '여러 가지 음식 재료로 요리를 만든다.',
    },
    { id: 10015, name: '제련', count: 1, category: '생활' },
  ],
  items: {
    1: ['고구마 맛탕', 1],
    2: ['고구마', 1],
    3: ['설탕', 1],
    4: ['철괴', 1],
    5: ['철광석', 1],
  },
  recipes: [
    {
      item: 1,
      skill: 10020,
      rank: 6,
      yield: 1,
      tool: '튀기기',
      station: '불',
      exp: 1700,
      materials: [
        [[2], 1, 85],
        [[3], 1, 15],
      ],
    },
    { item: 4, skill: 10015, rank: 7, yield: 10, materials: [[[5], 2]] },
  ],
});

/** Descriptions 의 칸마다 [이름, 값]. */
function rows() {
  return [...document.querySelectorAll('.ant-descriptions-item')].map((item) => [
    item.querySelector('.ant-descriptions-item-label')?.textContent,
    item.querySelector('.ant-descriptions-item-content')?.textContent,
  ]);
}

describe('제작법의 스킬과 조건', () => {
  it('요리는 스킬, 분류와 조리 방법, 랭크, 설비, 경험치를 적는다', () => {
    render(
      <AppProviders>
        <RecipeInfo book={book} recipe={book.recipesOf(1)[0]} />
      </AppProviders>,
    );

    expect(screen.getByText('요리')).toBeTruthy();
    expect(screen.getByText('생활 스킬')).toBeTruthy();
    expect(screen.queryByText('여러 가지 음식 재료로 요리를 만든다.')).toBeNull();
    expect(rows()).toEqual([
      ['조리 방법', '튀기기'],
      ['필요 랭크', 'A랭크'],
      ['필요 설비', '불'],
      ['생산 개수', '1개'],
      ['요리 경험치', '1,700'],
    ]);
  });

  it('없는 조건은 빼고 적는다', () => {
    render(
      <AppProviders>
        <RecipeInfo book={book} recipe={book.recipesOf(4)[0]} />
      </AppProviders>,
    );

    expect(rows()).toEqual([
      ['필요 랭크', '9랭크'],
      ['생산 개수', '10개'],
    ]);
  });
});
