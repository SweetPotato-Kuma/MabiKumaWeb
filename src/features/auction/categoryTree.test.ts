import { describe, expect, it } from 'vitest';
import { AUCTION_ITEM_CATEGORIES } from './constants';
import {
  CATEGORY_GROUPS,
  GROUPED_CATEGORIES,
  allTreeKeys,
  findGroupOf,
  findUngroupedCategories,
  groupKeyOf,
  isGroupKey,
} from './categoryTree';

/**
 * 묶음은 화면 편의일 뿐이라 API 스펙이 늘어나도 자동으로 따라오지 않는다.
 * 잎이 빠지거나 겹치면 사용자는 그 카테고리에 영영 닿지 못하므로 여기서 잡는다.
 */
describe('경매장 카테고리 묶음', () => {
  it('같은 카테고리를 두 묶음에 넣지 않는다', () => {
    const seen = new Set<string>();
    const duplicated: string[] = [];

    for (const category of GROUPED_CATEGORIES) {
      if (seen.has(category)) duplicated.push(category);
      seen.add(category);
    }

    expect(duplicated).toEqual([]);
  });

  it('API 스펙에 없는 카테고리를 지어내지 않는다', () => {
    const known = new Set<string>(AUCTION_ITEM_CATEGORIES);
    const unknown = GROUPED_CATEGORIES.filter((category) => !known.has(category));

    expect(unknown).toEqual([]);
  });

  it('API 카테고리를 하나도 빠뜨리지 않는다', () => {
    expect(findUngroupedCategories()).toEqual([]);
  });

  it('트리 키가 하나도 겹치지 않는다', () => {
    /**
     * '액세서리', '토템', '기타' 는 묶음 이름이자 실제 카테고리 이름이다.
     * 접두사 없이 키를 만들면 묶음을 펼치는 것과 잎을 고르는 것이 같은 키가 된다.
     */
    const keys = allTreeKeys();

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('묶음 키는 잎 키와 구분된다', () => {
    const leaves = new Set<string>(AUCTION_ITEM_CATEGORIES);

    for (const group of CATEGORY_GROUPS) {
      expect(isGroupKey(groupKeyOf(group.name))).toBe(true);
      expect(leaves.has(groupKeyOf(group.name))).toBe(false);
    }

    for (const category of GROUPED_CATEGORIES) {
      expect(isGroupKey(category)).toBe(false);
    }
  });

  it('카테고리로 묶음을 되찾을 수 있다', () => {
    expect(findGroupOf('검')).toBe('근거리 장비');
    expect(findGroupOf('허브')).toBe('소모품');
    expect(findGroupOf('유물')).toBe('특수 장비');
    expect(findGroupOf('없는 카테고리')).toBeUndefined();
  });
});
