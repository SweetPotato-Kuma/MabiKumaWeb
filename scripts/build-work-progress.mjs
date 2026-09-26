/**
 * 공정 진행도 모으기
 *
 * 천옷만들기와 블랙스미스는 작업(공정) 한 번에 진행도가 조금씩 올라 99.9% 가 되면 마무리한다.
 * 한 번에 얼마나 오르는지는 확률이라 게임 데이터에 없다. 사람들이 성공한 공정마다 오른 진행도를
 * 모아 평균을 적어 둔 위키가 있어서, 그 값을 받아 제작법에 붙인다.
 *
 * 위키는 영문 이름으로 적혀 있다. 영문 게임 데이터(us)의 아이템 번호와 이름으로 위키 이름을
 * 아이템 번호에 잇고, 한국 제작법의 아이템 번호에 붙인다. 영문 서버에 없는 아이템이나 위키에
 * 없는 아이템은 값이 없다(화면은 공정 1회로 두고 사용자가 고친다).
 *
 * 이름 잇기:
 * - 대소문자, 띄어쓰기, 따옴표 모양이 위키마다 달라 영문자와 숫자, 괄호만 남겨 비교한다
 *   ("Long Sword" 와 "Longsword" 가 같다)
 * - 그렇게 줄였을 때 같은 이름에 값이 둘 이상이면 어느 것인지 몰라 버린다
 *
 * 제작법을 다시 모아도(build-recipes.mjs) 붙인 값은 그대로 남는다.
 *
 * 실행: node scripts/build-work-progress.mjs   (build-recipes.mjs 뒤에)
 * 산출: public/data/recipes.json 의 천옷만들기, 블랙스미스 제작법에 progress(공정당 평균 %)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadResourceData, stringLookup } from './lib/resource-data.mjs';

const OUT = resolve('public/data/recipes.json');
const WIKI_API = 'https://wiki.mabinogiworld.com/api.php';
/** 위키가 기본 브라우저 헤더 없는 요청을 막는다. */
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (mabikuma recipe data)' };
/** 위키의 제작 아이템 분류와 그 분류를 쓰는 스킬. 스킬 번호는 build-recipes.mjs 의 TYPE_SKILL 과 같다. */
const CATEGORIES = { DataTailoring: 10001, DataBlacksmithing: 10016 };
/** 한 번에 본문을 받을 문서 수. 많으면 위키가 본문 일부를 다음 요청으로 미룬다. */
const BATCH = 20;

const nameKey = (name) => name.toLowerCase().replace(/[^a-z0-9()]/g, '');

async function wikiQuery(params) {
  const query = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    ...params,
  });
  const response = await fetch(`${WIKI_API}?${query}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`위키 ${response.status}`);
  return response.json();
}

/** 분류 안의 문서 본문을 모두 받는다. 본문이 다음 요청으로 밀리면 이어 받는다. */
async function categoryPages(category) {
  const titles = [];
  let next = {};
  for (;;) {
    const data = await wikiQuery({
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: '500',
      ...next,
    });
    titles.push(...data.query.categorymembers.map((member) => member.title));
    if (!data.continue) break;
    next = data.continue;
  }

  const pages = [];
  for (let start = 0; start < titles.length; start += BATCH) {
    let more = {};
    for (;;) {
      const data = await wikiQuery({
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        titles: titles.slice(start, start + BATCH).join('|'),
        ...more,
      });
      for (const page of data.query.pages) {
        const content = page.revisions?.[0]?.slots?.main?.content;
        if (content) pages.push({ title: page.title, content });
      }
      if (!data.continue) break;
      more = data.continue;
    }
  }
  return pages;
}

const field = (content, key) => content.match(new RegExp(`[|]${key}=([^\\n|]*)`))?.[1]?.trim();

/** 위키 이름(줄인 것) -> 공정당 평균 %. 값이 엇갈리는 이름은 뺀다. */
async function wikiProgress() {
  const byKey = new Map();
  const conflicting = new Set();
  for (const category of Object.keys(CATEGORIES)) {
    const pages = await categoryPages(category);
    let counted = 0;
    for (const { title, content } of pages) {
      const percent = Number(field(content, 'CraftPercent'));
      if (!(percent > 0)) continue;
      const name = field(content, 'Name') || title.replace(/^Template:Data/, '');
      const key = nameKey(name);
      const previous = byKey.get(key);
      if (previous !== undefined && previous !== percent) conflicting.add(key);
      byKey.set(key, percent);
      counted += 1;
    }
    console.log(`${category}: 문서 ${pages.length}개, 진행도 있는 것 ${counted}개`);
  }
  for (const key of conflicting) byKey.delete(key);
  if (conflicting.size) console.log(`값이 엇갈려 뺀 이름 ${conflicting.size}개`);
  return byKey;
}

/** build-recipes.mjs 의 writeOutput 과 같은 모양. 한 줄에 제작법 하나. */
async function writeRecipes({ updated, skills, items, recipes }) {
  const body = [
    '{',
    `"updated":${JSON.stringify(updated)},`,
    `"skills":${JSON.stringify(skills)},`,
    `"items":${JSON.stringify(items)},`,
    '"recipes":[',
    recipes.map((recipe) => JSON.stringify(recipe)).join(',\n'),
    ']}',
    '',
  ].join('\n');
  await writeFile(OUT, body);
}

async function main() {
  const book = JSON.parse(await readFile(OUT, 'utf8'));
  const progressByKey = await wikiProgress();

  const { data } = await loadResourceData('us');
  const text = stringLookup(data);
  const englishName = new Map(data.ItemList.map((item) => [item.Id, text(item.Name)]));

  const skills = new Set(Object.values(CATEGORIES));
  let total = 0;
  let found = 0;
  for (const recipe of book.recipes) {
    if (!skills.has(recipe.skill)) continue;
    total += 1;
    const name = englishName.get(recipe.item);
    const progress = name ? progressByKey.get(nameKey(name)) : undefined;
    if (progress === undefined) {
      delete recipe.progress;
      continue;
    }
    recipe.progress = progress;
    found += 1;
  }
  await writeRecipes(book);
  console.log(`천옷만들기, 블랙스미스 제작법 ${total}개 중 ${found}개에 공정 진행도를 붙였습니다.`);
}

await main();
