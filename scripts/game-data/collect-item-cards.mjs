#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCardMatcher } from './card-match.mjs';
import { parseScrollName, scrollSubtitle } from '../lib/enchant-scrolls.mjs';
import {
  defaultBundleRoot,
  isHiddenItem,
  loadBundleCandidates,
  loadBundleItems,
  loadItemIdPins,
} from './bundle-items.mjs';

/**
 * 아이템 카드(이름 옆 그림, 설명)를 우리 워커에 올린다.
 *
 * 모든 것은 클라이언트 내보내기(`.cache/client-src/exports/client-bundle`, 다른 곳이면
 * MABIKUMA_CLIENT_BUNDLE)에서 온다. 다른 서버에는 묻지 않는다.
 *
 * - 경매장 이름 -> 아이템 번호: 내보내기의 아이템 목록에서 고른다(card-match.mjs). 이름이 같은 아이템이
 *   여럿인 161개는 예전 선택을 item-id-pins.json 에 고정해 두었다
 * - 설명: 한국 서버에 보이는 그대로 고른다(bundle-items.mjs)
 * - 그림: 레이어마다 기본 색을 칠한 무손실 WebP 와, 경매장 매물 색으로 다시 칠할 회색 레이어 시트.
 *   시트 정보는 카드의 `dye` 에 싣는다(src/features/itemcard/dye.ts). 내보내기에 그림이 없는 아이템은
 *   예전에 올려 둔 그림을 그대로 둔다
 * - 경매장에 오른 적 없어 사전 카테고리가 없는 제작법 아이템은 `분류 없음` 칸에 올린다. 플레이어가 볼 수
 *   없는 아이템(NPC, 몬스터 장비, 내부 이름)은 올리지 않는다
 *
 *   node collect-item-cards.mjs              만들고 올린다
 *   node collect-item-cards.mjs --check      개수만 센다
 *   node collect-item-cards.mjs --compare    올리지 않고, 지난번에 올린 칸과 달라지는 카테고리를 알려 준다
 *
 *   --limit=<n>    카테고리 n 개까지만 (처음 돌려 볼 때)
 *   --force        지난번에 올린 것과 내용이 같은 카드 칸도 다시 쓴다
 *   --category=<이름,이름>  그 카테고리만. 이름 사전에 몇 개 더한 뒤 그 칸만 다시 올릴 때
 *   --no-icons     그림은 건드리지 않고 글자만 올린다
 *   --recipe-icons 제작법(public/data/recipes.json)에 나오는 아이템 그림만 올린다. 카드는 건드리지 않는다.
 *                  올린 뒤 `node scripts/build-recipes.mjs --icons-only` 로 제작법 데이터에 그림 이름을 적는다
 *
 * 올리려면 저장소 뿌리의 `.env` 에 두 줄이 있어야 한다.
 *
 *   VITE_PROXY_URL=https://<워커주소>     어디로 올릴지
 *   MABIKUMA_ADMIN_KEY=<운영자 키>        올리는 게 나라는 증거
 *
 * 그림 파일 이름은 내용 해시라 이미 올린 것은 다시 보내지 않고, 카드 칸도 지난번과 같으면 보내지 않는다.
 */

const CACHE_DIR = resolve(process.cwd(), '.cache/item-cards');
const BUNDLE_ROOT = defaultBundleRoot();
const ITEMS_DIR = resolve(process.cwd(), 'public/data/items');

/** 사전 카테고리가 없는 아이템의 카드 칸. src/features/itemcard/cards.ts 의 UNCATEGORIZED_CARDS 와 같아야 한다. */
const UNCATEGORIZED = '분류 없음';

/** 워커의 ICON_BATCH_MAX 와 같아야 한다. 넘겨 보내면 400 이 돌아온다. */
const ICON_BATCH = 40;

