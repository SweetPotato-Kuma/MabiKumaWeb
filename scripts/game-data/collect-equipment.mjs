#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCardMatcher } from './card-match.mjs';
import { parseEquipmentResource } from './mabi-equipment.mjs';
import { parseItemReference } from './mabi-resource.mjs';

/**
 * 장비 시뮬레이터에 쓸 데이터를 모아 우리 워커에 올린다.
 *
 * `collect-item-cards.mjs` 와 같은 두 단계다.
 *   받기    공개된 곳 ──▶ .cache/equipment/     자격 증명 필요 없음
 *   올리기  이 PC ──(운영자 키)──▶ 워커 ──▶ KV     우리 서버 필요
 *
 *   node collect-equipment.mjs --check       아무것도 받지 않고 몇 개인지만 센다
 *   node collect-equipment.mjs --download    아이템별 능력치만 받아 둔다 (키 불필요)
 *   node collect-equipment.mjs --build       받은 것으로 칸을 만들어 .cache/equipment/shards 에만 쓴다
 *   node collect-equipment.mjs               받고 올린다
 *
 *   --limit=<n>    카테고리 n 개까지만 (처음 돌려 볼 때)
 *   --category=<이름,이름>  그 카테고리만. 이름 사전에 몇 개 더한 뒤 그 칸만 다시 올릴 때
 *
 * ## 무엇을 어디서 가져오는가
 *
 * 리소스 덩어리(카드 도구가 이미 받아 둔 것)에 대부분이 있다.
 *   개조      ItemExtendUpgradeList → ItemUpgradeList
 *   세공      ItemExtendMetalWareList(장비 종류) + MetalWareAbilityList + MetalWareLevelList
 * 덩어리에 없는 것은 아이템마다 따로 묻는 JSON 에 있다.
 *   기본 능력치   Par_AttackMin 같은 칸
 *   랜덤 능력치   XML.random_product  "attack_min,0,10;critical,0,10"  (기본값에 더하는 폭)
 *   특별 개조     XML.enhance_type_s / enhance_type_r / enhance_max_lv
 *
 * ## 남의 서버다
 *
 * 아이템 JSON 은 6천 번 넘게 물어야 한다. 동시 3개, 사이에 텀을 두고, 한 번 받은 것은
 * `.cache/equipment/json/` 에 남겨 다시 묻지 않는다. 처음 한 번만 오래 걸린다.
 */

const RESOURCE_HOST = 'https://mabires2.pril.cc';
const VERSION_URL = `${RESOURCE_HOST}/resourceversion/kr/kr_resourceversion.json`;
const RESOURCE_URL = `${RESOURCE_HOST}/resourcedata/kr/kr_resourcedata.bin.br`;
const ITEM_JSON_URL = 'https://mabiapi.pril.cc/prilus.mabiapi/ItemJson';

/** 카드 도구와 같은 덩어리를 쓴다. 한쪽이 받아 두면 다른 쪽은 다시 받지 않는다. */
const RESOURCE_DIR = resolve(process.cwd(), '.cache/item-cards');
const CACHE_DIR = resolve(process.cwd(), '.cache/equipment');
const JSON_DIR = resolve(CACHE_DIR, 'json');
const SHARD_DIR = resolve(CACHE_DIR, 'shards');
const ITEMS_DIR = resolve(process.cwd(), 'public/data/items');

const JSON_CONCURRENCY = 3;
const JSON_PAUSE_MS = 80;

/** 특별 개조 단계 상한을 적지 않은 아이템이 많다. 게임 안내의 기본 상한이 8단계다. */
const DEFAULT_ENHANCE_MAX = 8;

function loadEnvFile() {
  let text;
  try {
    text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  } catch {
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
const checkOnly = args.has('--check');
const downloadOnly = args.has('--download');
const buildOnly = args.has('--build');
const limitArg = [...args].find((a) => a.startsWith('--limit='));
const categoryLimit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const onlyCategories = new Set(
  [...args]
    .filter((a) => a.startsWith('--category='))
    .flatMap((a) => a.slice('--category='.length).split(','))
    .map((name) => name.trim())
    .filter(Boolean),
);
const willUpload = !checkOnly && !downloadOnly && !buildOnly;

const proxyUrl = (process.env.VITE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
const adminKey = (process.env.MABIKUMA_ADMIN_KEY ?? '').trim();

const log = (...parts) => console.log('[equipment]', ...parts);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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
      return cached;
    }
  }

  log('리소스 내려받는 중...');
  const blobResponse = await fetch(RESOURCE_URL);
  if (!blobResponse.ok) throw new Error(`리소스를 받지 못했습니다. (HTTP ${blobResponse.status})`);
  const blob = Buffer.from(await blobResponse.arrayBuffer());
  await writeFile(blobPath, blob);
  await writeFile(versionPath, JSON.stringify(version));
  return blob;
}

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

/**
 * 사이트가 장비 시뮬레이터를 여는 카테고리. 원본은 src/features/equipment/api.ts 한 곳이라 거기서 읽는다.
 * 목록을 여기 따로 적어 두면 한쪽만 고쳐지는 일이 생긴다.
 */
const EQUIPMENT_CATEGORIES = (() => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/equipment/api.ts'), 'utf8');
  const block = /EQUIPMENT_CATEGORIES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(source)?.[1];
  if (!block)
    throw new Error('src/features/equipment/api.ts 에서 EQUIPMENT_CATEGORIES 를 찾지 못했습니다.');
  return new Set([...block.matchAll(/'([^']+)'/g)].map((match) => match[1]));
})();

/** 카드 도구와 같은 이름 보정. 띄어쓰기와 경매장의 && 표기만 다른 것을 잇는다. */
const compactName = (name) => name.replace(/\s+/g, '').replace(/&&/g, '&');

