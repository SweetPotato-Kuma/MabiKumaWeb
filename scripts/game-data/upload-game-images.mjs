#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defaultBundleRoot } from './bundle-items.mjs';

/**
 * 아이템 그림 밖의 게임 그림(스킬 아이콘, 오검 워드)을 그림 서버(R2)에 올리고, 번호 -> 파일 이름 표를
 * src/features/itemcard/generated/gameImages.json 에 적는다. 게임 그림은 사이트 저장소에 두지 않는다.
 *
 *   스킬 아이콘   클라이언트 내보내기의 42x42 무손실 WebP. 제작법, 아르카나, 오검 조합이 쓰는 스킬만
 *   오검 워드     .cache/game-images/ogham/<번호>.png. 내보내기 범위(인벤토리, 스킬)에 없는 화면 그림이라
 *                 받아 둔 파일을 그대로 올린다
 *
 * 파일 이름은 내용 해시라 이미 올린 것은 다시 보내지 않는다(.cache/item-cards/uploaded-files.json, 카드 수집과 같은 기록).
 * 표가 바뀌면 사이트를 다시 배포해야 화면에 반영된다.
 *
 *   node scripts/game-data/upload-game-images.mjs           올리고 표를 적는다
 *   node scripts/game-data/upload-game-images.mjs --check   세기만 한다
 */

const root = process.cwd();
const STATE = resolve(root, '.cache/item-cards/uploaded-files.json');
const OGHAM_DIR = resolve(root, '.cache/game-images/ogham');
const OUT = resolve(root, 'src/features/itemcard/generated/gameImages.json');
const BATCH = 40;
const checkOnly = process.argv.includes('--check');

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match && !process.env[match[1]])
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // 환경 변수로 줘도 된다.
  }
}

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const fileName = (bytes, extension) =>
  `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${extension}`;

/** 사이트가 그림을 그리는 스킬. 제작 스킬, 아르카나의 딸린 스킬과 각성 스킬, 오검 조합 스킬. */
async function usedSkillIds() {
  const ids = new Set();
  for (const skill of (await readJson(resolve(root, 'public/data/recipes.json'))).skills)
    ids.add(skill.id);
  for (const arcana of (await readJson(resolve(root, 'public/data/arcana.json'))).arcanas) {
    ids.add(arcana.awakening);
    for (const skill of arcana.skills) ids.add(skill.id);
  }
  for (const combination of (await readJson(resolve(root, 'src/features/ogham/data.json')))
    .combinations)
    ids.add(combination.skillId);
  return [...ids].filter(Number.isInteger).sort((a, b) => a - b);
}

async function upload(files, uploaded) {
  const proxy = (process.env.VITE_PROXY_URL ?? '').replace(/\/+$/, '');
  const key = process.env.MABIKUMA_ADMIN_KEY ?? '';
  if (!proxy || !key)
    throw new Error('.env 에 VITE_PROXY_URL 과 MABIKUMA_ADMIN_KEY 가 있어야 올릴 수 있습니다.');
  const pending = [...files].filter(([file]) => !uploaded.has(file));
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const response = await fetch(`${proxy}/item-card/icons`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mabikuma-admin-key': key,
        origin: (process.env.MABIKUMA_ORIGIN ?? 'https://mabi.spkuma.com').trim(),
      },
      body: JSON.stringify({
        icons: batch.map(([file, bytes]) => ({ key: file, base64: bytes.toString('base64') })),
      }),
    });
    if (!response.ok) throw new Error(`그림 올리기 실패 (HTTP ${response.status})`);
    const { files: written } = await response.json();
    for (const [file] of batch) {
      if (written[file] === file) uploaded.add(file);
      else throw new Error(`워커가 붙인 이름(${written[file]})이 예상(${file})과 다릅니다.`);
    }
  }
  return pending.length;
}

loadEnv();
const bundleRoot = defaultBundleRoot();
const run = resolve(bundleRoot, (await readJson(resolve(bundleRoot, 'latest.json'))).run);
const skillIndex = await readJson(resolve(run, 'images/skill-images.json'));

const files = new Map();
const skills = {};
const missingSkills = [];
for (const id of await usedSkillIds()) {
  const rel = skillIndex[String(id)]?.[0];
  if (!rel) {
    missingSkills.push(id);
    continue;
  }
  const bytes = await readFile(resolve(run, rel));
  const file = fileName(bytes, 'webp');
  files.set(file, bytes);
  skills[id] = file;
}

const ogham = {};
const missingOgham = [];
for (const word of (await readJson(resolve(root, 'src/features/ogham/data.json'))).words) {
  const bytes = await readFile(resolve(OGHAM_DIR, `${word.id}.png`)).catch(() => null);
  if (!bytes) {
    missingOgham.push(word.id);
    continue;
  }
  const file = fileName(bytes, 'png');
  files.set(file, bytes);
  ogham[word.id] = file;
}

console.log(
  `스킬 그림 ${Object.keys(skills).length}개${missingSkills.length ? `, 내보내기에 없는 스킬 ${missingSkills.join(', ')}` : ''}`,
);
console.log(
  `오검 워드 그림 ${Object.keys(ogham).length}개${missingOgham.length ? `, 없는 워드 ${missingOgham.join(', ')}` : ''}`,
);
if (checkOnly) process.exit(0);

const uploaded = new Set(await readJson(STATE).catch(() => []));
const sent = await upload(files, uploaded);
await writeFile(STATE, JSON.stringify([...uploaded].sort()));
await mkdir(resolve(OUT, '..'), { recursive: true });
await writeFile(OUT, JSON.stringify({ skills, ogham }, null, 2) + '\n');
console.log(`새로 올린 그림 ${sent}장, 이미 있던 것 ${files.size - sent}장 -> ${OUT}`);
