#!/usr/bin/env node
/**
 * 장비 세트 효과 표 모으기
 *
 * 아이템 사전의 장비 상세가 "이 장비에 붙는 세트 효과와 수치, 발동 기준, 같은 효과를 주는 장비" 를
 * 보여 주는 데 쓴다. 클라이언트 내보내기의 세트 효과 정의(SetItemDesc.xml)와 아이템별 수치를 묶는다
 * (game-data/client-tables.mjs).
 *
 * 실행: node scripts/build-set-effects.mjs
 * 산출: public/data/set-effects.json
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { latestBundleRun } from './game-data/bundle-items.mjs';
import { loadClientTables } from './game-data/client-tables.mjs';
import { buildSetEffects } from './game-data/set-effects.mjs';

const OUT = resolve(process.cwd(), 'public/data/set-effects.json');

const log = (...parts) => console.log('[set-effects]', ...parts);

const tables = loadClientTables(latestBundleRun());
const { effects, items } = buildSetEffects(tables);
const updated = tables.clientDate || new Date().toISOString().slice(0, 10);

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
