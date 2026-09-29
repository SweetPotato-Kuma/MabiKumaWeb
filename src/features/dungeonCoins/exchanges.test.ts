import { describe, expect, it } from 'vitest';
import { coinPurchasesOf } from './exchanges';

describe('코인으로 살 수 있는 곳', () => {
  it('교환품 하나에 드는 코인을 이름으로 찾는다', () => {
    expect(coinPurchasesOf('빛바랜 에너지 회로')).toEqual([{ coin: '탈라 가흐 구슬', cost: 35 }]);
  });

  it('여러 NPC 가 파는 아이템은 모두 돌려준다', () => {
    expect(coinPurchasesOf('깨어난 힘의 정수')).toEqual([
      { coin: '브리 레흐 구슬', cost: 5 },
      { coin: '심연의 증표', cost: 10 },
    ]);
  });

  it('코인으로 살 수 없으면 빈 배열이다', () => {
    expect(coinPurchasesOf('철괴')).toEqual([]);
  });
});
