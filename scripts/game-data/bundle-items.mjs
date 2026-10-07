import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';

/**
 * 클라이언트 내보내기(client-bundle)의 아이템 이름과 설명을 한국 서버에서 보이는 그대로 고른다.
 *
 * 한 아이템에 조건별 설명이 여럿 있는 경우가 있다(한국 전용 문구, 기능이 켜졌을 때의 문구).
 * 지금 사이트에 보이는 설명 19,084장과 하나하나 대조해 아래 규칙으로 모두 같아지는 것을 확인했다(2026-10).
 *
 * 1. 조건 없이 하나로 정해진 설명이 있으면 그것
 * 2. 아니면 한국 정식 서버에서 성립하는 변형만 남긴다. 지역 조건은 한국이어야 하고, 기능 조건은
 *    한국 정식 서버에서 켜져 있어야 한다(기간이 있는 기능은 오늘이 기간 안이어야 한다)
 * 3. 그중 한국 전용 변형이 먼저고, 같은 급이면 원본에서 나중에 나온 것이 이긴다(뒤 정의가 앞을 덮는다)
 */

/**
 * 게임 안에서만 뜻이 있는 표기를 웹에서 읽을 수 있게 바꾼다.
 *
 *   `\n` 글자 그대로        진짜 줄바꿈으로
 *   `<color=1>…</color>`    강조 색. 글자만 남긴다(화면 규칙상 장식 색은 안 쓴다)
 *   `<hotkey name="…"/>`    그 사람이 지정한 단축키 자리. 웹에서는 모르니 [단축키] 로
 *   `<username/>`           읽는 사람의 캐릭터 이름 자리
 *   `{0}` `{1}`             아이템마다 게임이 채우는 자리. 비워 둘 수 없으니 … 로
 *   `&&`                    게임이 & 를 적는 방식. 화면에는 하나만 보인다
 */
