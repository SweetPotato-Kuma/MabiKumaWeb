/**
 * 인챈트 스크롤 사전 채우기
 *
 * 게임 데이터의 인챈트 정의(이름, 접두/접미, 랭크, 효과, 나오는 곳)로 두 가지를 만든다.
 *   public/data/enchant-scrolls.json   스크롤 이름 -> 접두/접미와 랭크별 효과
 *   아이템 사전의 "인챈트 스크롤" 카테고리에 "인챈트 스크롤 - 올빼미" 같은 이름
 *
 * 이름은 경매장이 보여 주는 표기를 따른다(scripts/lib/enchant-scrolls.mjs). 경매장 이름 뒤에 붙는 인챈트
 * 이름은 게임 데이터의 두 번째 이름이다. 첫 번째 이름(320개가 다르다)은 사양의 alt 와 사전 항목의 alt 로
 * 남겨 그 이름으로도 검색되게 한다.
 *
 * 인챈트 정의는 클라이언트 내보내기의 옵션셋(game-data/client-tables.mjs)에서 읽는다.
 *
 * 실행: node scripts/build-enchant-scrolls.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { latestBundleRun } from './game-data/bundle-items.mjs';
import { loadClientTables, tableText } from './game-data/client-tables.mjs';
import { buildEnchantDef, buildEnchantSources } from './game-data/enchant-defs.mjs';
import { readCategories, readDictionary, readExcluded, writeDictionary } from './lib/dictionary.mjs';
import { SCROLL_CATEGORY, altNames, groupScrolls, parseScrollName } from './lib/enchant-scrolls.mjs';

const OUT = resolve(process.cwd(), 'public/data/enchant-scrolls.json');

const today = new Date().toISOString().slice(0, 10);

async function main() {
  const data = loadClientTables(latestBundleRun());
  const text = tableText(data);

  const sources = buildEnchantSources(data, text);
  const defs = [];
  for (const row of data.OptionSetList.filter((entry) => (entry.Usage ?? 0) <= 1)) {
    const enchant = data.enchants.get(row.Id);
    if (!enchant) continue;
    defs.push(buildEnchantDef(row, enchant, text, new Set(), sources));
  }

  // 인챈트가 하나도 없으면 내보내기가 잘못된 것이다. 빈 사양으로 덮지 않고 멈춘다.
  if (defs.length === 0) throw new Error('클라이언트 내보내기에 인챈트가 없습니다.');

  const groups = groupScrolls(defs);
  const scrolls = Object.fromEntries(
    [...groups].sort((a, b) => a[0].localeCompare(b[0], 'ko')),
  );
  // 한 이름이 한 줄이라 다음 수집 때 무엇이 바뀌었는지 diff 로 보인다.
  const body = [
    '{',
    `"scrolls":{`,
    Object.entries(scrolls)
      .map(([name, variants]) => `${JSON.stringify(name)}:${JSON.stringify(variants)}`)
      .join(',\n'),
    '}}',
    '',
  ].join('\n');
  const before = await readFile(OUT, 'utf8').catch(() => '');
  if (before !== body) await writeFile(OUT, body);
  console.log(
    `인챈트 ${defs.length}개, 스크롤 이름 ${groups.size}개 -> ${OUT} (${Math.round(body.length / 1024)} KB)`,
  );

  const excluded = await readExcluded();
  const dictionary = await readDictionary(excluded);
  let items = dictionary.get(SCROLL_CATEGORY);
  if (!items) {
    items = new Map();
    dictionary.set(SCROLL_CATEGORY, items);
  }
  // 경매장 수집은 원래 이름("인챈트 스크롤")만 적으므로 " - " 가 붙은 이름은 모두 여기서 만든 것이다.
  // 게임 데이터에서 사라진 인챈트의 이름은 내린다.
  let removed = 0;
  for (const name of [...items.keys()]) {
    if (parseScrollName(name) && !groups.has(name)) {
      items.delete(name);
      removed += 1;
    }
  }
  let added = 0;
  let changed = 0;
  for (const [name, variants] of groups) {
    if (excluded.has(`${SCROLL_CATEGORY}\u0000${name}`)) continue;
    const alt = altNames(variants);
    const existing = items.get(name);
    if (existing) {
      if (JSON.stringify(existing.alt ?? []) === JSON.stringify(alt)) continue;
      if (alt.length > 0) existing.alt = alt;
      else delete existing.alt;
      changed += 1;
      continue;
    }
    items.set(name, alt.length > 0 ? { name, first: today, last: today, alt } : { name, first: today, last: today });
    added += 1;
  }
  if (added === 0 && removed === 0 && changed === 0) {
    console.log('사전에 더할 이름이 없습니다.');
    return;
  }
  const total = await writeDictionary(dictionary, { today, known: new Set(await readCategories()) });
  console.log(`사전에 ${added}개를 더하고 ${removed}개를 내리고 ${changed}개의 다른 이름을 고쳐 ${total}개가 되었습니다.`);
}

main().catch((error) => {
  console.error('[enchant-scrolls] 실패:', error.message);
  process.exitCode = 1;
});
