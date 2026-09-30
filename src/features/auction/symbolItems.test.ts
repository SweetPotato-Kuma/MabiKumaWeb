import { describe, expect, it } from 'vitest';
import { isSymbolItem, searchesSymbolItems } from './symbolItems';

describe('심볼, 도면, 옷본', () => {
  it('이름에 세 단어 가운데 하나가 들어 있으면 해당한다', () => {
    expect(isSymbolItem('전투 심볼')).toBe(true);
    expect(isSymbolItem('실크 도면')).toBe(true);
    expect(isSymbolItem('고급 옷본')).toBe(true);
  });

  it('띄어쓰기가 달라도 찾는다', () => {
    expect(isSymbolItem('전 투 심 볼')).toBe(true);
  });

  it('관계없는 이름은 해당하지 않는다', () => {
    expect(isSymbolItem('소울 리버레이트 보우')).toBe(false);
    expect(isSymbolItem('')).toBe(false);
  });

  it('검색어가 그 단어를 말하면 직접 찾는 것이다', () => {
    expect(searchesSymbolItems('심볼')).toBe(true);
    expect(searchesSymbolItems('실크 도면')).toBe(true);
    expect(searchesSymbolItems('소드')).toBe(false);
  });
});
