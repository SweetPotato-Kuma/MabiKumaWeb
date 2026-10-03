import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseItemReference } from './mabi-resource.mjs';
import { createCardMatcher } from './card-match.mjs';

// 공개된 현재 등록 목록을 고정해 이름, 아이템 번호, 그림 해시를 함께 검증한다.
// 실행 위치는 저장소 루트다. 서버에 쓰는 요청은 보내지 않는다.
const output = resolve('.cache/square-icons');
const cdn = 'https://icons.spkuma.com';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
await mkdir(`${output}/live-maps`, { recursive: true });
await mkdir(`${output}/live-icons`, { recursive: true });

async function download(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

async function parallel(values, concurrency, work) {
  const queue = [...values];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) await work(queue.shift());
    }),
  );
}

const index = await readJson('public/data/items/index.json');
const maps = [];
await parallel(index.categories, 6, async ({ name }) => {
  const key = hash(name).slice(0, 8);
  const bytes = await download(`${cdn}/maps/${key}.js`);
  const map = JSON.parse(bytes.toString('utf8'));
  if (map.category !== name || !map.items) throw new Error(`Invalid map: ${name}`);
  await writeFile(`${output}/live-maps/${key}.json`, bytes);
  maps.push(map);
});

const { candidates } = parseItemReference(await readFile('.cache/item-cards/resourcedata.bin.br'));
const matcher = createCardMatcher(
  candidates,
  new Map(maps.map((m) => [m.category, Object.keys(m.items)])),
);
const groups = new Map();
for (const map of maps) {
  for (const [name, value] of Object.entries(map.items)) {
    const file = value[0];
    if (!file) continue;
    if (!/^[a-f0-9]{16}\.png$/.test(file)) throw new Error(`Unexpected icon filename: ${file}`);
    const row = groups.get(file) ?? { file, ids: [], names: [] };
    const id = matcher.pick(name, map.category)?.id;
    if (id && !row.ids.includes(String(id))) row.ids.push(String(id));
    row.names.push([map.category, name]);
    groups.set(file, row);
  }
}

let completed = 0;
await parallel(groups.values(), 24, async ({ file }) => {
  const path = `${output}/live-icons/${file}`;
  let bytes = await readFile(path).catch(() => null);
  if (!bytes || `${hash(bytes).slice(0, 16)}.png` !== file) {
    bytes = await download(`${cdn}/${file}`);
    if (`${hash(bytes).slice(0, 16)}.png` !== file) throw new Error(`Icon hash mismatch: ${file}`);
    await writeFile(path, bytes);
  }
  completed++;
  if (completed % 1000 === 0) console.log(`${completed}/${groups.size}`);
});

const rows = [...groups.values()].sort((a, b) => a.file.localeCompare(b.file));
await writeFile(`${output}/live-input.json`, `${JSON.stringify(rows)}\n`);
console.log(
  JSON.stringify({
    categories: maps.length,
    icons: rows.length,
    withoutItemId: rows.filter((row) => !row.ids.length).length,
  }),
);