export function cleanDescription(text) {
  return (
    text
      .replace(/\\n/g, '\n')
      // n 이 빠진 줄바꿈. 문장 끝 바로 뒤의 외톨이 \ 만 바꾼다(알렉산드라이트, 풍등 제작 키트).
      .replace(/([.!?])\\(?=\S)/g, '$1\n')
      .replace(/<hotkey\b[^>]*\/?>/g, '[단축키]')
      .replace(/<username\b[^>]*\/?>/g, '[캐릭터 이름]')
      .replace(/<\/?color\b[^>]*>/g, '')
      .replace(/\{\d+\}/g, '…')
      // 게임은 & 를 && 로 적고 화면에는 하나만 보인다.
      .replace(/&&/g, '&')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

const rows = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

/** 한국 정식 서버에서 켜진 기능. 이름 -> 참/거짓. now 는 한국 시각 YYYYMMDDhhmm. */
export function koreaFeatures(run, now = koreaNow()) {
  const audit = resolve(run, 'condition-audit');
  const names = new Map(rows(resolve(audit, 'features.jsonl')).map((f) => [f.name_hash, f.name]));
  const enabled = new Map();
  for (const state of rows(resolve(audit, 'static-profile-states.jsonl'))) {
    if (state.profile !== 'Regular, Korea' || !names.has(state.name_hash)) continue;
    const start = state.time_conditions.find((t) => t.slot === 'StartTime')?.date;
    const end = state.time_conditions.find((t) => t.slot === 'EndTime')?.date;
    enabled.set(
      names.get(state.name_hash),
      Boolean(state.base_enabled) && (!start || start <= now) && (!end || now < end),
    );
  }
  return enabled;
}

function koreaNow() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().replace(/\D/g, '').slice(0, 12);
}

/** 위 규칙으로 고른 글(field 는 description 이나 name). 없으면 빈 문자열. */
export function koreaText(entity, enabled, field) {
  if ((entity[field] ?? '').trim()) return entity[field];
  const live = (entity.variants ?? []).filter(
    (variant) =>
      (variant[field] ?? '').trim() &&
      variant.conditions.every(([kind, value]) =>
        kind === 'locale'
          ? String(value).toLowerCase() === 'korea'
          : kind === 'feature'
            ? enabled.get(value) === true
            : false,
      ),
  );
  const korea = live.filter((variant) => variant.conditions.some(([kind]) => kind === 'locale'));
  return (korea.at(-1) ?? live.at(-1))?.[field] ?? '';
}

/** 위 규칙으로 고른 설명. 없으면 빈 문자열. */
export function koreaDescription(entity, enabled) {
  return koreaText(entity, enabled, 'description');
}

/**
 * 플레이어가 게임에서 볼 수 없는 아이템. NPC 와 몬스터 장비, 영어 내부 이름, 쓰지 않거나
 * 임시로 둔 것. 이름이 설명과 같은 것은 설명 자리를 채워 둔 것뿐이다.
 */
export function isHiddenItem(name, description) {
  return hiddenReason(name, description) !== null;
}

/** 숨기는 이유. 숨기지 않으면 null. 목록 스크립트(hidden-items.mjs)가 이유별로 묶는다. */
export function hiddenReason(name, description) {
  const text = description.trim();
  if (/^[\x20-\x7e]+$/.test(name)) return '영어 내부 이름';
  if (/^NPC\s/.test(name)) return 'NPC 장비';
  if (/몬스터 ?전용|몬스터용/.test(name)) return '몬스터 장비';
  if (/배포 ?(금지|불가)/.test(name) || /^\(?(유저)? ?배포 ?(금지|불가)\)?$/.test(text))
    return '배포 금지';
  if (/사용 ?안 ?함/.test(name)) return '사용 안 함';
  if (/^\(임시\)/.test(name) || /^\(임시\)|^임시설명$|^\(번역 불필요\)$/.test(text))
    return '임시 데이터';
  if (text === name.trim()) return '설명이 이름과 같음';
  return null;
}

/** 내보내기의 아이템을 번호 -> { name, description } 으로. 설명은 고르고 정리한 것이다. */
export function loadBundleItems(run, enabled = koreaFeatures(run)) {
  const items = new Map();
  for (const entity of rows(resolve(run, 'assets/items.jsonl'))) {
    items.set(String(entity.id), {
      // 게임은 일부 이름 앞에 @ 를 붙인다. 경매장 사전은 떼고 적으므로 같이 뗀다.
      name: koreaText(entity, enabled, 'name').replace(/^@/, ''),
      description: cleanDescription(koreaDescription(entity, enabled)),
    });
  }
  return items;
}

export function defaultBundleRoot() {
  return resolve(
    process.cwd(),
    process.env.MABIKUMA_CLIENT_BUNDLE ?? '.cache/client-src/exports/client-bundle',
  );
}

/** 지역 조건이 한국 서버에서 성립하는지. "!usa" 처럼 다른 지역을 빼는 조건도 있다. */
function localeHolds(expression) {
  const value = String(expression).toLowerCase();
  return value.startsWith('!') ? value.slice(1) !== 'korea' : value === 'korea';
}

/**
 * 한 아이템의 여러 줄 가운데 한국 정식 서버에서 쓰이는 줄. 설명과 같은 규칙이다. 조건이 모두 성립하는
 * 줄만 남기고, 한국 지역 조건이 붙은 줄이 먼저, 같은 급이면 원본에서 나중 줄이 이긴다.
 */
export function koreaRecord(records, enabled) {
  const live = records.filter((record) =>
    (record.condition_evidence ?? []).every((condition) =>
      condition.kind === 'locale'
        ? localeHolds(condition.expression)
        : condition.kind === 'feature'
          ? enabled.get(condition.expression) === true
          : false,
    ),
  );
  const korea = live.filter((record) =>
    (record.condition_evidence ?? []).some((c) => c.kind === 'locale'),
  );
  return korea.at(-1) ?? live.at(-1) ?? null;
}

/** `<xml a="1" b="2"/>` 의 속성을 객체로. 장비 도구가 받던 아이템 JSON 의 XML 칸과 같은 모양이다. */
export function parseXmlAttributes(text) {
  const out = {};
  for (const [, key, value] of String(text ?? '').matchAll(/([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g))
    out[key] = value;
  return out;
}

/**
 * 아이템 번호 -> 아이템 JSON(게임 아이템 데이터 한 줄). 장비 도구가 아이템마다 따로 받던 것과 같은 칸이다.
 * 받기가 막혀도 내보내기만 있으면 장비 정보를 만들 수 있다.
 */
export function loadBundleItemJsons(run, enabled = koreaFeatures(run)) {
  const byId = new Map();
  const lines = gunzipSync(readFileSync(resolve(run, 'records/items.jsonl.gz')))
    .toString('utf8')
    .split('\n');
  for (const line of lines) {
    if (!line) continue;
    const record = JSON.parse(line);
    const id = record.attributes?.ID;
    if (!id) continue;
    (byId.get(id) ?? byId.set(id, []).get(id)).push(record);
  }
  const jsons = new Map();
  for (const [id, records] of byId) {
    const record = koreaRecord(records, enabled);
    if (!record) continue;
    jsons.set(id, { ...record.attributes, XML: parseXmlAttributes(record.attributes.XML) });
  }
  return jsons;
}

/**
 * 경매장 이름 -> 아이템 번호를 고를 후보. card-match.mjs 가 받는 모양({ items, candidates })이다.
 * 이름이 같은 후보가 여럿이면 카테고리의 모양으로 고르는데, 동점일 때의 순서가 예전 데이터와 달라
 * 161건이 다른 번호를 골랐다. 그 이름들은 item-id-pins.json 에 예전 선택을 고정해 두었다(pickItemId).
 */
export function loadBundleCandidates(run, enabled = koreaFeatures(run)) {
  const texts = loadBundleItems(run, enabled);
  const jsons = loadBundleItemJsons(run, enabled);
  const items = new Map();
  const candidates = new Map();
  for (const id of [...jsons.keys()].sort((a, b) => Number(a) - Number(b))) {
    const text = texts.get(id);
    if (!text?.name) continue;
    const json = jsons.get(id);
    const candidate = {
      id: Number(id),
      description: text.description,
      source: /_LT\[xml\.([^\]]+)\.\d+\]/.exec(json.Text_Name1 ?? '')?.[1] ?? '',
      equipType: '',
      equippable: String(json.Category ?? '').startsWith('/equip/'),
    };
    (candidates.get(text.name) ?? candidates.set(text.name, []).get(text.name)).push(candidate);
    if (!items.has(text.name))
      items.set(text.name, { id: candidate.id, description: candidate.description });
  }
  return { items, candidates };
}

/** 이름이 같은 아이템 가운데 예전에 고른 번호. 카테고리 -> 이름 -> 번호. */
export function loadItemIdPins() {
  return JSON.parse(readFileSync(new URL('./item-id-pins.json', import.meta.url), 'utf8'));
}
