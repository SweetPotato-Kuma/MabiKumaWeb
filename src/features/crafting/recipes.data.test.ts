/**
 * 실제 제작법 데이터 검사.
 *
 * 다른 사이트에서 받아 온 게임 데이터 파일을 그대로 읽어 검사한다. 그 사이트가 막거나 형식을 바꾸면 우리 코드와
 * 상관없이 깨지므로, 기본 시험(npm test, 배포와 동기화)에서는 빼고 `npm run test:data` 로 따로 돌린다.
 * 데이터를 우리 쪽으로 옮기면 다시 기본 시험에 넣는다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRecipeBook, usesOfName, type RawRecipeData } from './recipes';

describe('실제 제작법 데이터', () => {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), '.cache/game-data/current/recipes.json'), 'utf8'),
  ) as RawRecipeData;
  const book = buildRecipeBook(raw);

  it('랑그히리스 아머는 더스크바운드 비고러스 아머로 만들지 않는다', () => {
    const usedBy = [
      '더스크바운드 비고러스 아머(남성용)',
      '더스크바운드 비고러스 아머(여성용)',
    ].flatMap((name) => usesOfName(book, name).map((recipe) => book.itemName(recipe.item)));
    expect(usedBy.filter((name) => name.includes('랑그히리스'))).toEqual([]);
  });

  it('랑그히리스 아머의 기반 장비는 같은 계열의 아머다', () => {
    const armors = ['랑그히리스 체이서 아머 (남성용)', '랑그히리스 체이서 아머 (여성용)'];
    for (const name of armors) {
      const recipes = book.idsByName(name).flatMap((id) => book.recipesOf(id));
      expect(recipes.length).toBeGreaterThan(0);
      for (const recipe of recipes) {
        const names = recipe.materials[0].ids.map((id) => book.itemName(id));
        expect(names.filter((base) => base.includes('더스크바운드'))).toEqual([]);
      }
    }
  });
});
