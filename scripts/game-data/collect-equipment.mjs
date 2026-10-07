#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createCardMatcher } from './card-match.mjs';
import { buildEnchantDef, buildEnchantSources, equipTagsOf } from './enchant-defs.mjs';
import { defaultBundleRoot, loadBundleCandidates, loadItemIdPins } from './bundle-items.mjs';
import { loadClientTables } from './client-tables.mjs';
import { loadArtisanOdds } from './artisan-odds.mjs';

/**
 * 장비 시뮬레이터에 쓸 데이터를 만들어 우리 워커에 올린다.
 *
 *   node collect-equipment.mjs --check       세기만 한다
 *   node collect-equipment.mjs --build       칸을 만들어 .cache/equipment/shards 에만 쓴다
 *   node collect-equipment.mjs               만들고 올린다
 *
 *   --limit=<n>    카테고리 n 개까지만 (처음 돌려 볼 때)
 *   --category=<이름,이름>  그 카테고리만
 *   --force        지난번과 같은 칸도 다시 올린다
 *   --refresh-odds 장인 개조 확률을 공식 페이지에서 모두 다시 받는다
 *
 * ## 무엇을 어디서 가져오는가
 *
 * 모두 클라이언트 내보내기(`.cache/client-src/exports/client-bundle`)에서 만든다(client-tables.mjs).
 *   기본 능력치   아이템 데이터의 Par_AttackMin 같은 칸
 *   랜덤 능력치   XML.random_product  "attack_min,0,10;critical,0,10"  (기본값에 더하는 폭)
 *   특별 개조     XML.enhance_type_s / enhance_type_r / enhance_max_lv
 *   개조          ItemUpgradeDB 의 개조가 item_filter 로 붙는 아이템
 *   세공          ItemNewMetalWare 의 장비 종류, 능력, 레벨 분포
 *   인챈트        OptionSet 의 AllowItem / BlockItem 이 맞는 아이템. 나오는 곳은 던전 보상 표
 *   에르그        ErgEnhanceClient 의 등급별 값. 효과 문장과 붙는 무기는 erg-pins.json
 *
 * 장인 개조의 확률만 클라이언트에 없어 넥슨 공식 확률 공개 페이지에서 읽는다(artisan-odds.mjs). 받은 것은
 * 남겨 두고 처음 보는 번호만 묻는다.
 *
 * 칸을 올릴 때 지난번에 올린 내용과 같으면 보내지 않는다(.cache/equipment/uploaded-shards.json, --force 로 다시 씀).
 */

const CACHE_DIR = resolve(process.cwd(), '.cache/equipment');
const SHARD_DIR = resolve(CACHE_DIR, 'shards');
const ITEMS_DIR = resolve(process.cwd(), 'public/data/items');

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
const forceShards = args.has('--force');
const buildOnly = args.has('--build');
const refreshOdds = args.has('--refresh-odds');
const limitArg = [...args].find((a) => a.startsWith('--limit='));
const categoryLimit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const onlyCategories = new Set(
  [...args]
    .filter((a) => a.startsWith('--category='))
    .flatMap((a) => a.slice('--category='.length).split(','))
    .map((name) => name.trim())
    .filter(Boolean),
);
const willUpload = !checkOnly && !buildOnly;

const proxyUrl = (process.env.VITE_PROXY_URL ?? '').trim().replace(/\/+$/, '');
const adminKey = (process.env.MABIKUMA_ADMIN_KEY ?? '').trim();

const log = (...parts) => console.log('[equipment]', ...parts);

