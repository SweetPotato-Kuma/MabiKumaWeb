import { brotliDecompressSync } from 'node:zlib';

/**
 * 마비노기 클라이언트 리소스 데이터에서 아이템 이름과 설명을 뽑아낸다.
 *
 * 넥슨 오픈 API 는 아이템 설명도 아이콘도 주지 않는다. 대신 Prilus(prilus.gitlab.io)가
 * 클라이언트 리소스를 풀어 공개해 두고 있어서, 그 덩어리를 받아 읽는다.
 *
 * ## 형식
 *
 * `kr_resourcedata.bin.br` 는 Brotli 로 눌린 protobuf 다. 스키마(.proto)는 공개되어 있지
 * 않지만, 필요한 것은 두 데이터셋뿐이고 protobuf 의 wire format 은 스키마 없이도 걸어갈 수
 * 있다. 필드 번호는 각 데이터셋의 행 수로 확인했다(ItemList 43,222행, StringTable 190,265행).
 *
 *   최상위 필드 11 = ItemList     { 1: 아이템 ID, 2: 이름 문자열 키, 3: 설명 문자열 키 }
 *   최상위 필드 23 = StringTable  { 1: 문자열 키,  2: 한국어 텍스트 }
 *
 * 이름과 설명은 곧바로 들어 있지 않고 `itemdb.43692` 같은 키로 들어 있어서 StringTable 을
 * 거쳐 풀어야 한다.
 *
 * ## 이 방식을 쓰는 이유
 *
 * 브라우저를 띄워 IndexedDB 를 꺼내 오는 방법도 있지만(erinn.me 가 그렇게 한다) Playwright
 * 를 받아야 한다. 여기서는 zlib 과 30 줄짜리 protobuf 워커로 끝난다. 새 의존성이 없다.
 *
 * ## 깨질 수 있는 지점
 *
 * 남의 프로젝트가 만드는 파일이다. 필드 번호가 바뀌면 조용히 틀린 값을 읽는 게 아니라
 * 행 수가 안 맞게 되므로, `loadItemReference` 가 기대한 행 수와 다르면 소리를 낸다.
 */

/** 필드 번호는 스키마가 아니라 관측으로 얻은 값이다. 행 수로 검증한다. */
const FIELD_ITEM_LIST = 11;
const FIELD_STRING_TABLE = 23;
/** 장비 번호별 장비 종류(ItemExtendMetalWareList)와 개조할 수 있는 아이템(ItemExtendUpgradeList). mabi-equipment.mjs 와 같은 번호다. */
const FIELD_EQUIP_TYPE_LIST = 7;
const FIELD_UPGRADE_LIST = 10;

/** 2026-09 기준 관측값. 게임이 업데이트되면 늘어나므로 하한으로만 쓴다. */
const MIN_ITEM_ROWS = 30_000;
const MIN_STRING_ROWS = 150_000;

function readVarint(buffer, position) {
  let result = 0n;
  let shift = 0n;
  let byte;
  do {
    byte = buffer[position++];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
  } while (byte & 0x80);
  return [result, position];
}

/**
 * 한 메시지 안의 필드를 번호별로 편다.
 *
 * 같은 번호가 여러 번 나오면 마지막 것이 남는다. 여기서 읽는 두 데이터셋은 반복 필드를
 * 쓰지 않으므로 문제가 되지 않는다.
 */
function parseMessage(buffer) {
  const out = {};
  let position = 0;

  while (position < buffer.length) {
    let key;
    [key, position] = readVarint(buffer, position);
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);

    if (wire === 2) {
      let length;
      [length, position] = readVarint(buffer, position);
      out[field] = buffer.subarray(position, position + Number(length)).toString('utf8');
      position += Number(length);
    } else if (wire === 0) {
      let value;
      [value, position] = readVarint(buffer, position);
      out[field] = Number(value);
    } else if (wire === 5) {
      position += 4;
    } else if (wire === 1) {
      position += 8;
    } else {
      break;
    }
  }

  return out;
}

