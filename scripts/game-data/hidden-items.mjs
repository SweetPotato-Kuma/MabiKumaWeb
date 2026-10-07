#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hiddenReason, loadBundleItems } from './bundle-items.mjs';

/**
 * 플레이어가 게임에서 볼 수 없는 아이템 목록을 만든다.
 *
 * 클라이언트 내보내기의 모든 아이템에 카드 수집과 같은 숨김 기준(bundle-items.mjs 의 hiddenReason)을
 * 적용하고, 이유별로 묶어 적는다. 그 아이템이 사이트 어디에 나오는지(경매장 사전, 제작법)도 같이 적어
 * 기준이 사이트에 보이는 아이템을 잘못 숨기지 않는지 확인할 수 있게 한다. 사이트는 이름으로 찾으므로
 * 이름이 같은 보이는 아이템이 따로 있으면(same_name_visible) 사이트의 그 이름은 그쪽이다. 설명이 없는 아이템은
 * 판정할 것이 없어 뺀다.
 *
 *   node scripts/game-data/hidden-items.mjs           .cache/item-cards/hidden-items.{json,tsv}
 *   node scripts/game-data/hidden-items.mjs --site    사이트에 나오는 아이템만
 *
 * 내보내기 위치는 collect-item-cards.mjs 와 같다(MABIKUMA_CLIENT_BUNDLE).
 */

const root = process.cwd();
const BUNDLE_ROOT = resolve(
  root,
  process.env.MABIKUMA_CLIENT_BUNDLE ?? '.cache/client-src/exports/client-bundle',
);
const OUT_DIR = resolve(root, '.cache/item-cards');
const siteOnly = process.argv.includes('--site');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function siteNames() {
  const auction = new Set();
  for (const file of await readdir(resolve(root, 'public/data/items'))) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    const shard = await readJson(resolve(root, 'public/data/items', file));
    for (const item of shard?.items ?? []) auction.add(item.name);
  }
  const recipes = new Set(
    Object.values((await readJson(resolve(root, 'public/data/recipes.json'))).items).map(
      ([name]) => name,
    ),
  );
  return { auction, recipes };
}

const latest = await readJson(resolve(BUNDLE_ROOT, 'latest.json'));
const run = resolve(BUNDLE_ROOT, latest.run);
const items = loadBundleItems(run);
const { auction, recipes } = await siteNames();

// 이름이 같은 다른 번호가 보이는 아이템이면 사이트의 그 이름은 그쪽을 가리킨다.
const visibleNames = new Set();
for (const { name, description } of items.values()) {
  if (name && description && !hiddenReason(name, description)) visibleNames.add(name);
}

const rows = [];
for (const [id, { name, description }] of items) {
  if (!name || !description) continue;
  const reason = hiddenReason(name, description);
  if (!reason) continue;
  const where = [auction.has(name) ? '경매장' : '', recipes.has(name) ? '제작법' : ''].filter(
    Boolean,
  );
  if (siteOnly && where.length === 0) continue;
  const sameNameVisible = visibleNames.has(name);
  rows.push({
    id,
    name,
    reason,
    site: where.join(','),
    sameNameVisible,
    description: description.slice(0, 80),
  });
}
rows.sort((a, b) => a.reason.localeCompare(b.reason, 'ko') || Number(a.id) - Number(b.id));

const byReason = {};
for (const row of rows) byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
// 이름이 같은 보이는 아이템이 있으면 사이트에 나오는 것은 그쪽이다.
const onSite = rows.filter((row) => row.site && !row.sameNameVisible);

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  resolve(OUT_DIR, 'hidden-items.json'),
  JSON.stringify(
    { bundle: latest.run, count: rows.length, byReason, onSite: onSite.length, items: rows },
    null,
    1,
  ),
);
const tsv = [
  'id\tname\treason\tsite\tsame_name_visible\tdescription',
  ...rows.map((r) =>
    [
      r.id,
      r.name,
      r.reason,
      r.site,
      r.sameNameVisible ? 'yes' : '',
      r.description.replace(/\s+/g, ' '),
    ].join('\t'),
  ),
];
await writeFile(resolve(OUT_DIR, 'hidden-items.tsv'), '﻿' + tsv.join('\n') + '\n');

console.log(`내보내기 ${latest.run}`);
console.log(`볼 수 없는 아이템 ${rows.length}개`);
for (const [reason, count] of Object.entries(byReason))
  console.log(`  ${reason.padEnd(12)} ${count}`);
console.log(`그중 사이트(경매장 사전, 제작법)에 이 아이템으로 나오는 것 ${onSite.length}개`);
for (const row of onSite.slice(0, 20)) console.log(`  [${row.site}] ${row.name} (${row.reason})`);
console.log(`목록: ${resolve(OUT_DIR, 'hidden-items.tsv')}`);