/** 클라이언트 내보내기의 마지막 실행 폴더. 없으면 만들 수 없다. */
async function loadBundleRun() {
  const root = defaultBundleRoot();
  const latest = await readFile(resolve(root, 'latest.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (!latest?.run)
    throw new Error(
      `${root} 에 클라이언트 내보내기가 없습니다. Run-ClientExport.ps1 을 먼저 돌리세요.`,
    );
  return resolve(root, latest.run);
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

  // 장인 개조 확률. 공식 확률 공개 페이지의 표 그대로다(옵션 개수 %, 옵션 문장 %).
  const odds = upgrade.ArtisanOdds;
  if (odds) def.lucky = { counts: odds.counts, options: odds.options };
  if (upgrade.Personalize) def.personal = true;
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

/**
 * 지난번에 올린 칸의 내용 해시. 같으면 다시 보내지 않는다. 칸 하나가 KV 쓰기 한 번이다.
 */
const SHARD_STATE = resolve(CACHE_DIR, 'uploaded-shards.json');

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

  const run = await loadBundleRun();
  log(`클라이언트 내보내기 ${run}`);
  const dictionary = await loadDictionary();
  const data = loadClientTables(run);

  // 장인 개조 확률은 공식 페이지에서. 받아 둔 것은 다시 묻지 않는다.
  const luckyIds = data.ItemUpgradeList.map((row) => row.LuckyUpgradeId).filter(
    (id) => id !== undefined,
  );
  const odds = checkOnly
    ? new Map()
    : await loadArtisanOdds(luckyIds, { refresh: refreshOdds, log });
  for (const row of data.ItemUpgradeList) {
    if (row.LuckyUpgradeId !== undefined && odds.has(row.LuckyUpgradeId))
      row.ArtisanOdds = odds.get(row.LuckyUpgradeId);
  }

  const strings = new Map(data.StringTable.map((row) => [row.Id, row.Str ?? '']));
  // 게임 안 표기(<color> 등)와 줄바꿈 글자를 걷어 낸다.
  const text = (key) =>
    (key ? (strings.get(key) ?? '') : '')
      .replace(/\\n/g, ' ')
      .replace(/<\/?[^>]+>/g, '')
      .trim();

  const itemJson = (id) => data.itemJsons.get(String(id)) ?? null;
  const shardState = await readFile(SHARD_STATE, 'utf8')
    .then(JSON.parse)
    .catch(() => ({}));
  let unchanged = 0;

  // 인챈트는 옵션셋 가운데 쓰임새 0(접두)과 1(접미)이다. 나머지는 개조 옵션, 세트 효과 같은 것들.
  const enchantRows = data.OptionSetList.filter((row) => (row.Usage ?? 0) <= 1);
  const npcName = buildNpcNames(data.RaceList, text);

  /** 아이템 번호 → 붙일 수 있는 인챈트 번호. 인챈트마다 "붙는 아이템" 목록을 뒤집는다. */
  const enchantCache = data.enchants;
  const enchantsByItem = new Map();
  for (const [enchantId, { allow }] of enchantCache) {
    for (const itemId of allow) {
      const list = enchantsByItem.get(itemId) ?? [];
      list.push(enchantId);
      enchantsByItem.set(itemId, list);
    }
  }
  log(`인챈트 ${enchantCache.size}개, 인챈트가 붙는 아이템 ${enchantsByItem.size}개`);
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
  const { candidates } = loadBundleCandidates(run);
  const matcher = createCardMatcher(candidates, dictionary);
  const pins = loadItemIdPins();

  const pickId = (name, category) => {
    // 아이템 카드와 같은 아이템을 먼저 본다. 카드의 그림과 설명이 이 아이템의 것이라 능력치도 같아야 한다.
    const pinned = pins[category]?.[name];
    const card = pinned ?? matcher.pick(name, category)?.id;
    if (card !== undefined && hasEquipData(card)) return card;
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
      const json = itemJson(id);
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

      const equip = equipTagsOf(json);
      if (equip.length) record.equip = equip;

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
    const digest = createHash('sha256').update(body).digest('hex');
    if (!forceShards && shardState[category] === digest) {
      unchanged++;
      log(`${step}: ${picked.length}개 그대로(지난번과 같음)`);
      continue;
    }
    const { count } = await putShard(category, shard);
    shardState[category] = digest;
    await writeFile(SHARD_STATE, JSON.stringify(shardState));
    uploaded += count;
    log(`${step}: ${count}개 올림 (${(body.length / 1024).toFixed(0)}KB)`);
  }

  if (unknownParams.size)
    log(`화면 이름표가 없는 인챈트 능력치: ${[...unknownParams].sort().join(', ')}`);
  log('');
  log(`카테고리 ${categories.length}개, 장비 데이터가 붙는 아이템 ${totalItems}개`);
  if (!checkOnly)
    log(`  아이템 JSON 이 없는 것 ${withoutJson}개 (기본 능력치와 특별 개조가 비어 있음)`);
  if (willUpload) log(`  올린 것 ${uploaded}개, 바뀌지 않아 건너뛴 칸 ${unchanged}개`);
  if (checkOnly) log('세기만 했습니다. 올리지 않았습니다.');
}

main().catch((error) => {
  console.error('[equipment] 실패:', error.message);
  process.exitCode = 1;
});