/** f32 로 들어온 0.009999999776 같은 값을 사람이 읽는 값으로. */
const round = (value) => Math.round(value * 1e4) / 1e4;

// ---------------------------------------------------------------------------
// 아이템 JSON (gRPC-web 한 번)

function varintBytes(value) {
  const bytes = [];
  let n = value;
  while (n > 127) {
    bytes.push((n & 127) | 128);
    n >>>= 7;
  }
  bytes.push(n);
  return bytes;
}

/** ItemJsonReq { 100: Region = "kr", 1: Id } 를 grpc-web 틀 하나에 싣는다. */
function itemJsonRequest(id) {
  const region = Buffer.from('kr');
  const message = Buffer.from([
    ...varintBytes((100 << 3) | 2),
    ...varintBytes(region.length),
    ...region,
    0x08,
    ...varintBytes(id),
  ]);
  const frame = Buffer.alloc(5 + message.length);
  frame.writeUInt32BE(message.length, 1);
  message.copy(frame, 5);
  return frame;
}

/** 응답 틀에서 JsonRes { 1: Json } 의 문자열만 꺼낸다. 오류 트레일러면 null. */
function readItemJsonResponse(buffer) {
  let position = 0;
  let json = null;
  while (position + 5 <= buffer.length) {
    const flag = buffer[position];
    const length = buffer.readUInt32BE(position + 1);
    const body = buffer.subarray(position + 5, position + 5 + length);
    position += 5 + length;

    if (flag & 0x80) {
      const status = /grpc-status:\s*(\d+)/.exec(body.toString())?.[1];
      if (status && status !== '0') return null;
      continue;
    }
    if (body[0] !== 0x0a) continue;
    let length2 = 0;
    let shift = 0;
    let cursor = 1;
    let byte;
    do {
      byte = body[cursor++];
      length2 |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    json = body.subarray(cursor, cursor + length2).toString('utf8');
  }
  return json;
}

async function fetchItemJson(id) {
  const response = await fetch(ITEM_JSON_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/grpc-web+proto',
      accept: 'application/grpc-web+proto',
      'x-grpc-web': '1',
    },
    body: itemJsonRequest(id),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = readItemJsonResponse(Buffer.from(await response.arrayBuffer()));
  return json ? JSON.parse(json) : null;
}

/** 같은 모양의 요청({ Region, Id })을 받는 다른 메서드를 부른다. 첫 데이터 틀의 몸통만 돌려준다. */
async function callGrpc(method, id) {
  const response = await fetch(`https://mabiapi.pril.cc/prilus.mabiapi/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/grpc-web+proto',
      accept: 'application/grpc-web+proto',
      'x-grpc-web': '1',
    },
    body: itemJsonRequest(id),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  let position = 0;
  while (position + 5 <= buffer.length) {
    const flag = buffer[position];
    const length = buffer.readUInt32BE(position + 1);
    const body = buffer.subarray(position + 5, position + 5 + length);
    position += 5 + length;
    if (flag & 0x80) {
      const status = /grpc-status:\s*(\d+)/.exec(body.toString())?.[1];
      if (status && status !== '0') return null;
      continue;
    }
    return body;
  }
  return null;
}

/** 필드 1 한 칸의 [시작, 끝]. JsonRes 와 AllowItemsRes 모두 필드 1 하나짜리 메시지다. */
function fieldOneRange(body) {
  if (!body || body[0] !== 0x0a) return null;
  let cursor = 1;
  let length = 0;
  let shift = 0;
  let byte;
  do {
    byte = body[cursor++];
    length |= (byte & 127) << shift;
    shift += 7;
  } while (byte & 128);
  return [cursor, cursor + length];
}

/** JsonRes { 1: Json } */
function readJsonRes(body) {
  const range = fieldOneRange(body);
  return range ? body.subarray(range[0], range[1]).toString('utf8') : null;
}

/** 필드 1 에 packed varint 로 들어 있는 번호 목록(OptionSetAllowItemsRes.AllowItemIds). */
function readPackedIds(body) {
  const range = fieldOneRange(body);
  if (!range) return [];
  let [cursor] = range;
  const end = range[1];
  let byte;
  const ids = [];
  while (cursor < end) {
    let value = 0;
    let factor = 1;
    do {
      byte = body[cursor++];
      value += (byte & 127) * factor;
      factor *= 128;
    } while (byte & 128);
    ids.push(value);
  }
  return ids;
}

const ENCHANT_DIR = resolve(CACHE_DIR, 'enchants');
const enchantPath = (id) => resolve(ENCHANT_DIR, `${id}.json`);

/**
 * 인챈트 하나: 효과 원문(JSON)과 붙일 수 있는 아이템 번호 목록. 1,400개 남짓이라 두 번씩 물어도
 * 아이템 JSON 보다 적다. 받아 둔 것은 다시 묻지 않는다.
 */
async function downloadEnchants(ids) {
  await mkdir(ENCHANT_DIR, { recursive: true });
  const todo = [];
  for (const id of ids) {
    if (await readFile(enchantPath(id)).catch(() => null)) continue;
    todo.push(id);
  }
  let got = 0;
  for (let i = 0; i < todo.length; i += JSON_CONCURRENCY) {
    const slice = todo.slice(i, i + JSON_CONCURRENCY);
    await Promise.all(
      slice.map(async (id) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const text = readJsonRes(await callGrpc('OptionSetJson', id));
            const allow = readPackedIds(await callGrpc('OptionSetAllowItems', id));
            await writeFile(
              enchantPath(id),
              JSON.stringify({ json: text ? JSON.parse(text) : null, allow }),
            );
            got++;
            return;
          } catch {
            await sleep(500);
          }
        }
      }),
    );
    if ((i / JSON_CONCURRENCY) % 50 === 0)
      log(`  인챈트 ${Math.min(i + JSON_CONCURRENCY, todo.length)}/${todo.length}`);
    await sleep(JSON_PAUSE_MS);
  }
  return got;
}

const jsonPath = (id) => resolve(JSON_DIR, `${id}.json`);

async function readCachedJson(id) {
  const text = await readFile(jsonPath(id), 'utf8').catch(() => null);
  return text ? JSON.parse(text) : null;
}

async function downloadItemJsons(ids, missing) {
  await mkdir(JSON_DIR, { recursive: true });
  const todo = [];
  for (const id of ids) {
    if (missing.has(id)) continue;
    if (await readCachedJson(id)) continue;
    todo.push(id);
  }
  if (todo.length === 0) return 0;

  let got = 0;
  for (let i = 0; i < todo.length; i += JSON_CONCURRENCY) {
    const slice = todo.slice(i, i + JSON_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (id) => {
        // 한 번 삐끗한 것은 한 번만 다시 묻는다. 그래도 안 되면 다음 실행 때 다시 본다.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            return { id, json: await fetchItemJson(id), failed: false };
          } catch {
            await sleep(500);
          }
        }
        return { id, json: null, failed: true };
      }),
    );
    for (const { id, json, failed } of results) {
      if (json) {
        await writeFile(jsonPath(id), JSON.stringify(json));
        got++;
      } else if (!failed) {
        missing.add(id);
      }
    }
    if ((i / JSON_CONCURRENCY) % 50 === 0)
      log(`  아이템 JSON ${Math.min(i + JSON_CONCURRENCY, todo.length)}/${todo.length}`);
    await sleep(JSON_PAUSE_MS);
  }
  return got;
}

// ---------------------------------------------------------------------------
// 레코드 만들기

/**
 * 기본 능력치. JSON 의 칸 이름을 화면이 쓰는 능력치 이름으로 바꾼다.
 * 개조와 랜덤 능력치가 쓰는 이름(attack_min 등)과 맞춰 두어야 더하기가 된다.
 */
const BASE_FIELDS = [
  ['Par_AttackMin', 'attack_min'],
  ['Par_AttackMax', 'attack_max'],
  ['Par_WAttackMin', 'wound_min'],
  ['Par_WAttackMax', 'wound_max'],
  ['Par_AttackBalance', 'balance'],
  ['Par_CriticalRate', 'critical'],
  ['Par_Defense', 'defense'],
  ['Par_ProtectRate', 'protect'],
];

/**
 * XML 에 따로 적힌 고정 옵션. 게임 툴팁의 기본 성능 칸에 파란 글씨로 나오는 것들이다.
 * 뜻이 확실한 것만 옮긴다. 단위를 모르는 칸(mana_recover 등)은 틀린 숫자가 될 수 있어 뺐다.
 */
const XML_FIELDS = [
  'lance_piercing',
  'smash_damage',
  'magic_defense',
  'magic_protect',
  'immune_melee',
  'immune_ranged',
  'immune_magic',
  'max_bullet',
  'mana_reduce_percent',
];

function baseStats(json) {
  const base = {};
  for (const [field, stat] of BASE_FIELDS) {
    const value = Number(json[field] ?? 0);
    if (value) base[stat] = value;
  }
  for (const field of XML_FIELDS) {
    const value = Number(json.XML?.[field] ?? 0);
    if (value) base[field] = round(value);
  }
  // 내구력은 게임 안에서 1/1000 로 보인다(20000 → 20).
  const durability = Math.round(Number(json.Par_DurabilityMax ?? 0) / 1000);
  if (durability) base.durability = durability;
  return base;
}

/** "attack_min,0,10;critical,0,10" → [["attack_min", 0, 10], ...] */
function randomStats(xml) {
  const text = xml?.random_product;
  if (typeof text !== 'string' || !text) return [];
  return text
    .split(';')
    .map((part) => part.split(','))
    .filter((parts) => parts.length === 3 && parts[0])
    .map(([name, min, max]) => [
      name === 'durability_filled_max' ? 'durability' : name,
      Number(min),
      Number(max),
    ])
    .filter(([, min, max]) => Number.isFinite(min) && Number.isFinite(max));
}

function specialUpgrade(xml) {
  const s = Number(xml?.enhance_type_s ?? 0);
  const r = Number(xml?.enhance_type_r ?? 0);
  if (!s && !r) return null;
  const max = Number(xml?.enhance_max_lv ?? 0) || DEFAULT_ENHANCE_MAX;
  return { s, r, max };
}

/**
 * 게임 데이터에 한글 이름이 없는 개조 NPC. 널리 알려진 이름만 옮겼다.
 * 확실하지 않은 NPC 는 적지 않는다. 화면이 "이름 미확인" 으로 센다.
 */
const NPC_NAME_FALLBACK = {
  malcolm: '말콤',
  tracy: '트레이시',
  brenda: '브렌다',
  eluned: '엘루네드',
  gilmore: '길모어',
  osla: '오슬라',
  granatl: '그라나트',
  // 게임 데이터에 한글 이름이 없는 NPC. 영문 위키의 위치, 직업, 테마곡을 한글 위키의 지역별 NPC
  // 목록과 맞춰 확인했다(2026-09-25).
  colm: '컬룸', // 타라 무기점
  kayna: '케이나', // 카브 항구 대장장이
  guardmerchant: '친위대 무기 수리병', // 타라 임시 사령부
  weiss: '바이스', // 실리엔 생태 보호 지구 그랜드마스터 마법학자
  blyth: '블리스', // 벨바스트 대장장이
  effie: '에피', // 켈라 베이스 캠프 잡화점
  ilsa: '일리자', // 타라 엠포리움 잡화점
  finola: '피놀라', // 타라 마법 상점
  art: '아트', // 아브 네아
  banhallen: '바날렌', // 벨바스트 잡화점
  siobhanin: '시버닌', // 카브 항구 잡화점
  zeder: '제더', // 발레스 잡화점
  hecter: '헥터', // 힐웬 광산 그랜드마스터 엔지니어
  huw: '휴', // 이멘 마하 마리오네트 상점
  lepus: '레푸스', // 필리아 재봉사
  // 헥터가 각 마을 교역소로 보낸 견습 엔지니어. 이름이 같아 마을을 붙인다.
  engineertirchonaill: '수습 엔지니어(티르코네일)',
  engineerdunbarton: '수습 엔지니어(던바튼)',
  engineertara: '수습 엔지니어(타라)',
};

/**
 * 방문자가 찾아갈 수 없는 NPC. 테스트 서버 전용, 빈 칸, 그리고 일본 서버에만 있는 네코지마의
 * NPC(멘툼, 타티스)다. 한국 서버의 두근두근 아일랜드는 네코지마를 본뜬 섬이지만 상점 NPC 가 없다.
 */
const HIDDEN_NPC = /^(testserver_|none$|$|mentum$|thathis$)/;

/**
 * 내부 이름(ferghus) → 한글 이름(퍼거스).
 *
 * NPC 도 종족 한 줄로 들어 있고 ClassName 이 "Nao_Ferghus", "g28_nerys", "Combatcontest_Edern"
 * 처럼 앞머리가 붙은 내부 이름이다. 끝 조각이 개조 데이터의 이름과 같으면 같은 NPC 로 본다.
 * 같은 NPC 의 이벤트용 줄(인형, 대회 참가자)도 이름은 같아서 무엇을 고르든 결과가 같다.
 */
function buildNpcNames(races, text) {
  const names = new Map();
  for (const race of races) {
    const cls = String(race.ClassName ?? '').toLowerCase();
    const name = text(race.Name);
    if (!cls || !name) continue;
    const key = cls.includes('_') ? cls.slice(cls.lastIndexOf('_') + 1) : cls;
    // 정확히 같은 내부 이름이 있으면 그것을 먼저 믿는다.
    if (cls === key || !names.has(key)) names.set(key, name);
  }
  return (id) => {
    if (HIDDEN_NPC.test(id)) return null;
    return NPC_NAME_FALLBACK[id] ?? names.get(id) ?? '';
  };
}

function buildUpgradeDef(upgrade, text, optionSets, npcName) {
  // 한글 이름을 모르는 NPC 는 이름 대신 수만 남긴다.
  const ids = [...new Set(upgrade.AvailableNpcs ?? [])].filter((id) => npcName(id) !== null);
  const npcs = [...new Set(ids.map(npcName).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );
  const unknownNpcs = ids.filter((id) => !npcName(id)).length;
  const def = {
    name: text(upgrade.Name),
    desc: text(upgrade.Desc),
    npcs,
    ...(unknownNpcs ? { npcUnknown: unknownNpcs } : {}),
    ep: upgrade.NeedEp ?? 0,
    gold: upgrade.NeedGold ?? 0,
    min: upgrade.UpgradedMin ?? 0,
    max: upgrade.UpgradedMax ?? 0,
    stats: (upgrade.ModifyStats ?? []).map((stat) => {
      const row = [
        stat.Name === 'durability_max' ? 'durability' : stat.Name,
        round(stat.Min ?? 0),
        round(stat.Max ?? 0),
      ];
      if (stat.Extra) row.push(stat.Extra);
      return row;
    }),
  };
  if (upgrade.NeedGems?.length) {
    def.gems = upgrade.NeedGems.map((gem) => [text(gem.Name), round(gem.Size ?? 0)]);
  }
  const options = (upgrade.OptionSetIds ?? [])
    .map((id) => text(optionSets.get(id)?.Desc))
    .filter(Boolean);
  if (options.length) def.options = options;

  const lucky = upgrade.LuckyUpgrade;
  if (lucky) {
    const pct = (rate, total) => (total > 0 ? round((rate / total) * 100) : 0);
    def.lucky = {
      counts: (lucky.CountRates ?? []).map((row) => [
        row.Count,
        pct(row.Rate, lucky.CountTotalRate),
      ]),
      options: (lucky.RandomOptionRates ?? []).map((row) => [
        text(optionSets.get(row.Id)?.Desc) || `옵션 ${row.Id}`,
        pct(row.Rate, lucky.RandomOptionTotalRate),
      ]),
    };
  }
  if (upgrade.Personalize) def.personal = true;
  return def;
}

/**
 * 인챈트 효과의 능력치 이름 → 화면의 능력치 이름. 개조와 기본 능력치가 쓰는 이름에 맞춘다.
 *
 * 원본은 같은 능력치를 AttMax, attMax, Attmax 처럼 제각각 적는다. 소문자로 맞춰 찾는다.
 * 여기 없는 이름(마리오네트, 교역, 생산 같은 것)은 능력치 표에 더하지 않는다. 설명 문장에는 남아
 * 있으므로 화면에서 읽을 수는 있다. 수집할 때 목록을 찍어 알린다.
 */
const ENCHANT_PARAMS = {
  attmin: 'attack_min',
  attmax: 'attack_max',
  wattmin: 'wound_min',
  wattmax: 'wound_max',
  rate: 'balance',
  crit: 'critical',
  critical: 'critical',
  def: 'defense',
  defence: 'defense',
  prot: 'protect',
  magicdefence: 'magic_defense',
  magicprotect: 'magic_protect',
  magicattack: 'magic_damage',
  str: 'str',
  dex: 'dex',
  int: 'int',
  will: 'will',
  luck: 'luck',
  lifemax: 'life_max',
  manamax: 'mana_max',
  staminamax: 'stamina_max',
  healing: 'healing_potency',
  lance_piercing: 'lance_piercing',
  musicbuff_bonus: 'musicbuff_bonus',
  musicbuff_duration: 'musicbuff_duration',
  alchemy_fire: 'alchemy_fire',
  alchemy_water: 'alchemy_water',
  alchemy_wind: 'alchemy_wind',
  alchemy_earth: 'alchemy_earth',
  alchemy_all: 'alchemy_all',
  mana_saving: 'mana_saving',
  fast_attack: 'attack_speed',
  bombexpert: 'explosion_resist',
  stompdefence: 'stomp_resist',
  poison_immune: 'poison_immune',
  marionette_damage_min: 'marionette_attack_min',
  marionette_damage_max: 'marionette_attack_max',
  marionette_life: 'marionette_life',
  marionette_defense: 'marionette_defense',
  marionette_protect: 'marionette_protect',
  marionette_magic_defense: 'marionette_magic_defense',
  marionette_control_critical: 'marionette_critical',
};

/**
 * 효과를 거는 함수. 대부분 SetParamOnEquip 이지만 피어싱은 SetItemOption, 마나 소비 감소와 공격 속도는
 * SetSetItemEffectOnEquip, 연금술 속성 대미지는 AddBonusOnAlchemy 로 적혀 있다. 하나만 보면 이것들이
 * 통째로 빠진다(미티어로이드의 피어싱 레벨이 그랬다).
 */
const ENCHANT_EFFECT_CALL =
  /(?:SetParamOnEquip|SetItemOption|SetSetItemEffectOnEquip|AddBonusOnAlchemy)\((\w+),\s*([+-])\s*\(?\s*([\d.]+)\s*(?:~\s*([\d.]+))?\s*\)?\s*\)/gi;

/**
 * 인챈트 효과 한 줄: "조건 : 조건 : SetParamOnEquip(AttMax, +(50~60));"
 * 앞 칸이 하나라도 차 있으면 조건이 붙은 효과다(스킬 랭크, 레벨, 타이틀 등). 조건의 뜻은 설명 문장에 있다.
 * → [능력치, 최소, 최대, 조건 여부(1)]
 */
function parseEnchantEffects(optionList, unknown) {
  const effects = [];
  for (const line of String(optionList ?? '').split('\n')) {
    const parts = line.split(':');
    const conditional = parts.slice(0, -1).some((part) => part.trim() !== '');
    for (const match of line.matchAll(ENCHANT_EFFECT_CALL)) {
      const [, param, sign, low, high] = match;
      const stat = ENCHANT_PARAMS[param.toLowerCase()];
      if (!stat) {
        unknown.add(param);
        continue;
      }
      const a = Number(low);
      const b = high === undefined ? a : Number(high);
      const [min, max] = sign === '-' ? [-b, -a] : [a, b];
      const effect = [stat, round(min), round(max)];
      if (conditional) effect.push(1);
      effects.push(effect);
    }
  }
  return effects;
}

/**
 * 탈라 가흐 인챈트. 탈라 가흐는 인챈트를 "탈라 가흐 인챈트 선택 스크롤" 로만 주고, 그 스크롤에서
 * 고를 수 있는 목록은 게임 데이터에 없다(아이템 설명에 "탈라 가흐에서 얻을 수 있는 인챈트 중 하나"
 * 라고만 있다). 공개된 던전 보상 정보에서 확인한 이름을 옮겼다(2026-09-25, 32개).
 * 모두 G28 에 새로 나온 인챈트라 게임 데이터의 출시 시기와도 맞는다.
 */
const TALA_GAH_ENCHANTS = new Set([
  '망집',
  '기록',
  '낙인',
  '상흔',
  '과부하',
  '재생',
  '잔해',
  '이상',
  '심층',
  '금기',
  '멍에',
  '구속',
  '은총',
  '안식',
  '염원',
  '여정',
  '미련의',
  '왜곡된',
  '과오의',
  '황량한',
  '집어삼키는',
  '환각의',
  '박해의',
  '추방된',
  '집착하는',
  '비틀린',
  '추락하는',
  '절망의',
  '구휼의',
  '감싸는',
  '서약의',
  '속죄의',
]);

/**
 * 인챈트 번호 → 그 인챈트가 나오는 던전과 미션 이름.
 * 보상 칸의 종류가 optionset 이면 그 번호가 인챈트이고, 아이템 보상에 접두/접미가 붙어 나오기도 한다.
 */
function buildEnchantSources(data, text) {
  const groups = new Map(data.ContentsRewardGroupList.map((row) => [row.Id, text(row.Name)]));
  const pools = new Map(data.ContentsRewardPoolList.map((row) => [row.Id, row]));
  const sources = new Map();
  const add = (id, name) => {
    if (!id || !name) return;
    const set = sources.get(id) ?? new Set();
    set.add(name);
    sources.set(id, set);
  };
  for (const content of data.ContentsRewardList) {
    const name = groups.get(content.GroupId) || text(content.Name);
    for (const difficulty of content.Difficulties ?? []) {
      for (const poolId of difficulty.PoolIds ?? []) {
        for (const reward of pools.get(poolId)?.Rewards ?? []) {
          if (reward.Type === 'optionset') add(reward.RewardId, name);
          add(reward.PrefixOptionSetId, name);
          add(reward.SuffixOptionSetId, name);
        }
      }
    }
  }
  return sources;
}

function buildEnchantDef(row, cached, text, unknown, sources) {
  const json = cached?.json ?? {};
  const desc = String(json.OptionDesc ?? text(row.Desc) ?? '')
    .split(/\\n|\n/)
    .map((line) => line.replace(/<\/?[^>]+>/g, '').trim())
    .filter(Boolean);
  const def = {
    name: json.LocalName || text(row.Name) || text(row.Name2),
    // 0 접두, 1 접미
    slot: row.Usage ?? 0,
    // 1~6 이 F~A 랭크, 7~15 가 9~1 랭크다.
    level: json.Level ?? row.Level ?? 0,
    desc,
    effects: parseEnchantEffects(json.OptionList, unknown),
  };
  if (/setpersonalize\(true\)/i.test(json.OptionList ?? '')) def.personal = true;
  const src = new Set(sources.get(row.Id) ?? []);
  if (TALA_GAH_ENCHANTS.has(def.name)) src.add('탈라 가흐');
  if (src.size) def.src = [...src].sort((a, b) => a.localeCompare(b, 'ko'));
  // 출시 제너레이션. 같은 출처 안에서 새것을 앞에 둘 때 쓴다.
  if (json.Generation) def.gen = json.Generation;
  return def;
}

const racesOf = (row) => `${row.Human ? 'h' : ''}${row.Elf ? 'e' : ''}${row.Giant ? 'g' : ''}`;

/** 에르그 등급 번호 → 화면에서 쓰는 이름. 101 은 S 등급 50레벨 위에 더하는 어둠의 에르그다. */
const ERG_GRADES = { 3: 'B', 2: 'A', 1: 'S', 101: 'D' };

/**
 * 에르그. 무기 묶음(20종) 번호 → 등급별 { 효과 문장 틀, 레벨별 값 }.
 *
 * 문장 틀의 {0} 을 그 레벨 값으로 앞에서부터 채운다. 낮은 레벨은 값이 하나뿐이라 첫 효과(기본 효과)만
 * 나오고, 레벨이 오르면 추가 효과가 열린다(S 는 21, 31, 41). 표시용 값이 따로 있으면(대형 낫의
 * 어둠의 에르그처럼 배율로 적힌 것) 그것을 쓴다. 게임 화면에 나오는 숫자가 그쪽이다.
 */
function buildErgSets(data, text) {
  const sets = new Map();
  for (const type of data.ErgTypeList) {
    const grade = ERG_GRADES[type.TypeId];
    if (!grade) continue;
    for (const weaponSet of type.WeaponSets ?? []) {
      const effects = (weaponSet.EffectTemplates ?? []).map((key) =>
        String((key && text(key)) || '')
          .replace(/\\n|\n/g, ' ')
          .trim(),
      );
      const levels = [...(weaponSet.Ablities ?? [])]
        .sort((a, b) => a.ErgLevel - b.ErgLevel)
        .map((ability) => {
          const values = ability.DisplayValues?.length
            ? ability.DisplayValues
            : (ability.Values ?? []);
          return values.map((value) => Math.round(value * 100) / 100);
        });
      if (!levels.length) continue;
      const def = sets.get(weaponSet.WeaponSetId) ?? {};
      def[grade] = { effects, levels };
      sets.set(weaponSet.WeaponSetId, def);
    }
  }
  return sets;
}

function buildAbilityDef(ability, text) {
  return {
    name: text(ability.Desc),
    unit: text(ability.SubDesc),
    init: round(ability.InitialValue ?? 0),
    per: round(ability.ValuePerLevel ?? 0),
    std: round(ability.Standard ?? 1),
    lv: [ability.BaseMaxLevel ?? 0, ability.BaseMaxLevelOH ?? 0, ability.BaseMaxLevelAcc ?? 0],
    lb: Boolean(ability.LimitBreak),
    types: Object.entries(ability.EquipFilterMap ?? {})
      .filter(([, allowed]) => allowed)
      .map(([type]) => type)
      .sort(),
    races: racesOf(ability),
  };
}

function requireUploadConfig() {
  if (!proxyUrl) throw new Error('.env 에 VITE_PROXY_URL(우리 워커 주소)이 없습니다.');
  if (!adminKey) throw new Error('.env 에 MABIKUMA_ADMIN_KEY(운영자 키)가 없습니다.');
}

async function putShard(category, shard) {
  const response = await fetch(`${proxyUrl}/item-equip/shard`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-mabikuma-admin-key': adminKey,
      origin: (process.env.MABIKUMA_ORIGIN ?? 'https://mabi.spkuma.com').trim(),
    },
    body: JSON.stringify({ category, ...shard }),
  });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((parsed) => parsed?.error?.message)
      .catch(() => null);
    throw new Error(`${category} 올리기 실패: ${detail ?? `HTTP ${response.status}`}`);
  }
  return response.json();
}

async function main() {
  if (willUpload) requireUploadConfig();

  const [resource, dictionary] = await Promise.all([loadResource(), loadDictionary()]);
  const data = parseEquipmentResource(resource);

  const strings = new Map(data.StringTable.map((row) => [row.Id, row.Str ?? '']));
  // 게임 안 표기(<color> 등)와 줄바꿈 글자를 걷어 낸다.
  const text = (key) =>
    (key ? (strings.get(key) ?? '') : '')
      .replace(/\\n/g, ' ')
      .replace(/<\/?[^>]+>/g, '')
      .trim();

  // 인챈트는 옵션셋 가운데 쓰임새 0(접두)과 1(접미)이다. 나머지는 개조 옵션, 세트 효과 같은 것들.
  const enchantRows = data.OptionSetList.filter((row) => (row.Usage ?? 0) <= 1);
  if (!checkOnly) {
    const got = await downloadEnchants(enchantRows.map((row) => row.Id));
    if (got) log(`인챈트 ${got}개 새로 받음`);
  }

  const npcName = buildNpcNames(data.RaceList, text);

  /** 아이템 번호 → 붙일 수 있는 인챈트 번호. 인챈트마다 받아 둔 "붙는 아이템" 목록을 뒤집는다. */
  const enchantCache = new Map();
  const enchantsByItem = new Map();
  if (!checkOnly && !downloadOnly) {
    for (const row of enchantRows) {
      const cached = await readFile(enchantPath(row.Id), 'utf8')
        .then(JSON.parse)
        .catch(() => null);
      if (!cached?.json) continue;
      enchantCache.set(row.Id, cached);
      for (const itemId of cached.allow ?? []) {
        const list = enchantsByItem.get(itemId) ?? [];
        list.push(row.Id);
        enchantsByItem.set(itemId, list);
      }
    }
    log(`인챈트 ${enchantCache.size}개, 인챈트가 붙는 아이템 ${enchantsByItem.size}개`);
  }
  const unknownParams = new Set();
  const enchantRowById = new Map(enchantRows.map((row) => [row.Id, row]));
  const ergSets = buildErgSets(data, text);
  const ergByItem = new Map(data.ErgItemList.map((row) => [row.Id, row.WeaponSetId]));
  log(`에르그 무기 묶음 ${ergSets.size}개, 에르그가 붙는 아이템 ${ergByItem.size}개`);
  const enchantSources = buildEnchantSources(data, text);

  const upgradesByItem = new Map(data.ItemExtendUpgradeList.map((row) => [row.Id, row]));
  const metalwareByItem = new Map(data.ItemExtendMetalWareList.map((row) => [row.Id, row]));
  const upgradeDefs = new Map(data.ItemUpgradeList.map((row) => [row.Id, row]));
  const optionSets = new Map(data.OptionSetList.map((row) => [row.Id, row]));
  const levels = data.MetalWareLevelList.map((row) => [
    row.Level,
    row.Rank3MinLevel ?? 0,
    row.Rank3MaxLevel ?? 0,
    row.Rank2MinLevel ?? 0,
    row.Rank2MaxLevel ?? 0,
    row.Rank1MinLevel ?? 0,
    row.Rank1MaxLevel ?? 0,
    row.LimitBreakMinLevel ?? 0,
    row.LimitBreakMaxLevel ?? 0,
  ]).sort((a, b) => a[0] - b[0]);

  const hasEquipData = (id) => upgradesByItem.has(id) || metalwareByItem.has(id);

  /**
   * 이름 → 아이템 번호. 같은 이름이 여럿이면(등급만 다른 것 등) 장비 데이터가 붙은 것을
   * 먼저 고른다. 카드 도구는 먼저 나온 것을 고르지만, 여기서는 개조 정보가 없는 쪽을 고르면
   * 화면이 비어 버린다.
   */
  const idsByName = new Map();
  for (const row of data.ItemList) {
    const name = text(row.Name);
    if (!name) continue;
    const list = idsByName.get(name) ?? [];
    list.push(row.Id);
    idsByName.set(name, list);
  }
  const compactIndex = new Map();
  const clashed = new Set();
  for (const [name, ids] of idsByName) {
    const key = compactName(name);
    const seen = compactIndex.get(key);
    if (seen && seen !== ids) clashed.add(key);
    else compactIndex.set(key, ids);
  }
  for (const key of clashed) compactIndex.delete(key);

  /**
   * 이름이 같은 다른 물건을 가를 때는 카드 도구와 같은 규칙(card-match.mjs)으로 카테고리를 본다.
   * 검 "간장" 과 음식 "간장" 이 그렇다.
   *
   * 검 "간장" 은 개조도 세공도 안 되는 검이라 개조 목록에도 장비 종류 목록에도 없다. 장비 데이터가
   * 붙은 후보만 고르면 기본 성능(공격, 크리티컬, 밸런스)까지 통째로 빠진다. 그래서 그 카테고리에서
   * 고른 후보가 장비로 보이면 기본 성능만이라도 싣는다.
   */
  const { candidates } = parseItemReference(resource);
  const matcher = createCardMatcher(candidates, dictionary);

  const pickId = (name, category) => {
    const ids = idsByName.get(name) ?? compactIndex.get(compactName(name));
    const withData = ids?.find(hasEquipData);
    if (withData !== undefined) return withData;
    // 행의 장비 표시는 의자, 날개 같은 것에도 켜져 있다. 사이트가 시뮬레이터를 여는 카테고리에서만 믿는다.
    if (!EQUIPMENT_CATEGORIES.has(category)) return null;
    const choice = matcher.pick(name, category);
    return choice?.equippable ? choice.id : null;
  };

  const categories = [...dictionary.keys()]
    .filter((category) => onlyCategories.size === 0 || onlyCategories.has(category))
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .slice(0, categoryLimit);
  const missing = new Set(
    await readFile(resolve(CACHE_DIR, 'missing.json'), 'utf8')
      .then(JSON.parse)
      .catch(() => []),
  );
  await mkdir(SHARD_DIR, { recursive: true });

  let totalItems = 0;
  let withoutJson = 0;
  let uploaded = 0;

  for (const [index, category] of categories.entries()) {
    const step = `(${index + 1}/${categories.length}) ${category}`;
    const picked = dictionary
      .get(category)
      .map((name) => ({ name, id: pickId(name, category) }))
      .filter((entry) => entry.id !== null);

    if (picked.length === 0) continue;
    totalItems += picked.length;

    if (checkOnly) {
      log(`${step}: 장비 ${picked.length}개 (세기만 함)`);
      continue;
    }

    const got = await downloadItemJsons(
      picked.map((entry) => entry.id),
      missing,
    );
    await writeFile(resolve(CACHE_DIR, 'missing.json'), JSON.stringify([...missing]));
    if (got) log(`${step}: 아이템 JSON ${got}개 새로 받음`);
    if (downloadOnly) continue;

    const items = {};
    const usedUpgrades = new Set();
    const usedTypes = new Set();
    /**
     * 인챈트 목록은 아이템마다 수백 개라 그대로 실으면 칸이 커진다. 같은 카테고리 아이템은 목록이
     * 거의 같으므로(천옷은 대부분 똑같다) 같은 목록끼리 묶어 번호 하나로 가리킨다.
     */
    const enchantGroups = new Map();
    const usedErgSets = new Set();

    for (const { name, id } of picked) {
      const json = await readCachedJson(id);
      if (!json) withoutJson++;
      const xml = json?.XML ?? {};

      const record = { id };
      const base = json ? baseStats(json) : {};
      if (Object.keys(base).length) record.base = base;
      const random = randomStats(xml);
      if (random.length) record.random = random;

      const upgrade = upgradesByItem.get(id);
      if (upgrade && (upgrade.UpgradeMax || upgrade.GemUpgradeMax)) {
        // 원본 목록에 같은 번호가 두 번씩 들어 있는 아이템이 있다(천옷 대부분). 한 번만 남긴다.
        const ids = [...new Set(upgrade.UpgradeIds ?? [])].filter((upgradeId) =>
          upgradeDefs.has(upgradeId),
        );
        record.upgrade = { max: upgrade.UpgradeMax ?? 0, gemMax: upgrade.GemUpgradeMax ?? 0, ids };
        for (const upgradeId of ids) usedUpgrades.add(upgradeId);
      }

      const metalware = metalwareByItem.get(id);
      if (metalware?.EquipType) {
        record.reforge = { type: metalware.EquipType, races: racesOf(metalware) };
        usedTypes.add(metalware.EquipType);
      }

      const special = specialUpgrade(xml);
      if (special) record.special = special;

      const enchantIds = [...new Set(enchantsByItem.get(id) ?? [])].sort((a, b) => a - b);
      if (enchantIds.length) {
        const key = enchantIds.join(',');
        if (!enchantGroups.has(key))
          enchantGroups.set(key, { id: enchantGroups.size, ids: enchantIds });
        record.enchants = enchantGroups.get(key).id;
      }

      const ergSet = ergByItem.get(id);
      if (ergSet && ergSets.has(ergSet)) {
        record.erg = ergSet;
        usedErgSets.add(ergSet);
      }

      items[name] = record;
    }

    const upgrades = {};
    for (const upgradeId of [...usedUpgrades].sort((a, b) => a - b)) {
      upgrades[upgradeId] = buildUpgradeDef(upgradeDefs.get(upgradeId), text, optionSets, npcName);
    }

    const abilities = {};
    for (const ability of data.MetalWareAbilityList) {
      const allowed = Object.entries(ability.EquipFilterMap ?? {}).some(
        ([type, on]) => on && usedTypes.has(type),
      );
      if (!allowed) continue;
      // 옵션 하나에 장비 종류가 60개씩 붙어 있다. 이 칸에 없는 종류는 워커가 볼 일이 없다.
      const def = buildAbilityDef(ability, text);
      def.types = def.types.filter((type) => usedTypes.has(type));
      abilities[ability.Id] = def;
    }

    const enchants = {};
    const groups = {};
    for (const group of enchantGroups.values()) {
      groups[group.id] = group.ids;
      for (const enchantId of group.ids) {
        if (!enchants[enchantId]) {
          enchants[enchantId] = buildEnchantDef(
            enchantRowById.get(enchantId),
            enchantCache.get(enchantId),
            text,
            unknownParams,
            enchantSources,
          );
        }
      }
    }

    const ergSetsUsed = Object.fromEntries(
      [...usedErgSets].sort((a, b) => a - b).map((set) => [set, ergSets.get(set)]),
    );
    const shard = {
      items,
      upgrades,
      abilities,
      levels: usedTypes.size ? levels : [],
      enchants,
      enchantGroups: groups,
      ergSets: ergSetsUsed,
    };
    const body = JSON.stringify(shard);
    await writeFile(resolve(SHARD_DIR, `${category.replace(/[\\/:*?"<>|]/g, '_')}.json`), body);

    if (!willUpload) {
      log(`${step}: ${picked.length}개 (${(body.length / 1024).toFixed(0)}KB, 올리지 않음)`);
      continue;
    }
    const { count } = await putShard(category, shard);
    uploaded += count;
    log(`${step}: ${count}개 올림 (${(body.length / 1024).toFixed(0)}KB)`);
  }

  if (unknownParams.size)
    log(`화면 이름표가 없는 인챈트 능력치: ${[...unknownParams].sort().join(', ')}`);
  log('');
  log(`카테고리 ${categories.length}개, 장비 데이터가 붙는 아이템 ${totalItems}개`);
  if (!checkOnly)
    log(`  아이템 JSON 이 없는 것 ${withoutJson}개 (기본 능력치와 특별 개조가 비어 있음)`);
  if (willUpload) log(`  올린 것 ${uploaded}개`);
  if (checkOnly) log('세기만 했습니다. 받지도 올리지도 않았습니다.');
  if (downloadOnly) log('받기만 했습니다. .cache\\equipment 에 쌓여 있고, 올리려면 다시 돌리세요.');
}

main().catch((error) => {
  console.error('[equipment] 실패:', error.message);
  process.exitCode = 1;
});
