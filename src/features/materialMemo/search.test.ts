import { describe, expect, it } from 'vitest';
import { buildNameIndex } from '@/features/auction/nameIndex';
import { resolveItemName, searchItemNames } from './search';

const index = buildNameIndex({
  updated: '2026-10-01',
  categories: ['무기', '기타'],
  items: [
    ['숏 소드', 0],
    ['주방장 숏 소드', 0],
    ['롱 소드', 0],
    ['철괴', 1],
  ],
});

/** 제작법 데이터에만 있는 이름. 경매장에 오른 적 없어 이름 사전에는 없다. */
const BOOK_ONLY = ['거래 불가 가죽', '철괴'];

describe('searchItemNames', () => {
  it('제작 여부와 상관없이 이름 사전의 아이템을 찾고 앞글자가 맞는 짧은 이름을 먼저 보인다', () => {
    expect(searchItemNames(index, BOOK_ONLY, '숏')).toEqual(['숏 소드', '주방장 숏 소드']);
  });

  it('띄어쓰기와 초성으로도 찾는다', () => {
    expect(searchItemNames(index, BOOK_ONLY, '롱소드')).toEqual(['롱 소드']);
    expect(searchItemNames(index, BOOK_ONLY, 'ㄹㅅㄷ')).toEqual(['롱 소드']);
  });

  it('제작법 데이터에만 있는 이름을 뒤에 붙이고 이미 나온 이름은 겹치지 않는다', () => {
    expect(searchItemNames(index, BOOK_ONLY, '가죽')).toEqual(['거래 불가 가죽']);
    expect(searchItemNames(index, BOOK_ONLY, '철괴')).toEqual(['철괴']);
  });

  it('이름 사전이 없어도 제작법 데이터의 이름은 찾는다', () => {
    expect(searchItemNames(null, BOOK_ONLY, '가죽')).toEqual(['거래 불가 가죽']);
  });

  it('입력이 비면 아무것도 보이지 않는다', () => {
    expect(searchItemNames(index, BOOK_ONLY, '  ')).toEqual([]);
  });
});

describe('resolveItemName', () => {
  it('이름이 정확히 맞는 아이템만 돌려준다', () => {
    expect(resolveItemName(index, BOOK_ONLY, '롱 소드')).toBe('롱 소드');
    expect(resolveItemName(index, BOOK_ONLY, '롱소드')).toBe('롱 소드');
    expect(resolveItemName(index, BOOK_ONLY, '롱')).toBeUndefined();
    expect(resolveItemName(index, BOOK_ONLY, '')).toBeUndefined();
  });

  it('제작법 데이터에만 있는 이름도 풀어 준다', () => {
    expect(resolveItemName(index, BOOK_ONLY, '거래 불가 가죽')).toBe('거래 불가 가죽');
    expect(resolveItemName(null, BOOK_ONLY, '거래불가가죽')).toBe('거래 불가 가죽');
  });
});
