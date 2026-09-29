/**
 * 제작법에만 나오는 아이템 이름을 이름 사전에 채운다. 남성용/여성용 짝의 카테고리를 따른다.
 *
 * 규칙은 scripts/lib/recipe-names.mjs 에 있다. 짝을 못 찾은 이름은 넣지 않고 개수만 알린다.
 *
 * 실행: node scripts/sync-recipe-names.mjs          (제작법은 public/data/recipes.json)
 *       node scripts/sync-recipe-names.mjs --list   짝을 못 찾은 이름도 모두 적는다
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  readCategories,
  readDictionary,
  readExcluded,
  writeDictionary,
} from './lib/dictionary.mjs';
import { findSiblingAdditions } from './lib/recipe-names.mjs';

const today = new Date().toISOString().slice(0, 10);

const recipes = JSON.parse(
  await readFile(resolve(process.cwd(), 'public/data/recipes.json'), 'utf8'),
);
const recipeNames = Object.values(recipes.items).map((row) => row[0]);

const excluded = await readExcluded();
const dictionary = await readDictionary(excluded);
const { additions, unresolved } = findSiblingAdditions(recipeNames, dictionary, excluded);

for (const { name, category } of additions) {
  dictionary.get(category).set(name, { name, first: today, last: today });
  console.log(`  추가: ${category} / ${name}`);
}

if (additions.length > 0) {
  const known = new Set(await readCategories());
  const total = await writeDictionary(dictionary, { today, known });
  console.log(`사전에 ${additions.length}개를 더해 ${total}개가 되었습니다.`);
} else {
  console.log('더할 이름이 없습니다.');
}

console.log(`짝을 찾지 못해 카테고리를 모르는 제작법 아이템 ${unresolved.length}개`);
if (process.argv.includes('--list')) for (const name of unresolved) console.log(`  ${name}`);
