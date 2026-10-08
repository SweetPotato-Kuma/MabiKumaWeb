import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { FARM_PRICE_NAMES } from './data';

it('시세를 묻는 이름이 모두 생성한 아이템 사전에 있다', () => {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), '.cache/game-data/current/items/names.json'), 'utf8'),
  ) as { items: [string, number][] };
  const known = new Set(raw.items.map(([name]) => name));
  expect(FARM_PRICE_NAMES.filter((name) => !known.has(name))).toEqual([]);
});
