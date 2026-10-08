/**
 * 키트 확률표 기록은 저장소가 아니라 워커의 D1 이 원본이다(worker/kits.js). 운영자 PC 의 스크립트가 그 기록을 읽고,
 * 게임 클라이언트로만 만들 수 있는 그림 이름 표를 올릴 때 쓴다. 모두 운영자 키가 있어야 한다.
 *
 * .env 의 VITE_PROXY_URL(우리 워커 주소)과 MABIKUMA_ADMIN_KEY(운영자 키)를 쓴다. 키 값은 출력하지 않는다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function envValue(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match && match[1] === name) return match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // .env 가 없어도 환경 변수로 줄 수 있다.
  }
  return '';
}

async function call(path, init = {}) {
  const base = envValue('VITE_PROXY_URL').replace(/\/+$/, '');
  const key = envValue('MABIKUMA_ADMIN_KEY');
  if (!base) throw new Error('.env 에 VITE_PROXY_URL(우리 워커 주소)이 없습니다.');
  if (!key) throw new Error('.env 에 MABIKUMA_ADMIN_KEY(운영자 키)가 없습니다.');
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      // 워커는 허용한 출처의 요청만 받는다.
      origin: 'https://mabi.spkuma.com',
      'x-mabikuma-admin-key': key,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/** 기록 전체. { kits: [{ id, name, start, end, price, firstSeen?, grades, items }], icons: { 이름: 파일 } } */
export const readKitArchive = () => call('/kits/archive');

/** 그림 이름 표를 통째로 바꾼다. */
export const uploadKitIcons = (icons) =>
  call('/kits/icons', { method: 'POST', body: JSON.stringify({ icons }) });

/** 지난 키트를 더한다. 이미 있는 키트는 워커가 건드리지 않는다. */
export const importKitArchive = (archive) =>
  call('/kits/import', { method: 'POST', body: JSON.stringify(archive) });
