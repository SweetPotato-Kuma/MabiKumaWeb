/**
 * 게임 리소스 버전과 이름 사전을 한 줄 지문으로 찍는다.
 *
 * 워크플로우가 이 값이 지난번 올린 때와 같으면 카드와 장비 데이터를 다시 올리지 않는다.
 * 버전이 바뀌었거나 사전에 이름이 늘었을 때, 또는 장비 데이터를 만드는 스크립트가 바뀌었을 때만 값이 달라진다.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const VERSION_URL = 'https://mabires2.pril.cc/resourceversion/kr/kr_resourceversion.json';

const response = await fetch(VERSION_URL);
if (!response.ok) throw new Error(`버전을 받지 못했습니다. (HTTP ${response.status})`);
const version = await response.text();
const names = await readFile(resolve(process.cwd(), 'public/data/items/names.json'), 'utf8');

console.log(
  createHash('sha256').update(version).update('\n').update(names).digest('hex').slice(0, 16),
);