/** 최상위에서 한 필드 번호에 해당하는 레코드만 훑는다. 57MB 를 통째로 펼치지 않으려고 제너레이터다. */
function* topLevelRecords(buffer, wanted) {
  let position = 0;

  while (position < buffer.length) {
    let key;
    [key, position] = readVarint(buffer, position);
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);

    if (wire === 2) {
      let length;
      [length, position] = readVarint(buffer, position);
      const slice = buffer.subarray(position, position + Number(length));
      position += Number(length);
      if (field === wanted) yield slice;
    } else if (wire === 0) {
      [, position] = readVarint(buffer, position);
    } else if (wire === 5) {
      position += 4;
    } else if (wire === 1) {
      position += 8;
    } else {
      break;
    }
  }
}

/**
 * 눌린 리소스 덩어리에서 이름 -> { id, description } 지도를 만든다.
 *
 * `items` 는 이름마다 먼저 나온 아이템 하나다. 같은 이름을 쓰는 아이템이 여럿 있어서(1,700개 남짓)
 * 그중 어느 것인지는 이름만으로 가를 수 없다. 등급만 다른 같은 물건도 있지만, 검 "간장" 과 음식
 * "간장" 처럼 전혀 다른 물건도 있다. 그래서 `candidates` 에 같은 이름의 후보를 모두 남기고, 카테고리를
 * 보고 고르는 일은 card-match.mjs 가 한다. 후보마다 고를 때 쓸 단서를 붙인다.
 *
 *   source     이름 문자열 키의 앞머리. itemdb, itemdb_mainequip, itemdb_etc 처럼 어느 표에서 왔는지
 *   equipType  장비 종류(OHSword, Headgear 등). 장비가 아니면 빈 문자열
 *   equippable 장비로 보이는지. 행의 5번 필드(관측), 장비 종류, 개조 가능 목록 중 하나라도 있으면 참
 */
export function parseItemReference(compressed) {
  const raw = brotliDecompressSync(compressed);

  const strings = new Map();
  for (const record of topLevelRecords(raw, FIELD_STRING_TABLE)) {
    const row = parseMessage(record);
    if (typeof row[1] === 'string') strings.set(row[1], row[2] ?? '');
  }

  const equipTypes = new Map();
  for (const record of topLevelRecords(raw, FIELD_EQUIP_TYPE_LIST)) {
    const row = parseMessage(record);
    if (typeof row[1] === 'number' && typeof row[2] === 'string') equipTypes.set(row[1], row[2]);
  }

  const upgradable = new Set();
  for (const record of topLevelRecords(raw, FIELD_UPGRADE_LIST)) {
    const row = parseMessage(record);
    if (typeof row[1] === 'number') upgradable.add(row[1]);
  }

  const items = new Map();
  const candidates = new Map();
  let itemRows = 0;
  for (const record of topLevelRecords(raw, FIELD_ITEM_LIST)) {
    itemRows++;
    const row = parseMessage(record);

    const name = strings.get(row[2]);
    // 이름이 안 풀리는 행이 실제로 있다. 내부용이거나 문자열이 빠진 것들이다.
    if (!name) continue;

    const id = row[1];
    const nameKey = String(row[2]);
    const equipType = equipTypes.get(id) ?? '';
    const candidate = {
      id,
      description: row[3] ? (strings.get(row[3]) ?? '') : '',
      source: nameKey.includes('.') ? nameKey.slice(0, nameKey.lastIndexOf('.')) : '',
      equipType,
      equippable: row[5] === 1 || equipType !== '' || upgradable.has(id),
    };

    const list = candidates.get(name);
    if (list) list.push(candidate);
    else candidates.set(name, [candidate]);
    if (!items.has(name)) items.set(name, { id, description: candidate.description });
  }

  if (itemRows < MIN_ITEM_ROWS || strings.size < MIN_STRING_ROWS) {
    throw new Error(
      `리소스 데이터의 모양이 달라졌습니다. 아이템 ${itemRows}행, 문자열 ${strings.size}행을 읽었습니다. ` +
        `필드 번호(ItemList=${FIELD_ITEM_LIST}, StringTable=${FIELD_STRING_TABLE})가 바뀌었는지 확인하세요.`,
    );
  }

  return { items, candidates, stringCount: strings.size, itemRows };
}
