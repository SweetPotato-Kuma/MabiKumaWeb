import { describe, expect, it } from 'vitest';
import { buildNameIndex, planKeywordSearch, resolveSearch, searchKeyOf, searchNames, toInitials } from './nameIndex';

const index = buildNameIndex({
  updated: '2026-09-23',
  categories: ['검', '둔기', '천옷', '음식'],
  items: [
    ['주방장 숏 소드', 0],
    ['숏 소드', 0],
    ['롱 소드', 0],
    ['숏 소드 오브 저지먼트', 0],
    ['메이스', 1],
    ['숏 소드', 1],
    ['코레스 셔츠', 2],
    ['향기로운 꿀 우유', 3],
    ['우유', 3],
    ['딸기우유', 3],
    ['우유식빵', 3],
  ],
});

const names = (keyword: string, category?: string) =>
  searchNames(index, keyword, { category }).map((item) => item.name);

describe('toInitials', () => {
  it('한글 음절은 초성으로, 나머지는 그대로 둔다', () => {
    expect(toInitials('숏소드2')).toBe('ㅅㅅㄷ2');
  });
});

describe('searchNames', () => {
  it('앞글자가 맞는 것을 먼저, 그 안에서는 짧은 이름을 먼저 준다', () => {
    expect(names('숏')).toEqual(['숏 소드', '숏 소드 오브 저지먼트', '주방장 숏 소드']);
  });

  it('띄어쓰기를 무시한다', () => {
    expect(names('숏소드')).toContain('숏 소드');
    expect(names('롱 소 드')).toEqual(['롱 소드']);
  });

  it('자음만 치면 초성으로 찾는다', () => {
    expect(names('ㅅㅅㄷ')).toEqual(['숏 소드', '숏 소드 오브 저지먼트', '주방장 숏 소드']);
    expect(names('ㅁㅇㅅ')).toEqual(['메이스']);
  });

  it('조립 중인 낱자가 끝에 붙어도 목록이 비지 않는다', () => {
    expect(names('숏ㅅ')).toEqual(names('숏'));
  });

  it('같은 이름은 한 번만 보여 주고 관측된 카테고리를 모두 알린다', () => {
    const shortSword = searchNames(index, '숏 소드').find((item) => item.name === '숏 소드');
    expect(names('숏 소드').filter((name) => name === '숏 소드')).toHaveLength(1);
    expect(shortSword?.categories).toEqual(['검', '둔기']);
  });

  it('카테고리를 고르면 그 안에서만 찾는다', () => {
    expect(names('소드', '둔기')).toEqual(['숏 소드']);
    expect(names('셔츠', '검')).toEqual([]);
  });

  it('전체에서 빈 입력은 비우고, 카테고리를 골랐으면 앞에서부터 보여 준다', () => {
    expect(names('')).toEqual([]);
    expect(names('', '천옷')).toEqual(['코레스 셔츠']);
  });

  it('인덱스에 없는 카테고리는 아무것도 주지 않는다', () => {
    expect(names('숏', '없는 카테고리')).toEqual([]);
  });

  it('개수를 자른다', () => {
    expect(searchNames(index, '소드', { limit: 2 })).toHaveLength(2);
  });
});

describe('resolveSearch', () => {
  const all = (keyword: string) => resolveSearch(index, { keyword, category: '' });

  it('검색어는 그대로 두고, 걸리는 이름을 모두 찾을 검색어를 붙인다', () => {
    expect(all('우유')).toEqual({
      keyword: '우유',
      category: '',
      keywords: ['우유', '딸기우유', '우유식빵'],
      keywordsTruncated: false,
    });
  });

  it('붙여 쓴 이름 일부는 이름의 띄어쓰기대로 보낸다', () => {
    expect(all('꿀우유')).toMatchObject({ keyword: '꿀우유', category: '', keywords: ['꿀 우유'] });
    expect(all('롱소드')).toMatchObject({ keyword: '롱소드', keywords: ['롱 소드'] });
  });

  it('전체에서 초성은 사전에서 가장 맞는 이름으로 바꾼다', () => {
    expect(all('ㅅㅅㄷ')).toMatchObject({ keyword: '숏 소드', category: '', keywords: ['숏,소드'] });
  });

  it('조립 중인 끝 낱자를 뗀다', () => {
    expect(all('숏ㅅ')).toMatchObject({ keyword: '숏', keywords: ['숏'] });
  });

  it('초성에 맞는 이름이 없으면 보내지 않는다', () => {
    expect(all('ㅎㅎㅎ')).toBeNull();
  });

  it('사전에 없는 말은 입력 그대로 보낸다', () => {
    expect(all('충격의')).toEqual({ keyword: '충격의', category: '' });
  });

  it('카테고리를 골랐으면 검색어를 바꾸지 않는다. 초성은 목록에서 거른다', () => {
    expect(resolveSearch(index, { keyword: 'ㅅㅅㄷ', category: '검' })).toEqual({ keyword: 'ㅅㅅㄷ', category: '검' });
    expect(resolveSearch(index, { keyword: '숏ㅅ', category: '검' })).toEqual({ keyword: '숏', category: '검' });
  });

  it('사전을 아직 못 받았으면 글자는 그대로 보내고 초성은 막는다', () => {
    expect(resolveSearch(null, { keyword: '숏소드', category: '' })).toEqual({ keyword: '숏소드', category: '' });
    expect(resolveSearch(null, { keyword: 'ㅅㅅㄷ', category: '' })).toBeNull();
  });
});

describe('searchKeyOf', () => {
  it('걸친 단어를 통째로 잘라 이름의 띄어쓰기대로 돌려준다', () => {
    expect(searchKeyOf('향기로운 꿀 우유', ['꿀우유'])).toBe('꿀 우유');
    expect(searchKeyOf('향기로운 꿀 우유', ['기로'])).toBe('향기로운');
    expect(searchKeyOf('딸기우유', ['우유'])).toBe('딸기우유');
  });

  it('단어가 여럿이면 쉼표로 잇고, 하나라도 없으면 null', () => {
    expect(searchKeyOf('숏 소드 오브 저지먼트', ['숏', '저지'])).toBe('숏,저지먼트');
    expect(searchKeyOf('숏 소드', ['숏', '저지'])).toBeNull();
  });

  it('경매장 이름 앞의 @ 는 떼고 본다', () => {
    expect(searchKeyOf('@딸기우유', ['우유'])).toBe('딸기우유');
  });
});

describe('planKeywordSearch', () => {
  it('이름을 많이 묶는 검색어부터 정해진 수까지만 보내고, 넘치면 알린다', () => {
    const many = buildNameIndex({
      updated: '2026-09-25',
      categories: ['기타'],
      items: Array.from({ length: 12 }, (_, i) => [`가${i}나`, 0] as [string, number]).concat([['가 나', 0], ['가 다', 0]]),
    });
    const plan = planKeywordSearch(many, ['가']);
    expect(plan?.keywords[0]).toBe('가');
    expect(plan?.keywords).toHaveLength(8);
    expect(plan?.keywordsTruncated).toBe(true);
  });

  it('걸리는 이름이 없으면 null', () => {
    expect(planKeywordSearch(index, ['없는이름'])).toBeNull();
  });
});
