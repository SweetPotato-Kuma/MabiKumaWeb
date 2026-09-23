import { describe, expect, it } from 'vitest';
import {
  LOOKUP_MAX_GROUPS,
  LOOKUP_MAX_NAMES,
  canonicalItemName,
  packLookupBatches,
  type ItemCardKey,
} from './cards';

const keys = (category: string, count: number, prefix = category): ItemCardKey[] =>
  Array.from({ length: count }, (_, i) => ({ category, name: `${prefix} ${i}` }));

const namesIn = (batch: { names: string[] }[]) =>
  batch.reduce((sum, group) => sum + group.names.length, 0);

describe('packLookupBatches', () => {
  it('적으면 한 번에 묻는다', () => {
    const batches = packLookupBatches([...keys('검', 3), ...keys('활', 2)]);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([
      { category: '검', names: ['검 0', '검 1', '검 2'] },
      { category: '활', names: ['활 0', '활 1'] },
    ]);
  });

  it('같은 이름은 한 번만 묻는다', () => {
    // 경매장에는 같은 아이템이 여러 줄로 올라온다. 줄마다 물을 이유가 없다.
    const batches = packLookupBatches([
      { category: '검', name: '롱 소드' },
      { category: '검', name: '롱 소드' },
      { category: '검', name: '롱 소드' },
    ]);

    expect(batches).toEqual([[{ category: '검', names: ['롱 소드'] }]]);
  });

  it('한 카테고리가 이름 상한을 넘으면 쪼개서 다음 묶음으로 넘긴다', () => {
    const batches = packLookupBatches(keys('천옷', 150));

    expect(batches.map(namesIn)).toEqual([60, 60, 30]);
    expect(batches.every((batch) => batch.every((group) => group.category === '천옷'))).toBe(true);
  });

  it('어느 묶음도 워커 상한을 넘지 않는다', () => {
    const mixed = [
      ...keys('검', 45),
      ...keys('활', 45),
      ...keys('천옷', 10),
      ...keys('음식', 5),
      ...keys('날개', 5),
      ...keys('꼬리', 5),
      ...keys('모자/가발', 70),
    ];
    const batches = packLookupBatches(mixed);

    for (const batch of batches) {
      expect(namesIn(batch)).toBeLessThanOrEqual(LOOKUP_MAX_NAMES);
      expect(batch.length).toBeLessThanOrEqual(LOOKUP_MAX_GROUPS);
    }
    // 빠뜨린 이름이 없어야 한다.
    expect(batches.reduce((sum, batch) => sum + namesIn(batch), 0)).toBe(mixed.length);
  });

  it('카테고리가 많으면 이름이 적어도 묶음을 나눈다', () => {
    const batches = packLookupBatches(
      ['검', '활', '천옷', '음식', '날개', '꼬리'].map((category) => ({ category, name: '가' })),
    );

    expect(batches.map((batch) => batch.length)).toEqual([4, 2]);
  });

  it('물을 것이 없으면 요청도 없다', () => {
    expect(packLookupBatches([])).toEqual([]);
  });
});

describe('canonicalItemName', () => {
  it('경매장 이름 앞의 @ 를 뗀다', () => {
    // 이름 사전 수집기가 같은 규칙으로 저장한다. 이게 어긋나면 카드가 안 붙는다.
    expect(canonicalItemName('@롱 소드')).toBe('롱 소드');
    expect(canonicalItemName('  롱 소드 ')).toBe('롱 소드');
    expect(canonicalItemName('롱 소드')).toBe('롱 소드');
  });
});
