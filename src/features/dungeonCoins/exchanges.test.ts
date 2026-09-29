import { describe, expect, it } from 'vitest';
import { coinPurchasesOf, coinTotalsOf } from './exchanges';

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

  it('거래 불가 판은 같은 재료로 본다', () => {
    expect(coinPurchasesOf('깨어난 힘의 정수(거래 불가)')).toEqual(
      coinPurchasesOf('깨어난 힘의 정수'),
    );
  });

  it('코인으로 살 수 없으면 빈 배열이다', () => {
    expect(coinPurchasesOf('철괴')).toEqual([]);
  });
});

describe('코인 총합', () => {
  it('코인마다 필요한 개수를 더한다', () => {
    expect(
      coinTotalsOf([
        { name: '빛바랜 에너지 회로', required: 2 },
        { name: '순도 높은 실리엔 섬유 다발', required: 3 },
        { name: '철괴', required: 9 },
      ]),
    ).toEqual([{ coin: '탈라 가흐 구슬', total: 35 * 2 + 6 * 3 }]);
  });

  it('여러 코인으로 살 수 있는 재료는 코인마다 센다', () => {
    expect(coinTotalsOf([{ name: '깨어난 힘의 정수', required: 2 }])).toEqual([
      { coin: '브리 레흐 구슬', total: 10 },
      { coin: '심연의 증표', total: 20 },
    ]);
  });

  it('코인으로 살 수 있는 재료가 없으면 빈 배열이다', () => {
    expect(coinTotalsOf([{ name: '철괴', required: 3 }])).toEqual([]);
  });
});