/**
 * 우리 워커로 동시에 보내는 묶음 수. 워커 한 번 부를 때 R2 연결을 6개까지만 열 수 있어서, 40장 묶음
 * 하나에 11초쯤 걸린다(2026-09 실측). 여럿을 겹쳐 보내면 워커 여러 개가 나눠 쓴다.
 */
const UPLOAD_CONCURRENCY = 4;

/**
 * `.env` 를 읽어 넣는다. Vite 는 알아서 읽지만 맨 node 는 안 읽는다. 이미 들어 있는 환경 변수가 우선이다.
 */
function loadEnvFile() {
  let text;
  try {
    text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
    // .env 가 없어도 환경 변수로 줄 수 있다.
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
/** 칸을 만들기까지 하고 올리지 않는다. 지난번에 올린 칸과 비교만 한다. */
const compareOnly = args.has('--compare');
/** 내용이 같아도 카드 칸을 다시 쓴다. 워커 쪽 칸을 손으로 고쳤거나 지웠을 때 쓴다. */
const forceShards = args.has('--force');
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
const willUpload = !checkOnly && !compareOnly;

const proxyUrl = (process.env.VITE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
const adminKey = (process.env.MABIKUMA_ADMIN_KEY ?? '').trim();

function log(...parts) {
  console.log('[item-cards]', ...parts);
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
 * 올린 기록.
 *
 * `uploaded` 는 아이템 번호 -> 카드에 붙인 그림 파일 이름이다. 제작법 데이터(build-recipes.mjs)도 읽는다.
 * `files` 는 올린 파일 이름들이다. 이름이 내용 해시라 있으면 다시 보내지 않는다.
 * `shards` 는 카테고리 -> 지난번에 올린 칸 내용의 해시다.
 */
async function loadState() {
  return {
    uploaded: new Map(Object.entries(await readJson(resolve(CACHE_DIR, 'uploaded.json'), {}))),
    files: new Set(await readJson(resolve(CACHE_DIR, 'uploaded-files.json'), [])),
    shards: new Map(Object.entries(await readJson(resolve(CACHE_DIR, 'uploaded-shards.json'), {}))),
  };
}

async function saveState(state) {
  await writeFile(
    resolve(CACHE_DIR, 'uploaded.json'),
    JSON.stringify(Object.fromEntries(state.uploaded)),
  );
  await writeFile(
    resolve(CACHE_DIR, 'uploaded-files.json'),
    JSON.stringify([...state.files].sort()),
  );
  await writeFile(
    resolve(CACHE_DIR, 'uploaded-shards.json'),
    JSON.stringify(Object.fromEntries(state.shards)),
  );
}

/**
 * 카드 칸을 올린다. 지난번에 올린 내용과 같으면 보내지 않는다. 칸 하나가 KV 쓰기 한 번이고 그림 목록도
 * 같이 다시 쓰이므로, 바뀐 칸만 보내면 한 번 돌리는 데 드는 쓰기가 바뀐 카테고리 수로 준다.
 * 비교만 할 때는 달라지는지만 돌려준다.
 */
async function putShard(category, cards, state) {
  const digest = createHash('sha256').update(JSON.stringify(cards)).digest('hex');
  const same = state.shards.get(category) === digest;
  if (compareOnly || (!forceShards && same)) return { count: cards.length, skipped: true, same };
  const { count } = await callWorker('/item-card/shard', 'PUT', { category, cards });
  state.shards.set(category, digest);
  await saveState(state);
  return { count, skipped: false, same };
}

/** 가장 최근에 끝난 내보내기. 카드는 내보내기만으로 만든다. */
async function loadBundle() {
  const latest = await readJson(resolve(BUNDLE_ROOT, 'latest.json'), null);
  if (!latest?.run) {
    throw new Error(
      `클라이언트 내보내기가 없습니다(${BUNDLE_ROOT}). 먼저 Run-ClientExport.ps1 을 돌리세요.`,
    );
  }
  const run = resolve(BUNDLE_ROOT, latest.run);
  return {
    run,
    images: await readJson(resolve(run, 'images/item-images.json'), {}),
    layers: await readJson(resolve(run, 'images/item-layers.json'), {}),
  };
}

/**
 * 내보내기의 그림과 레이어 시트를 올리고 아이템마다 카드에 실을 값을 돌려준다.
 * 레이어 시트의 순번은 원래 레이어 번호 그대로라 `[번호, 파트, 기본 색]` 을 그대로 옮긴다.
 */
async function attachBundleIcons(ids, bundle, state) {
  const found = new Map();
  const files = new Map();
  const read = async (rel) => {
    const bytes = await readFile(resolve(bundle.run, rel));
    const file = iconFileName(bytes);
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
  for (let i = 0; i < pending.length; i += ICON_BATCH)
    batches.push(pending.slice(i, i + ICON_BATCH));
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

/** 워커가 붙이는 파일 이름과 같은 규칙. 그림 내용의 SHA-256 앞 16자리와 형식 확장자. */
const iconFileName = (bytes) =>
  `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.webp`;

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

/** 제작법에 나오는 아이템 그림만 올린다(--recipe-icons). */
async function uploadRecipeIcons() {
  const recipes = await readJson(resolve(process.cwd(), 'public/data/recipes.json'), null);
  if (!recipes) throw new Error('public/data/recipes.json 이 없습니다. 먼저 제작법을 모으세요.');
  const state = await loadState();
  const ids = Object.keys(recipes.items).map(Number);
  const fromBundle = await attachBundleIcons(ids, await loadBundle(), state);
  if (willUpload) await saveState(state);
  log(`제작법 아이템 ${ids.length}개 가운데 내보내기 그림을 붙인 것 ${fromBundle.size}개`);
}

/**
 * 제작법에만 나오고 경매장에 오른 적 없는 아이템의 카드. 사전 카테고리가 없어 상세 화면에 설명이
 * 비어 있던 것들이다. 설명이 없거나 플레이어가 볼 수 없는 아이템은 뺀다.
 */
async function uploadUncategorized(dictionary, bundle, bundleItems, state) {
  const recipes = await readJson(resolve(process.cwd(), 'public/data/recipes.json'), null);
  if (!recipes) return null;
  const known = new Set([...dictionary.values()].flat());
  const picked = new Map();
  let hidden = 0;
  for (const [id, [name]] of Object.entries(recipes.items)) {
    if (known.has(name) || picked.has(name)) continue;
    const description = bundleItems.get(id)?.description ?? '';
    if (!description) continue;
    if (isHiddenItem(name, description)) {
      hidden++;
      continue;
    }
    picked.set(name, { id, description });
  }
  if (checkOnly) return { count: picked.size, hidden };
  const icons = await attachBundleIcons(
    [...picked.values()].map((card) => card.id),
    bundle,
    state,
  );
  if (willUpload) await saveState(state);
  const cards = [...picked].map(([name, card]) => {
    const bundled = icons.get(card.id);
    return {
      name,
      subtitle: '',
      description: card.description,
      icon: bundled?.icon ?? '',
      ...(bundled?.dye ? { dye: bundled.dye } : {}),
    };
  });
  const { count, skipped, same } = await putShard(UNCATEGORIZED, cards, state);
  return { count, hidden, skipped, same };
}

async function main() {
  if (willUpload) requireUploadConfig();
  if (recipeIconsOnly) return uploadRecipeIcons();

  const bundle = await loadBundle();
  log(`클라이언트 내보내기 ${bundle.run}`);
  const dictionary = await loadDictionary();
  const bundleItems = loadBundleItems(bundle.run);
  const { items, candidates } = loadBundleCandidates(bundle.run);
  const byId = new Map(
    [...candidates.values()].flat().map((candidate) => [candidate.id, candidate]),
  );
  const compactIndex = buildCompactIndex(items);
  // 이름이 같은 게임 아이템이 여럿이면 카테고리를 보고 고른다. 이름만 보면 검 "간장" 에 음식 간장 카드가 붙는다.
  const matcher = createCardMatcher(candidates, dictionary);
  const pins = loadItemIdPins();
  log(
    `아이템 ${items.size}개(이름 기준), 고정해 둔 선택 ${Object.values(pins).reduce((n, v) => n + Object.keys(v).length, 0)}개`,
  );

  // "인챈트 스크롤 - 올빼미" 는 게임 아이템이 아니다. 그림과 설명은 기본 스크롤의 것을 쓰고, 부제에 접두/접미와 랭크를 적는다.
  const enchantScrolls =
    (await readJson(resolve(process.cwd(), 'public/data/enchant-scrolls.json'), null))?.scrolls ??
    {};

  const state = await loadState();
  const categories = [...dictionary.keys()]
    .filter((category) => onlyCategories.size === 0 || onlyCategories.has(category))
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .slice(0, categoryLimit);

  let matched = 0;
  let fuzzy = 0;
  let missed = 0;
  let withIcon = 0;
  let unchanged = 0;
  const changed = [];

  for (const [index, category] of categories.entries()) {
    const step = `(${index + 1}/${categories.length}) ${category}`;
    const cards = [];
    const ids = [];

    for (const name of dictionary.get(category)) {
      // 카드 이름은 늘 사전 쪽 이름으로 올린다. 경매장이 그 이름으로 묻기 때문이다.
      const scroll = parseScrollName(name);
      const base = scroll ? scroll.base : name;
      const pinned = byId.get(pins[category]?.[name]);
      const exact = pinned ?? matcher.pick(base, category);
      const found = exact ?? compactIndex.get(compactName(base));
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
        description: bundleItems.get(String(found.id))?.description ?? '',
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
    const payload = cards.map((card) => {
      const bundled = fromBundle.get(String(card.id));
      return {
        name: card.name,
        subtitle: card.subtitle,
        description: card.description,
        // 내보내기에 그림이 없는 아이템은 예전에 올려 둔 그림을 그대로 쓴다.
        icon: bundled?.icon ?? state.uploaded.get(String(card.id)) ?? '',
        ...(bundled?.dye ? { dye: bundled.dye } : {}),
      };
    });
    withIcon += payload.filter((card) => card.icon).length;

    const { count, skipped, same } = await putShard(category, payload, state);
    if (same) unchanged++;
    else changed.push(category);
    log(
      `${step}: ${count}장 ${same ? '그대로(지난번과 같음)' : skipped ? '바뀜(올리지 않음)' : '올림'}`,
    );
  }

  const uncategorized =
    categoryLimit === Infinity && (onlyCategories.size === 0 || onlyCategories.has(UNCATEGORIZED))
      ? await uploadUncategorized(dictionary, bundle, bundleItems, state)
      : null;
  if (uncategorized && uncategorized.same === false) changed.push(UNCATEGORIZED);

  log('');
  if (uncategorized) {
    log(
      `${UNCATEGORIZED}: ${uncategorized.count}장, 볼 수 없는 아이템 ${uncategorized.hidden}개 뺌`,
    );
  }
  log(`카테고리 ${categories.length}개`);
  log(`  찾음       ${matched} (그중 띄어쓰기/&& 보정 ${fuzzy})`);
  log(`  못 찾음    ${missed}`);
  if (!checkOnly) {
    log(`  그림 붙음  ${withIcon}`);
    log(
      `  지난번과 같은 칸 ${unchanged}, 달라진 칸 ${changed.length}${changed.length ? `: ${changed.join(', ')}` : ''}`,
    );
  }
  if (checkOnly) log('세기만 했습니다. 올리지 않았습니다.');
  if (compareOnly) log('비교만 했습니다. 올리지 않았습니다.');
}

main().catch((error) => {
  console.error('[item-cards] 실패:', error.message);
  process.exitCode = 1;
});
