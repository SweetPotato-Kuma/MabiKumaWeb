import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { itemNameFromSlug, itemSlug } from './itemSlug.mjs';

it('생성 사전의 모든 이름이 왕복하고 대소문자를 제외해도 주소가 겹치지 않는다', () => {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), '.cache/game-data/current/items/names.json'), 'utf8'),
  ) as { items: [string, number][] };
  const names = [...new Set(raw.items.map(([name]) => name))];
  const lower = new Set<string>();
  for (const name of names) {
    const slug = itemSlug(name);
    expect(itemNameFromSlug(slug)).toBe(name);
    lower.add(slug.toLowerCase());
  }
  expect(lower.size).toBe(names.length);
});
