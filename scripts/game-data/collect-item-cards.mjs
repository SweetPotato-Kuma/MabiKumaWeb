#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCardMatcher } from './card-match.mjs';
import { parseItemReference } from './mabi-resource.mjs';
import { parseScrollName, scrollSubtitle } from '../lib/enchant-scrolls.mjs';

/**
 * 아이템 설명과 아이콘을 모아 우리 워커에 올린다.
 *
 * ## 두 단계는 서로 다른 일이다
 *
 * **받기**는 공개 주소에서 파일을 가져오는 것뿐이라 아무 자격 증명도 필요 없다.
 * 받은 것은 `.cache/` 에 그대로 쌓인다.
 *
 * ## 그림은 클라이언트 내보내기에서
 *
 * 그림은 클라이언트 내보내기 결과(`.cache/client-src/exports/client-bundle`, 다른 곳이면
 * MABIKUMA_CLIENT_BUNDLE)의 무손실 WebP 를 올린다. 레이어마다 기본 색을 칠한 그림과, 경매장 매물
 * 색으로 다시 칠할 회색 레이어 시트를 같이 올리고 시트 정보는 카드의 `dye` 에 싣는다(src/features/itemcard/dye.ts).
 * 내보내기에 그림이 없는 아이템만 예전처럼 공개 주소의 PNG 를 받아 올린다.
 *
 * **올리기**는 우리 워커의 쓰기 경로를 두드리는 일이라 운영자 키가 있어야 한다. 그 경로가
 * 열려 있으면 아무나 우리 사전에 아무거나 밀어 넣고 저장 용량을 태울 수 있다.
 *
 * 그래서 두 단계를 갈라 두었다. 워커를 아직 안 만들었어도 받기는 먼저 해 둘 수 있다.
 *
 *   node collect-item-cards.mjs --check          아무것도 안 하고 개수만 센다
 *   node collect-item-cards.mjs --download       받기만 한다 (키 불필요)
 *   node collect-item-cards.mjs                  받고 올린다
 *
 *   --limit=<n>    카테고리 n 개까지만 (처음 돌려 볼 때)
 *   --category=<이름,이름>  그 카테고리만. 이름 사전에 몇 개 더한 뒤 그 칸만 다시 올릴 때
 *   --no-icons     그림은 건드리지 않고 글자만 올린다
 *   --recipe-icons 제작법(public/data/recipes.json)에 나오는 아이템 그림만 받고 올린다. 카드는
 *                  건드리지 않는다. 경매장에 올라온 적 없는 아이템은 이름 사전에 없어 위 흐름으로는
 *                  그림이 올라가지 않는다. 올린 뒤 `node scripts/build-recipes.mjs --icons-only` 로
 *                  제작법 데이터에 그림 파일 이름을 적는다
 *
 * 올리려면 저장소 뿌리의 `.env` 에 두 줄이 있어야 한다.
 *
 *   VITE_PROXY_URL=https://<워커주소>     어디로 올릴지
 *   MABIKUMA_ADMIN_KEY=<운영자 키>        올리는 게 나라는 증거
 *
 * ## 남의 서버다
 *
 * 그림을 받아 오는 곳은 개인이 운영하는 팬 프로젝트다. 한꺼번에 몰아치지 않는다.
 *   - 동시 4개까지만, 사이에 텀을 둔다
 *   - 한 번 받은 것은 `.cache/` 에 남겨 두고 다시 받지 않는다
 *   - 7.4MB 짜리 덩어리도 버전이 그대로면 다시 받지 않는다
 * 처음 한 번만 오래 걸리고, 그 뒤로는 새로 생긴 것만 받는다.
 */

const RESOURCE_HOST = 'https://mabires2.pril.cc';
const VERSION_URL = `${RESOURCE_HOST}/resourceversion/kr/kr_resourceversion.json`;
const RESOURCE_URL = `${RESOURCE_HOST}/resourcedata/kr/kr_resourcedata.bin.br`;
const ICON_URL = (id) => `${RESOURCE_HOST}/invimage/kr/${id}/${id}.png`;

