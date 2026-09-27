import { describe, expect, it } from 'vitest';
import { rankText as appRankText } from '@/features/crafting/recipes';
import { collectItemPages, objectParticle, rankText, renderItemBody } from './item-pages.mjs';

const names = { categories: ['검', '포션'], items: [['롱 소드', 0], ['철괴', 0], ['철괴', 1]] as [string, number][] };
const recipes = {
  skills: [{ id: 1, name: '블랙스미스' }],
  items: { '10': ['롱 소드', 1], '20': ['철괴', 1], '30': ['목탄', 1], '31': ['숯', 1] },
  recipes: [{ item: 10, skill: 1, rank: 8, yield: 1, materials: [[[20], 5], [[30, 31], 2]] }],
} as never;

describe('아이템 쪽 굽기', () => {
  it('이름마다 한 쪽이고, 여러 카테고리면 사전에 먼저 적힌 것을 쓴다', () => {
    const pages = collectItemPages(names, recipes);
    expect(pages.map((page) => page.name)).toEqual(['롱 소드', '철괴']);
    expect(pages[1]).toMatchObject({ category: '검', categories: ['검', '포션'], slug: '철괴' });
  });

  it('제작 재료와 재료로 쓰이는 곳을 모은다', () => {
    const [sword, ingot] = collectItemPages(names, recipes);
    expect(sword.crafts).toEqual([
      { skill: '블랙스미스 8랭크', materials: ['철괴 5개', '목탄 등 2개'], yield: 1 },
    ]);
    expect(ingot.usedIn).toEqual(['롱 소드']);
  });

  it('본문에 이름과 제목을 적고 사전에 있는 아이템만 링크로 건다', () => {
    const [, ingot] = collectItemPages(names, recipes);
    const body = renderItemBody(ingot, {
      siteName: '마비쿠마',
      itemPath: (name) => `/item/${name}`,
      known: new Set(['롱 소드']),
    });
    expect(body).toContain('<h1>철괴</h1>');
    expect(body).toContain('철괴를 재료로 쓰는 아이템');
    expect(body).toContain('<a href="/item/롱 소드">롱 소드</a>');
  });

  it('랭크 표기가 앱과 같다', () => {
    for (let rank = 0; rank <= 20; rank += 1) expect(rankText(rank)).toBe(appRankText(rank));
  });

  it('받침에 따라 을과 를을 고른다', () => {
    expect(objectParticle('철괴')).toBe('를');
    expect(objectParticle('목탄')).toBe('을');
    expect(objectParticle('Potion')).toBe('을(를)');
  });
});
