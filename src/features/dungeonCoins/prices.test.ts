import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRecipeBook, type RawRecipeData } from '@/features/crafting/recipes';
import { beadCraftsOf } from './beadCrafts';
import { DUNGEON_COINS } from './exchanges';
import priceNames from './priceNames.json';
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

describe('priceNames.json', () => {
  it('워커가 모으는 이름이 던전 코인 화면이 묻는 이름을 모두 담는다', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../../public/data/recipes.json'), 'utf8'),
    ) as RawRecipeData;
    const book = buildRecipeBook(raw);
    const needed = new Set<string>();
    for (const entry of DUNGEON_COINS) {
      for (const exchange of entry.exchanges) needed.add(exchange.name);
      if (!entry.craftable) continue;
      for (const craft of beadCraftsOf(book, entry.exchanges)) {
        needed.add(craft.name);
        for (const input of craft.buyInputs) needed.add(input.name);
      }
    }
    const listed = new Set(priceNames);
    expect([...needed].filter((name) => !listed.has(name))).toEqual([]);
    // 더는 묻지 않는 이름이 남아 있으면 워커가 헛걸음을 한다.
    expect(priceNames.filter((name) => !needed.has(name))).toEqual([]);
  });
});
