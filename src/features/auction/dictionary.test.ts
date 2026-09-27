import { describe, expect, it } from 'vitest';
import { itemInfoPath, normalizeForSearch } from './dictionary';

describe('normalizeForSearch', () => {
  it('띄어쓰기를 무시한다', () => {
    expect(normalizeForSearch('숏 소드')).toBe(normalizeForSearch('숏소드'));
  });

  it('영문 대소문자를 무시한다', () => {
    expect(normalizeForSearch('Claymore')).toBe(normalizeForSearch('claymore'));
  });
});

describe('itemInfoPath', () => {
  it('이름은 경로에, 카테고리는 쿼리에 담는다', () => {
    expect(itemInfoPath('검', '롱 소드')).toBe(`/item/롱_소드?category=${encodeURIComponent('검')}`);
  });

  it('카테고리를 모르면 이름만 담는다', () => {
    expect(itemInfoPath('', '철광석')).toBe('/item/철광석');
  });
});
