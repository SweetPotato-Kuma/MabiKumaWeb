#!/usr/bin/env node
/**
 * 장비 세트 효과 표 모으기
 *
 * 아이템 사전의 장비 상세가 "이 장비에 붙는 세트 효과와 수치, 발동 기준, 같은 효과를 주는 장비" 를
 * 보여 주는 데 쓴다. 게임 클라이언트 데이터의 세트 효과 정의와 아이템별 수치를 묶는다.
 * 장비 데이터를 모으는 도구(game-data/collect-equipment.mjs)와 같은 리소스 덩어리를 읽고,
 * 그쪽이 받아 둔 것이 있으면 다시 받지 않는다.
 *
 * 실행: node scripts/build-set-effects.mjs
 * 산출: public/data/set-effects.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEquipmentResource } from './game-data/mabi-equipment.mjs';
import { buildSetEffects } from './game-data/set-effects.mjs';

const RESOURCE_HOST = 'https://mabires2.pril.cc';
const VERSION_URL = `${RESOURCE_HOST}/resourceversion/kr/kr_resourceversion.json`;
const RESOURCE_URL = `${RESOURCE_HOST}/resourcedata/kr/kr_resourcedata.bin.br`;

const RESOURCE_DIR = resolve(process.cwd(), '.cache/item-cards');
const OUT = resolve(process.cwd(), 'public/data/set-effects.json');

const log = (...parts) => console.log('[set-effects]', ...parts);

/** 리소스 덩어리는 7MB 남짓이다. 버전이 그대로면 받아 둔 것을 쓴다. */
async function loadResource() {
  await mkdir(RESOURCE_DIR, { recursive: true });
  const versionPath = resolve(RESOURCE_DIR, 'version.json');
  const blobPath = resolve(RESOURCE_DIR, 'resourcedata.bin.br');

  const response = await fetch(VERSION_URL);
  if (!response.ok) throw new Error(`목록 버전을 받지 못했습니다. (HTTP ${response.status})`);
  const version = await response.json();

  const cachedVersion = await readFile(versionPath, 'utf8').catch(() => null);
  if (cachedVersion === JSON.stringify(version)) {
    const cached = await readFile(blobPath).catch(() => null);
    if (cached) {
      log('리소스는 그대로입니다. 받아 둔 것을 씁니다.');
      return { blob: cached, version };
    }
  }

  log('리소스 내려받는 중...');
  const blobResponse = await fetch(RESOURCE_URL);
  if (!blobResponse.ok) throw new Error(`리소스를 받지 못했습니다. (HTTP ${blobResponse.status})`);
  const blob = Buffer.from(await blobResponse.arrayBuffer());
  await writeFile(blobPath, blob);
  await writeFile(versionPath, JSON.stringify(version));
  return { blob, version };
}

const { blob, version } = await loadResource();
const { effects, items } = buildSetEffects(parseEquipmentResource(blob));
const updated = version.CreatedAt
  ? new Date(version.CreatedAt * 1000).toISOString().slice(0, 10)
  : new Date().toISOString().slice(0, 10);

// 한 줄에 아이템 하나. 게임 업데이트 뒤 다시 돌렸을 때 바뀐 줄만 diff 에 보인다.
const body = [
  '{',
  `"updated":${JSON.stringify(updated)},`,
  `"effects":{`,
  Object.entries(effects)
    .map(([key, def]) => `${JSON.stringify(key)}:${JSON.stringify(def)}`)
    .join(',\n'),
  '},',
  `"items":{`,
  Object.entries(items)
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([name, set]) => `${JSON.stringify(name)}:${JSON.stringify(set)}`)
    .join(',\n'),
  '}',
  '}',
].join('\n');
await writeFile(OUT, `${body}\n`);
log(`효과 ${Object.keys(effects).length}개, 아이템 ${Object.keys(items).length}개 -> ${OUT}`);
