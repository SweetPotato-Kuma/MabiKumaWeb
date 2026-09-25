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
  it('카테고리와 이름을 주소에 담는다', () => {
    expect(itemInfoPath('검', '롱 소드')).toBe(
      `/items?category=${encodeURIComponent('검')}&name=${encodeURIComponent('롱 소드')}`,
    );
  });
});