const CACHE_DIR = resolve(process.cwd(), '.cache/item-cards');
const ICON_DIR = resolve(CACHE_DIR, 'icons');
const BUNDLE_ROOT = resolve(
  process.cwd(),
  process.env.MABIKUMA_CLIENT_BUNDLE ?? '.cache/client-src/exports/client-bundle',
);
const ITEMS_DIR = resolve(process.cwd(), 'public/data/items');

/** 워커의 ICON_BATCH_MAX 와 같아야 한다. 넘겨 보내면 400 이 돌아온다. */
const ICON_BATCH = 40;

/** 우리 워커로 동시에 보내는 아이콘 묶음 수. */
const UPLOAD_CONCURRENCY = 4;

/** 남의 서버에 거는 동시 요청 수. 넉넉히 낮춘다. */
const ICON_CONCURRENCY = 4;
const ICON_PAUSE_MS = 40;

/**
 * `.env` 를 읽어 넣는다.
 *
 * Vite 는 알아서 읽지만 맨 node 는 안 읽는다. 돌릴 때마다 set 명령을 치게 하느니
 * 이미 있는 파일을 보는 편이 낫다. 이미 들어 있는 환경 변수가 우선이다.
 */
function loadEnvFile() {
  let text;
  try {
    text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    // .env 가 없어도 환경 변수로 줄 수 있다. 여기서 멈출 이유는 없다.
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, raw] = match;
    if (process.env[key]) continue;
    process.env[key] = raw.trim().replace(/^["']|["']$/g, '');
  }
}

loadEnvFile();

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check') || args.has('--dry-run');
const downloadOnly = args.has('--download');
const skipIcons = args.has('--no-icons');
const recipeIconsOnly = args.has('--recipe-icons');
const limitArg = [...args].find((a) => a.startsWith('--limit='));
const categoryLimit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const onlyCategories = new Set(
  [...args]
    .filter((a) => a.startsWith('--category='))
    .flatMap((a) => a.slice('--category='.length).split(','))
    .map((name) => name.trim())
    .filter(Boolean),
);

/** 올리는 단계까지 가는가. 여기가 참일 때만 워커 주소와 키가 필요하다. */
const willUpload = !checkOnly && !downloadOnly;

const proxyUrl = (process.env.VITE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
const adminKey = (process.env.MABIKUMA_ADMIN_KEY ?? '').trim();

function log(...parts) {
  console.log('[item-cards]', ...parts);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** 리소스 덩어리는 7.4MB 다. 버전이 그대로면 받아 둔 것을 쓴다. */
async function loadResource() {
  await mkdir(CACHE_DIR, { recursive: true });

  const versionPath = resolve(CACHE_DIR, 'version.json');
  const blobPath = resolve(CACHE_DIR, 'resourcedata.bin.br');

  const response = await fetch(VERSION_URL);
  if (!response.ok) throw new Error(`목록을 받지 못했습니다. (HTTP ${response.status})`);
  const version = await response.json();

  const cachedVersion = await readFile(versionPath, 'utf8').catch(() => null);
  if (cachedVersion === JSON.stringify(version)) {
    const cached = await readFile(blobPath).catch(() => null);
    if (cached) {
      log('목록은 그대로입니다. 받아 둔 것을 씁니다.');
      return cached;
    }
  }

  log('목록 내려받는 중...');
  const blobResponse = await fetch(RESOURCE_URL);
  if (!blobResponse.ok) throw new Error(`목록을 받지 못했습니다. (HTTP ${blobResponse.status})`);

  const blob = Buffer.from(await blobResponse.arrayBuffer());
  await writeFile(blobPath, blob);
  await writeFile(versionPath, JSON.stringify(version));
  log(`목록 ${(blob.length / 1024 / 1024).toFixed(1)}MB 받음`);

  return blob;
}

/** 우리 이름 사전. 카테고리별로 어떤 이름이 있는지가 곧 무엇을 채울지다. */
async function loadDictionary() {
  const byCategory = new Map();

  for (const file of await readdir(ITEMS_DIR)) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    const shard = JSON.parse(await readFile(resolve(ITEMS_DIR, file), 'utf8'));
    if (!shard?.category || !Array.isArray(shard.items)) continue;
    byCategory.set(
      shard.category,
      shard.items.map((item) => item.name),
    );
  }

  return byCategory;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * 받기와 올리기 사이의 기록.
 *
 * `missing` 은 "그 번호에는 그림이 없더라" 는 기록이다. 번호 -> 기록한 시각. 없는 것을 매번
 * 다시 물어보지 않으려고 남긴다. 다만 그림 서버가 잠깐 비어 있던 것까지 영영 없다고 믿으면
 * 안 된다. 참룡검처럼 그때는 404 였다가 지금은 받아지는 것이 60개 넘게 있었다. 그래서 하루가
 * 지난 기록은 버리고 다시 묻는다. 옛 모양(번호 배열)은 시각이 없으니 바로 다시 묻는다.
 * `uploaded` 는 올리고 나서 워커가 돌려준 파일 이름이다. 이게 있으면 같은 그림을 두 번 올리지 않는다.
 * `files` 는 내보내기에서 올린 파일 이름들이다. 이름이 내용 해시라 있으면 다시 보내지 않는다.
 */
const MISSING_RETRY_MS = 24 * 60 * 60 * 1000;

async function loadState() {
  const saved = await readJson(resolve(CACHE_DIR, 'missing.json'), {});
  const entries = Array.isArray(saved) ? saved.map((id) => [String(id), 0]) : Object.entries(saved);
  const now = Date.now();
  return {
    missing: new Map(entries.filter(([, at]) => now - at < MISSING_RETRY_MS)),
    uploaded: new Map(Object.entries(await readJson(resolve(CACHE_DIR, 'uploaded.json'), {}))),
    files: new Set(await readJson(resolve(CACHE_DIR, 'uploaded-files.json'), [])),
  };
}

async function saveState(state) {
  await writeFile(
    resolve(CACHE_DIR, 'missing.json'),
    JSON.stringify(Object.fromEntries(state.missing)),
  );
  await writeFile(
    resolve(CACHE_DIR, 'uploaded.json'),
    JSON.stringify(Object.fromEntries(state.uploaded)),
  );
  await writeFile(resolve(CACHE_DIR, 'uploaded-files.json'), JSON.stringify([...state.files].sort()));
}

/** 가장 최근에 끝난 내보내기. 없으면 null 이고 그림은 모두 예전 PNG 로 간다. */
async function loadBundle() {
  const latest = await readJson(resolve(BUNDLE_ROOT, 'latest.json'), null);
  if (!latest?.run) return null;
  const run = resolve(BUNDLE_ROOT, latest.run);
  const images = await readJson(resolve(run, 'images/item-images.json'), null);
  if (!images) return null;
  return { run, images, layers: await readJson(resolve(run, 'images/item-layers.json'), {}) };
}

/**
 * 내보내기의 그림과 레이어 시트를 올리고 아이템마다 카드에 실을 값을 돌려준다.
 * 레이어 시트의 순번은 원래 레이어 번호 그대로라 `[번호, 파트, 기본 색]` 을 그대로 옮긴다.
 */
async function attachBundleIcons(ids, bundle, state) {
  const found = new Map();
  if (!bundle) return found;
  const files = new Map();
  const read = async (rel) => {
    const bytes = await readFile(resolve(bundle.run, rel));
    const file = iconFileName(bytes, 'webp');
    files.set(file, bytes);
    return file;
  };
  for (const id of ids) {
    const rel = bundle.images[String(id)]?.[0];
    if (!rel) continue;
    const icon = await read(rel);
    const layers = bundle.layers[String(id)];
    const dye = layers
      ? [
          await read(layers.sheet),
          layers.width,
          layers.height,
          layers.layers.map((layer) => [layer.layer, layer.part ?? '', layer.colour ?? '']),
        ]
      : null;
    found.set(String(id), { icon, dye });
  }
  if (willUpload) await uploadFiles(files, state);
  for (const [id, entry] of found) {
    if (willUpload && !state.files.has(entry.icon)) {
      found.delete(id);
      continue;
    }
    if (entry.dye && willUpload && !state.files.has(entry.dye[0])) entry.dye = null;
    if (willUpload) state.uploaded.set(id, entry.icon);
  }
  return found;
}

/** 파일 이름 -> 내용. 올라가 있지 않은 것만 40장씩 보낸다. */
async function uploadFiles(files, state) {
  const pending = [...files].filter(([file]) => !state.files.has(file));
  const batches = [];
  for (let i = 0; i < pending.length; i += ICON_BATCH) batches.push(pending.slice(i, i + ICON_BATCH));
  for (let i = 0; i < batches.length; i += UPLOAD_CONCURRENCY) {
    await Promise.all(
      batches.slice(i, i + UPLOAD_CONCURRENCY).map(async (batch) => {
        const { files: written } = await callWorker('/item-card/icons', 'POST', {
          icons: batch.map(([file, bytes]) => ({ key: file, base64: bytes.toString('base64') })),
        });
        for (const [file] of batch) {
          if (!written[file]) continue;
          if (written[file] !== file) {
            throw new Error(`워커가 붙인 파일 이름(${written[file]})이 예상(${file})과 다릅니다.`);
          }
          state.files.add(file);
        }
      }),
    );
    await saveState(state);
  }
  return pending.length;
}

const iconPath = (id) => resolve(ICON_DIR, `${id}.png`);

async function readCachedIcon(id) {
  return readFile(iconPath(id)).catch(() => null);
}

async function fetchIconOnce(id) {
  const response = await fetch(ICON_URL(id));
  if (!response.ok) return null;

  const bytes = Buffer.from(await response.arrayBuffer());
  // 없는 번호에는 HTML 404 페이지가 돌아온다. PNG 매직바이트로 거른다.
  const isPng = bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47;
  return isPng ? bytes : null;
}

/**
 * 한 번 실패했다고 없다고 믿지 않는다. 몰아서 받으면 그림 서버가 가끔 있는 그림에도 실패를
 * 돌려준다(2026-09-25, 16,000장 중 14장). 잠깐 쉬었다가 두 번 더 물어본다.
 */
const ICON_ATTEMPTS = 3;

async function fetchIcon(id) {
  for (let attempt = 1; attempt <= ICON_ATTEMPTS; attempt++) {
    const bytes = await fetchIconOnce(id).catch(() => null);
    if (bytes) return bytes;
    if (attempt < ICON_ATTEMPTS) await sleep(500 * attempt);
  }
  return null;
}

/**
 * 그림을 받아 `.cache/item-cards/icons/` 에 쌓는다. 자격 증명이 필요 없는 단계다.
 * 이미 받아 둔 것과 없다고 기록해 둔 것은 건너뛴다.
 */
async function downloadIcons(ids, state, onProgress) {
  await mkdir(ICON_DIR, { recursive: true });

  const todo = [];
  for (const id of ids) {
    if (state.missing.has(String(id))) continue;
    if (await readCachedIcon(id)) continue;
    todo.push(id);
  }
  if (todo.length === 0) return 0;

  let got = 0;
  for (let i = 0; i < todo.length; i += ICON_CONCURRENCY) {
    const slice = todo.slice(i, i + ICON_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (id) => ({ id, bytes: await fetchIcon(id).catch(() => null) })),
    );

    for (const { id, bytes } of results) {
      if (bytes) {
        await writeFile(iconPath(id), bytes);
        got++;
      } else {
        state.missing.set(String(id), Date.now());
      }
    }

    onProgress?.(Math.min(i + ICON_CONCURRENCY, todo.length), todo.length);
    await sleep(ICON_PAUSE_MS);
  }

  return got;
}

async function callWorker(path, method, body) {
  const response = await fetch(`${proxyUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-mabikuma-admin-key': adminKey,
      // 워커의 출처 검사는 브라우저 밖 호출을 막는다. 운영자 도구이므로 밝히고 통과한다.
      origin: (process.env.MABIKUMA_ORIGIN ?? 'https://mabi.spkuma.com').trim(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((parsed) => parsed?.error?.message)
      .catch(() => null);
    throw new Error(`${path} 실패: ${detail ?? `HTTP ${response.status}`}`);
  }

  return response.json();
}

/**
 * 워커가 붙이는 파일 이름과 같은 규칙. 그림 내용의 SHA-256 앞 16자리.
 * 올리기 전에 여기서 알 수 있으면 같은 그림을 두 번 보낼 이유가 없다.
 */
const iconFileName = (bytes, extension = 'png') =>
  `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${extension}`;

/**
 * 받아 둔 그림을 워커로 올린다. 여기부터 운영자 키가 필요하다.
 *
 * 그림이 같은 아이템이 많다(2026-09 기준 1만 5천 장 중 서로 다른 그림은 1만 7백 장).
 * 염색이나 성별만 다른 것들이다. 같은 그림은 파일 이름도 같아서, 동시에 올리면 R2 가 같은
 * 파일에 대한 동시 쓰기를 거절한다. 그래서 그림마다 한 번만 올리고, 같은 그림을 쓰는
 * 아이템들은 그 이름을 같이 쓰게 한다. 이미 올라간 그림이면 아예 보내지 않는다.
 */
async function uploadIcons(ids, state) {
  const alreadyUp = new Set(state.uploaded.values());
  const byFile = new Map();

  for (const id of ids) {
    if (state.uploaded.has(String(id))) continue;
    const bytes = await readCachedIcon(id);
    if (!bytes) continue;

    const file = iconFileName(bytes);
    if (alreadyUp.has(file)) {
      state.uploaded.set(String(id), file);
      continue;
    }
    const group = byFile.get(file) ?? { bytes, ids: [] };
    group.ids.push(id);
    byFile.set(file, group);
  }

  // 그림 하나에 대표 하나씩만 보낸다. 성공하면 같은 그림을 쓰는 아이템 모두에게 적는다.
  const pending = [...byFile.entries()].map(([file, group]) => ({
    id: group.ids[0],
    bytes: group.bytes,
    file,
    ids: group.ids,
  }));

  const batches = [];
  for (let i = 0; i < pending.length; i += ICON_BATCH)
    batches.push(pending.slice(i, i + ICON_BATCH));

  /**
   * 묶음 몇 개를 동시에 보낸다. 워커 한 번 부를 때 R2 연결을 6개까지만 열 수 있어서, 40장
   * 묶음 하나에 11초쯤 걸린다(2026-09 실측). 차례로 보내면 1만 5천 장에 한 시간이 넘는다.
   * 여기서 여럿을 겹쳐 보내면 워커 여러 개가 나눠 쓴다.
   */
  for (let i = 0; i < batches.length; i += UPLOAD_CONCURRENCY) {
    const wave = batches.slice(i, i + UPLOAD_CONCURRENCY);
    await Promise.all(
      wave.map(async (batch) => {
        const { files } = await callWorker('/item-card/icons', 'POST', {
          icons: batch.map(({ id, bytes }) => ({
            key: String(id),
            base64: bytes.toString('base64'),
          })),
        });
        for (const entry of batch) {
          const file = files[String(entry.id)];
          // 올리지 못한 것은 기록하지 않는다. 다음에 돌리면 다시 시도한다.
          if (!file) continue;
          if (file !== entry.file) {
            throw new Error(
              `워커가 붙인 파일 이름(${file})이 예상(${entry.file})과 다릅니다. 이름 규칙이 바뀌었는지 확인하세요.`,
            );
          }
          for (const id of entry.ids) state.uploaded.set(String(id), file);
        }
      }),
    );
    // 큰 칸은 수십 묶음이다. 중간에 끊겨도 올린 만큼은 남도록 한 바퀴마다 적어 둔다.
    await saveState(state);
  }

  return pending.length;
}

/**
 * 게임 안에서만 뜻이 있는 표기를 웹에서 읽을 수 있게 바꾼다.
 *
 *   `\n` 글자 그대로      2,254건  진짜 줄바꿈으로
 *   `<color=1>…</color>`    382건  강조 색. 글자만 남긴다(화면 규칙상 장식 색은 안 쓴다)
 *   `<hotkey name="…"/>`     68건  그 사람이 지정한 단축키 자리. 웹에서는 모르니 [단축키] 로
 *   `{0}` `{1}`               1건  아이템마다 게임이 채우는 자리. 비워 둘 수 없으니 … 로
 *
 * 건수는 2026-09 기준 우리 사전 15,202개에서 센 값이다.
 */
function cleanDescription(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/<hotkey\b[^>]*\/?>/g, '[단축키]')
    .replace(/<\/?color\b[^>]*>/g, '')
    .replace(/\{\d+\}/g, '…')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 이름이 조금 다르게 적힌 것을 잇는 열쇠.
 *
 * 경매장 이름과 게임 데이터 이름은 거의 같지만 두 군데가 어긋난다(2026-09, 95건).
 *   `…웨어(남성용)`  vs  `…웨어 (남성용)`   괄호 앞 한 칸
 *   `네반&&마하 …`   vs  `네반&마하 …`       경매장 API 가 & 를 && 로 적어 보낸다
 * 띄어쓰기를 지우고 && 를 & 로 본 모양이 같으면 같은 아이템으로 본다.
 */
const compactName = (name) => name.replace(/\s+/g, '').replace(/&&/g, '&');

/**
 * 보정 열쇠로 찾는 표. 서로 다른 아이템 둘이 같은 모양이 되면 그 열쇠는 버린다.
 * 틀린 설명을 붙이느니 안 붙이는 편이 낫다.
 */
function buildCompactIndex(items) {
  const index = new Map();
  const clashed = new Set();
  for (const [name, entry] of items) {
    const key = compactName(name);
    const seen = index.get(key);
    if (seen && seen.id !== entry.id) clashed.add(key);
    else index.set(key, entry);
  }
  for (const key of clashed) index.delete(key);
  return index;
}

function requireUploadConfig() {
  if (!proxyUrl) {
    throw new Error('.env 에 VITE_PROXY_URL(우리 워커 주소)이 없습니다. 올릴 곳을 모릅니다.');
  }
  if (!adminKey) {
    throw new Error(
      '.env 에 MABIKUMA_ADMIN_KEY(운영자 키)가 없습니다. 올릴 권한을 증명할 수 없습니다.',
    );
  }
}

/** 제작법에 나오는 아이템 그림만 받고 올린다(--recipe-icons). */
async function uploadRecipeIcons() {
  const recipes = await readJson(resolve(process.cwd(), 'public/data/recipes.json'), null);
  if (!recipes) throw new Error('public/data/recipes.json 이 없습니다. 먼저 제작법을 모으세요.');
  const state = await loadState();
  const ids = Object.keys(recipes.items).map(Number);
  const fromBundle = await attachBundleIcons(ids, await loadBundle(), state);
  await saveState(state);
  log(`제작법 아이템 중 내보내기 그림을 붙인 것 ${fromBundle.size}개`);
  const todo = ids.filter((id) => !fromBundle.has(String(id)) && !state.uploaded.has(String(id)));
  log(`제작법 아이템 ${ids.length}개, 그림이 아직 없는 것 ${todo.length}개`);
  if (checkOnly) return;

  const got = await downloadIcons(todo, state, (done, total) => {
    if (done % 100 < ICON_CONCURRENCY || done === total) log(`  받는 중 ${done}/${total}`);
  });
  await saveState(state);
  log(`  새로 받은 그림 ${got}`);
  if (downloadOnly) return;

  const sent = await uploadIcons(todo, state);
  await saveState(state);
  const attached = todo.filter((id) => state.uploaded.has(String(id))).length;
  log(`  올린 그림 ${sent}장, 그림이 붙은 아이템 ${attached}/${todo.length}`);
}

async function main() {
  if (willUpload) requireUploadConfig();
  if (recipeIconsOnly) return uploadRecipeIcons();

  const [resource, dictionary] = await Promise.all([loadResource(), loadDictionary()]);

  const { items, candidates, itemRows } = parseItemReference(resource);
  const compactIndex = buildCompactIndex(items);
  // 이름이 같은 게임 아이템이 여럿이면 카테고리를 보고 고른다. 이름만 보면 검 "간장" 에 음식 간장 카드가 붙는다.
  const matcher = createCardMatcher(candidates, dictionary);
  log(`목록 해독: ${itemRows}행에서 이름이 풀린 것 ${items.size}개`);

  // "인챈트 스크롤 - 올빼미" 는 게임 아이템이 아니다. 그림과 설명은 기본 스크롤의 것을 쓰고, 부제에 접두/접미와 랭크를 적는다.
  const enchantScrolls = (await readJson(resolve(process.cwd(), 'public/data/enchant-scrolls.json'), null))?.scrolls ?? {};

  const state = await loadState();
  const bundle = await loadBundle();
  log(bundle ? `그림: 클라이언트 내보내기 ${bundle.run}` : '그림: 내보내기가 없어 예전 PNG 를 씁니다');
  const categories = [...dictionary.keys()]
    .filter((category) => onlyCategories.size === 0 || onlyCategories.has(category))
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .slice(0, categoryLimit);

  let matched = 0;
  let fuzzy = 0;
  let missed = 0;
  let downloaded = 0;
  let withIcon = 0;

  for (const [index, category] of categories.entries()) {
    const step = `(${index + 1}/${categories.length}) ${category}`;
    const cards = [];
    const ids = [];

    for (const name of dictionary.get(category)) {
      // 카드 이름은 늘 사전 쪽 이름으로 올린다. 경매장이 그 이름으로 묻기 때문이다.
      const scroll = parseScrollName(name);
      const exact = matcher.pick(scroll ? scroll.base : name, category);
      const found = exact ?? compactIndex.get(compactName(scroll ? scroll.base : name));
      if (!found) {
        missed++;
        if (onlyCategories.size) log(`  못 찾음: ${category} / ${name}`);
        continue;
      }
      matched++;
      if (!exact) fuzzy++;
      cards.push({
        name,
        id: found.id,
        description: cleanDescription(found.description),
        subtitle: scroll && enchantScrolls[name] ? scrollSubtitle(enchantScrolls[name]) : '',
      });
      if (!skipIcons) ids.push(found.id);
    }

    if (cards.length === 0) {
      log(`${step}: 맞는 것이 없어 건너뜁니다`);
      continue;
    }

    if (checkOnly) {
      log(`${step}: ${cards.length}장 (세기만 함)`);
      continue;
    }

    const fromBundle = skipIcons ? new Map() : await attachBundleIcons(ids, bundle, state);
    const pngIds = ids.filter((id) => !fromBundle.has(String(id)));

    if (!skipIcons) {
      const got = await downloadIcons(pngIds, state, (done, total) => {
        if (done % 200 === 0 || done === total) log(`${step}: 그림 ${done}/${total} 받는 중`);
      });
      downloaded += got;
      await saveState(state);
    }

    if (downloadOnly) {
      log(`${step}: 그림 ${downloaded}장까지 받았습니다 (올리지 않음)`);
      continue;
    }

    if (!skipIcons) {
      await uploadIcons(pngIds, state);
      await saveState(state);
    }

    const payload = cards.map((card) => {
      const bundled = fromBundle.get(String(card.id));
      return {
        name: card.name,
        subtitle: card.subtitle,
        description: card.description,
        icon: bundled?.icon ?? state.uploaded.get(String(card.id)) ?? '',
        ...(bundled?.dye ? { dye: bundled.dye } : {}),
      };
    });
    withIcon += payload.filter((card) => card.icon).length;

    const { count } = await callWorker('/item-card/shard', 'PUT', { category, cards: payload });
    log(`${step}: ${count}장 올림`);
  }

  log('');
  log(`카테고리 ${categories.length}개`);
  log(`  목록에서 찾음   ${matched} (그중 띄어쓰기/&& 보정 ${fuzzy})`);
  log(`  못 찾음         ${missed}`);
  if (!checkOnly) log(`  이번에 받은 그림 ${downloaded}`);
  if (willUpload) log(`  그림까지 붙음   ${withIcon}`);

  if (checkOnly) log('세기만 했습니다. 받지도 올리지도 않았습니다.');
  if (downloadOnly) log(`받기만 했습니다. .cache 에 쌓여 있고, 올리려면 다시 돌리세요.`);
}

main().catch((error) => {
  console.error('[item-cards] 실패:', error.message);
  process.exitCode = 1;
});
