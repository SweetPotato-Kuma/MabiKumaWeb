import { describe, expect, it } from 'vitest';
import { isWednesdayInKorea, npcUnitPrice } from './npcPrices';

describe('npcUnitPrice', () => {
  it('수요일에는 5% 뺀 값을 1골드 아래를 버려 쓴다', () => {
    expect(npcUnitPrice('각성된 힘의 가루', false)).toBe(50_000);
    expect(npcUnitPrice('각성된 힘의 가루', true)).toBe(47_500);
    expect(npcUnitPrice('빈 병', true)).toBe(380);
  });

  it('NPC 가 팔지 않는 재료는 값이 없다', () => {
    expect(npcUnitPrice('철괴', false)).toBeUndefined();
  });
});

describe('isWednesdayInKorea', () => {
  it('한국 시간으로 요일을 가른다', () => {
    // 2026-09-29 15:30 UTC 는 한국 시간 9월 30일(수) 00:30 이다.
    expect(isWednesdayInKorea(new Date('2026-09-29T15:30:00Z'))).toBe(true);
    expect(isWednesdayInKorea(new Date('2026-09-29T14:30:00Z'))).toBe(false);
  });
});
