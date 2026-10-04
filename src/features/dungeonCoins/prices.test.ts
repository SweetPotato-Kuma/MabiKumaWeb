import { describe, expect, it } from 'vitest';
import { priceFromFile, type PriceFile } from './prices';

const NOW = Date.parse('2026-09-27T05:10:00Z');

const FILE: PriceFile = {
  at: NOW - 5 * 60 * 1000,
  prices: {
    마력석: { at: NOW - 5 * 60 * 1000, offers: [[900, 5], [1_000, 3]], complete: true },
    '묵은 재료': { at: NOW - 40 * 60 * 1000, offers: [[10, 1]], complete: true },
    '매물 없는 재료': { at: NOW - 5 * 60 * 1000, offers: [], complete: true },
  },
};

describe('priceFromFile', () => {
  it('모아 둔 매물을 시세로 바꾼다', () => {
    expect(priceFromFile(FILE, '마력석', NOW)).toEqual({
      status: 'ok',
      price: {
        offers: [
          { price: 900, count: 5 },
          { price: 1_000, count: 3 },
        ],
        supply: 8,
        complete: true,
      },
    });
    expect(priceFromFile(FILE, '매물 없는 재료', NOW)).toMatchObject({
      status: 'ok',
      price: { offers: [] },
    });
  });

  it('파일에 없거나 30분 넘게 묵은 이름은 이름마다 묻게 비워 둔다', () => {
    expect(priceFromFile(FILE, '없는 재료', NOW)).toBeUndefined();
    expect(priceFromFile(FILE, '묵은 재료', NOW)).toBeUndefined();
    expect(priceFromFile(null, '마력석', NOW)).toBeUndefined();
  });
});
