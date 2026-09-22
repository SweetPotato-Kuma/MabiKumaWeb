import { describe, expect, it } from 'vitest';
import { matchItemNames, normalizeForSearch } from './dictionary';

const NAMES = ['숏 소드', '롱 소드', '스파타', '클레이모어', '검은 숏 소드'];

describe('normalizeForSearch', () => {
  it('띄어쓰기를 무시한다', () => {
    expect(normalizeForSearch('숏 소드')).toBe(normalizeForSearch('숏소드'));
  });

  it('영문 대소문자를 무시한다', () => {
    expect(normalizeForSearch('Claymore')).toBe(normalizeForSearch('claymore'));
  });
});

describe('matchItemNames', () => {
  it('띄어쓰기 없이 쳐도 찾는다', () => {
    expect(matchItemNames(NAMES, '숏소드')).toContain('숏 소드');
  });

  it('앞글자가 맞는 이름을 먼저 준다', () => {
    const matched = matchItemNames(NAMES, '숏');

    expect(matched[0]).toBe('숏 소드');
    expect(matched).toContain('검은 숏 소드');
  });

  it('검색어가 비면 앞에서부터 보여 준다', () => {
    expect(matchItemNames(NAMES, '', 2)).toEqual(['숏 소드', '롱 소드']);
  });

  it('맞는 이름이 없으면 빈 목록을 준다', () => {
    expect(matchItemNames(NAMES, '없는아이템')).toEqual([]);
  });

  it('상한을 넘겨 주지 않는다', () => {
    expect(matchItemNames(NAMES, '소드', 2)).toHaveLength(2);
  });
});
