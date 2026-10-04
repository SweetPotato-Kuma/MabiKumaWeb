/**
 * 워커가 모으는 시세 이름 검사. 실제 제작법 데이터로 구슬 제작 재료를 센다.
 *
 * 다른 사이트에서 받아 온 게임 데이터 파일을 그대로 읽어 검사한다. 그 사이트가 막거나 형식을 바꾸면 우리 코드와
 * 상관없이 깨지므로, 기본 시험(npm test, 배포와 동기화)에서는 빼고 `npm run test:data` 로 따로 돌린다.
 * 데이터를 우리 쪽으로 옮기면 다시 기본 시험에 넣는다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRecipeBook, type RawRecipeData } from '@/features/crafting/recipes';
import { beadCraftsOf } from './beadCrafts';
import { DUNGEON_COINS } from './exchanges';
import priceNames from './priceNames.json';

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
