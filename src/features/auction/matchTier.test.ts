import { describe, expect, it } from 'vitest';
import { matchTier } from './matchTier';

describe('matchTier', () => {
  it('띄어쓰기를 빼고 이름 전체가 같으면 정확히 일치다', () => {
    expect(matchTier('소울 리버레이트 보우', '소울리버레이트 보우')).toBe(0);
    expect(matchTier('소울 리버레이트 보우', '소울 리버레이트 보우')).toBe(0);
    expect(matchTier('Hunter Bow', 'hunterbow')).toBe(0);
  });

  it('이름이 검색어로 시작하면 앞부분 일치다', () => {
    expect(matchTier('소울 리버레이트 보우', '소울')).toBe(1);
  });

  it('검색어가 이름 가운데에 그대로 들어 있으면 부분 일치다', () => {
    expect(matchTier('창백한 명사수 소울 리버레이트 보우', '소울 리버레이트 보우')).toBe(2);
  });

  it('검색어의 단어가 흩어져 있기만 하면 가장 낮다', () => {
    // 이슈에서 보고된 경우. 단어 "소울리버레이트" 와 "보우" 가 따로 걸리는 크로스보우다.
    expect(matchTier('창백한 명사수 소울 리버레이트 크로스보우', '소울리버레이트 보우')).toBe(3);
  });

  it('같은 검색어에서 정확히 일치가 먼저 온다', () => {
    const names = [
      '창백한 명사수 소울 리버레이트 크로스보우',
      '소울 리버레이트 보우 강화형',
      '창백한 소울 리버레이트 보우',
      '소울 리버레이트 보우',
    ];
    const sorted = [...names].sort((a, b) => matchTier(a, '소울리버레이트 보우') - matchTier(b, '소울리버레이트 보우'));

    expect(sorted).toEqual([
      '소울 리버레이트 보우',
      '소울 리버레이트 보우 강화형',
      '창백한 소울 리버레이트 보우',
      '창백한 명사수 소울 리버레이트 크로스보우',
    ]);
  });

  it('검색어가 비면 견줄 것이 없어 모두 0 이다', () => {
    expect(matchTier('아무 이름', '')).toBe(0);
    expect(matchTier('아무 이름', '  ')).toBe(0);
  });

  it('쉼표로 나눈 단어도 붙여서 견준다', () => {
    expect(matchTier('숏 소드', '숏,소드')).toBe(0);
  });
});
