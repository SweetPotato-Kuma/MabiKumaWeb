/**
 * 아이템 이름 사전(public/data/items)을 읽고 쓰는 공용 코드.
 *
 * 경매장 수집기(harvest-auction.mjs)와 제작법 이름 채우기(sync-recipe-names.mjs)가 같은 파일을
 * 쓴다. 파일 이름 규칙과 모양이 한 곳에만 있어야 둘이 서로의 결과를 망가뜨리지 않는다.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = () => process.cwd();
export const OUT_DIR = resolve(root(), 'public/data/items');
/** 전체 자동완성용 이름 인덱스. 카테고리 파일과 달리 category 필드가 없다. */
export const NAMES_FILE = 'names.json';
const CONSTANTS_PATH = resolve(root(), 'src/features/auction/constants.ts');
/**
 * 사전에 넣지 않을 이름. 카테고리 -> 이름 목록.
 *
 * 경매장에 올라오지만 게임 안에서 설명도 그림도 찾을 수 없는 이름들이다. 사전에 두면 빈 줄만
 * 늘어난다. 한 번 빼도 다음 수집 때 경매장에서 다시 보이므로 여기 적어 두고 매번 거른다.
 * 나중에 게임 데이터에 생기면 이 파일에서 지우면 다음 수집에 돌아온다.
 */
const EXCLUDED_PATH = resolve(root(), 'scripts/dictionary-excluded.json');

/** 카테고리 이름에서 파일 이름을 만든다. 목록 순서가 바뀌어도 파일이 안 흔들리도록 해시를 쓴다. */
export function fileNameFor(category) {
  return `${createHash('sha256').update(category).digest('hex').slice(0, 8)}.json`;
}

/**
 * 화면과 수집기가 같은 카테고리 목록을 보도록 상수 파일에서 읽어 온다.
 * .mjs 에서 .ts 를 import 할 수 없어 배열 리터럴만 뽑아낸다.
 */
export async function readCategories() {
  const source = await readFile(CONSTANTS_PATH, 'utf8');
  const block = source.match(/AUCTION_ITEM_CATEGORIES\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error('constants.ts 에서 AUCTION_ITEM_CATEGORIES 를 찾지 못했습니다.');
  return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/** 뺄 이름을 "카테고리\u0000이름" 집합으로 읽는다. 파일이 없으면 빼지 않는다. */
export async function readExcluded() {
  const excluded = new Set();
  let parsed;
  try {
    parsed = JSON.parse(await readFile(EXCLUDED_PATH, 'utf8'));
  } catch {
    return excluded;
  }
  for (const [category, names] of Object.entries(parsed)) {
    for (const name of names) excluded.add(`${category}\u0000${name}`);
  }
  return excluded;
}

/** 기존 사전을 읽어 카테고리 -> (이름 -> 레코드) 맵으로 만든다. 없으면 빈 맵. 뺄 이름은 여기서 버린다. */
export async function readDictionary(excluded = new Set()) {
  const byCategory = new Map();
  let files;
  try {
    files = await readdir(OUT_DIR);
  } catch {
    return byCategory;
  }

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'index.json' || file === NAMES_FILE) continue;
    try {
      const parsed = JSON.parse(await readFile(resolve(OUT_DIR, file), 'utf8'));
      if (!parsed?.category || !Array.isArray(parsed.items)) continue;
      const kept = parsed.items.filter(
        (item) => !excluded.has(`${parsed.category}\u0000${item.name}`),
      );
      byCategory.set(parsed.category, new Map(kept.map((item) => [item.name, item])));
    } catch (cause) {
      console.warn(`  기존 파일을 읽지 못해 건너뜁니다: ${file} (${cause.message})`);
    }
  }

  return byCategory;
}

/** 날짜(updated)만 다른 파일은 다시 쓰지 않는다. */
async function writeUnlessSame(path, value, space) {
  const before = await readFile(path, 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null);
  const strip = (data) => JSON.stringify({ ...data, updated: 0 });
  if (before && strip(before) === strip(value)) return;
  await writeFile(path, `${JSON.stringify(value, null, space)}\n`);
}

/** 사전을 카테고리 파일, index.json, names.json 으로 쓴다. 전체 개수를 돌려준다. */
export async function writeDictionary(dictionary, { today, known }) {
  await mkdir(OUT_DIR, { recursive: true });

  const index = [];
  // 전체 자동완성용. [이름, 카테고리 번호] 만 담아 한 파일로 둔다.
  const nameRows = [];
  for (const [category, items] of [...dictionary].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
    const sorted = [...items.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const file = fileNameFor(category);
    // 내용이 그대로인 칸은 다시 쓰지 않는다. 날짜만 바뀐 파일이 커밋에 잔뜩 섞이지 않게 한다.
    const before = await readFile(resolve(OUT_DIR, file), 'utf8')
      .then((text) => JSON.parse(text))
      .catch(() => null);
    if (JSON.stringify(before?.items) !== JSON.stringify(sorted)) {
      await writeFile(
        resolve(OUT_DIR, file),
        `${JSON.stringify({ category, updated: today, count: sorted.length, items: sorted }, null, 2)}\n`,
      );
    }
    for (const item of sorted) nameRows.push([item.name, index.length]);
    index.push({
      name: category,
      file,
      count: sorted.length,
      ...(known.has(category) ? {} : { unlisted: true }),
    });
  }

  const total = index.reduce((sum, entry) => sum + entry.count, 0);
  await writeUnlessSame(
    resolve(OUT_DIR, 'index.json'),
    { updated: today, total, categories: index },
    2,
  );

  /**
   * 전체 카테고리 자동완성은 이 파일 하나로 한다. 카테고리 파일 79개를 다 받을 수는 없다.
   * 첫/마지막 관측일은 빼고 이름과 카테고리 번호만 남겨 들여쓰기 없이 쓴다.
   * 15,000개 기준 원본 650KB, gzip 120KB 남짓이다.
   */
  await writeUnlessSame(resolve(OUT_DIR, NAMES_FILE), {
    updated: today,
    categories: index.map((entry) => entry.name),
    items: nameRows,
  });

  return total;
}
