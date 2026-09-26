/**
 * 제작법 모으기
 *
 * 넥슨 오픈 API 에는 제작법이 없다. 게임 클라이언트 데이터를 풀어 둔 공개 도구가 있어서, 그 도구가
 * 쓰는 리소스 묶음 한 파일을 받아 제작 스킬로 만드는 아이템과 재료만 뽑는다.
 *
 * 리소스 묶음은 protobuf 바이너리이고 스키마는 따로 공개돼 있지 않다. 그 도구의 번들 안에
 * protobuf-ts 가 만든 메시지 정의(`super("prilus.X", [필드...])`)가 그대로 들어 있어서, 번들을
 * 받아 필드 목록을 읽고 그것으로 바이너리를 푼다. 번들 파일 이름은 배포마다 바뀌므로 첫 화면
 * HTML 에서 매번 찾아 들어간다.
 *
 * 뽑는 것:
 * - 제작법마다 만드는 아이템, 스킬, 랭크, 필요한 설비, 한 번에 나오는 개수
 * - 재료 칸마다 들어갈 수 있는 아이템들과 개수. 한 칸에 여러 아이템이 들어가는 경우가 있다
 *   ("브리 레흐의 코어" 또는 "브리 레흐의 코어(거래 불가)")
 * - 천옷만들기와 블랙스미스는 작업 재료와 마무리 재료가 따로다. 마무리는 첫 번째 묶음만 쓴다
 *   (게임에서도 첫 묶음이 기본 마무리다)
 * - 제작법에 나오는 모든 아이템의 이름과 거래 가능 여부. 거래 불가 아이템은 시세를 묻지 않는다
 * - 요리는 제작 목록이 아니라 요리 목록에 따로 있다. 조리 방법(굽기, 끓이기)을 도구 자리에,
 *   필요한 불을 설비 자리에 두고, 재료마다 기준 값과 요리 경험치를 적는다. 요리는 재료를 한 개씩 쓴다
 *
 * 요리 재료의 기준 값:
 * - 게임 데이터의 재료 값은 비율의 기준인데 합이 100 이 아닌 것이 많다(75 + 20 처럼). 넣는 비율은
 *   합에 대한 비율이라 추가 재료를 넣으면 달라진다. 그래서 비율로 바꾸지 않고 기준 값 그대로 두고
 *   화면이 계산한다(features/crafting/recipes.ts 의 cookingRatios)
 * - 기본 재료가 셋보다 적으면 추가 재료 하나를 더 넣을 수 있다(소금, 설탕, 후추 가운데 하나 등).
 *   넣지 않아도 만들어지므로 비용에는 넣지 않고 extras 로만 적는다
 *
 * 스킬:
 * - 제작법에 나오는 스킬마다 이름, 분류(생활, 연금술 같은 스킬 창의 탭), 설명을 적는다
 * - 스킬 그림(42px)은 같은 곳에서 받아 public/data/skills/<번호>.png 로 둔다. 스무 장이 안 되고
 *   한 장이 몇 KB 라 우리 쪽에 두고, 남의 서버를 화면에서 직접 부르지 않는다
 *
 * 실행: node scripts/build-recipes.mjs
 * 산출: public/data/recipes.json, public/data/skills/*.png
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

const SITE = 'https://prilus.gitlab.io/';
const RESOURCE_ORIGIN = 'https://mabires.pril.cc/';
const REGION = 'kr';
const OUT = resolve('public/data/recipes.json');
const SKILL_ICON_DIR = resolve('public/data/skills');

/** 제작 종류 번호에서 스킬로. 그 도구의 consts 와 같다. 1, 2 는 같은 방직이지만 도구가 다르다. */
const TYPE_SKILL = {
  1: { skill: 10011, tool: '물레' },
  2: { skill: 10011, tool: '베틀' },
  3: { skill: 10015 },
  4: { skill: 10012 },
  5: { skill: 10022 },
  6: { skill: 10013 },
  7: { skill: 35001 },
  8: { skill: 50032 },
  9: { skill: 35012 },
  10: { skill: 10033 },
  11: { skill: 10036 },
  12: { skill: 10038 },
  13: { skill: 10040 },
  14: { skill: 10041 },
  15: { skill: 27103 },
  16: { skill: 10104 },
  17: { skill: 27212 },
  65537: { skill: 10001 },
  65538: { skill: 10016 },
};

/**
 * 게임 데이터에 이름 문자열이 빠진 스킬. 향수를 만드는 스킬인데 이름 키가 비어 있다.
 * 재료 설명에 쓰인 "향수 조제" 를 이름으로 쓴다.
 */
const SKILL_NAME_FALLBACK = { 10038: '향수 조제' };

/** 스킬 분류 번호에서 스킬 창의 탭 이름으로. 제작 스킬이 쓰는 것만 둔다. */
const SKILL_CATEGORY = { 1: '생활', 2: '전투', 3: '마법', 4: '연금술', 11: '점성술' };

/** 게임 문장의 줄바꿈 표시(글자 그대로의 역슬래시 n)와 꾸밈 태그를 걷어 낸다. */
const plainText = (value) =>
  value
    .replace(/\\n/g, '\n')
    .replace(/<[^>]*>/g, '')
    .trim();

/** 거래 불가 표시(RestrictionFlags). 그 도구의 ITEM_RESTRICTION_NO_TRADE 와 같다. */
const NO_TRADE = 2;

const COOKING_SKILL = 10020;

/**
 * 요리 목록에서 빼는 조리 방법. 탐험가의 요리는 이벤트 동안만 쓰는 방법이라 랭크 자리에
 * 스킬 랭크가 아닌 값(20)이 들어 있고, 재료도 이벤트 재료다.
 */
const SKIPPED_COOKING_ACTIONS = new Set(['ie_expedition_cooking']);

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response;
}

/** 번들에서 메시지 정의를 모두 읽는다. 이름 -> 필드 목록. */
function extractSchemas(bundle) {
  const pattern = /([\w$]+)=new class extends [\w$]+\{constructor\(\)\{super\(`([^`]+)`,\[/g;
  const schemas = {};
  const nameOfVar = {};
  // 필드 목록 안의 T:()=>Xy 는 다른 메시지 변수를 가리킨다. 없는 이름은 이름 문자열로 돌려받는다.
  const scope = new Proxy(
    {},
    { has: () => true, get: (_target, key) => (typeof key === 'string' ? key : undefined) },
  );
  let match;
  while ((match = pattern.exec(bundle))) {
    const start = pattern.lastIndex - 1;
    let depth = 0;
    let end = start;
    for (; end < bundle.length; end += 1) {
      if (bundle[end] === '[') depth += 1;
      else if (bundle[end] === ']' && --depth === 0) break;
    }
    const fields = new Function(
      'scope',
      `with (scope) { return ${bundle.slice(start, end + 1)}; }`,
    )(scope);
    nameOfVar[match[1]] = match[2];
    schemas[match[2]] = fields;
  }
  const messageOf = (T) => {
    const target = T();
    return Array.isArray(target) ? target[0] : (nameOfVar[target] ?? target);
  };
  for (const fields of Object.values(schemas)) {
    for (const field of fields) {
      if (field.kind === 'message') field.message = messageOf(field.T);
      if (field.kind === 'map' && field.V.kind === 'message')
        field.V.message = messageOf(field.V.T);
    }
  }
  // 변수 이름은 배포마다 바뀐다. 제작법 목록을 필드로 가진 메시지가 리소스 묶음 전체다.
  const root = Object.keys(schemas).find((name) =>
    schemas[name].some((field) => field.name === 'ProductionList'),
  );
  if (!root) throw new Error('리소스 묶음 메시지를 찾지 못했습니다.');
  return { schemas, root };
}

/** protobuf 바이너리를 스키마대로 푸는 최소한의 읽개. 필요한 스칼라 종류만 다룬다. */
function decode(buffer, schemas, rootName) {
  // varint() 가 pos 를 옮긴다. `pos + Number(varint())` 처럼 한 식에 섞으면 옮기기 전 pos 를 읽으므로
  // 길이는 언제나 먼저 읽어 두고 더한다.
  let pos = 0;
  const varint = () => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = buffer[pos++];
      result |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return result;
      shift += 7n;
    }
  };
  const scalar = (T) => {
    switch (T) {
      case 1: {
        const v = buffer.readDoubleLE(pos);
        pos += 8;
        return v;
      }
      case 2: {
        const v = buffer.readFloatLE(pos);
        pos += 4;
        return v;
      }
      case 7: {
        const v = buffer.readUInt32LE(pos);
        pos += 4;
        return v;
      }
      case 15: {
        const v = buffer.readInt32LE(pos);
        pos += 4;
        return v;
      }
      case 6:
      case 16: {
        const v = buffer.readBigInt64LE(pos);
        pos += 8;
        return Number(v);
      }
      case 8:
        return varint() !== 0n;
      case 9: {
        const n = Number(varint());
        const v = buffer.toString('utf8', pos, pos + n);
        pos += n;
        return v;
      }
      case 12: {
        const n = Number(varint());
        pos += n;
        return null;
      }
      case 5:
        return Number(BigInt.asIntN(32, varint()));
      case 3:
        return Number(BigInt.asIntN(64, varint()));
      case 17:
      case 18: {
        const v = varint();
        return Number((v >> 1n) ^ -(v & 1n));
      }
      default:
        return Number(varint());
    }
  };
  const skip = (wireType) => {
    if (wireType === 0) varint();
    else if (wireType === 1) pos += 8;
    else if (wireType === 2) {
      const n = Number(varint());
      pos += n;
    } else if (wireType === 5) pos += 4;
    else throw new Error(`알 수 없는 wire type ${wireType}`);
  };
  const message = (length, name) => {
    const fields = schemas[name];
    if (!fields) throw new Error(`스키마 없음: ${name}`);
    const byNumber = Object.fromEntries(fields.map((field) => [field.no, field]));
    const out = {};
    const end = pos + length;
    while (pos < end) {
      const tag = Number(varint());
      const field = byNumber[tag >>> 3];
      const wireType = tag & 7;
      if (!field) {
        skip(wireType);
        continue;
      }
      if (field.kind === 'message') {
        const value = message(Number(varint()), field.message);
        if (field.repeat) (out[field.name] ??= []).push(value);
        else out[field.name] = value;
      } else if (field.kind === 'map') {
        const entryLength = Number(varint());
        const entryEnd = pos + entryLength;
        let key;
        let value;
        while (pos < entryEnd) {
          const entryTag = Number(varint());
          if (entryTag >>> 3 === 1) key = scalar(field.K);
          else
            value =
              field.V.kind === 'message'
                ? message(Number(varint()), field.V.message)
                : scalar(field.V.T ?? 5);
        }
        (out[field.name] ??= {})[key] = value;
      } else {
        const T = field.kind === 'enum' ? 5 : field.T;
        if (field.repeat && wireType === 2 && T !== 9 && T !== 12) {
          const packedLength = Number(varint());
          const packedEnd = pos + packedLength;
          const list = (out[field.name] ??= []);
          while (pos < packedEnd) list.push(scalar(T));
        } else {
          const value = scalar(T);
          if (field.repeat) (out[field.name] ??= []).push(value);
          else out[field.name] = value;
        }
      }
    }
    return out;
  };
  return message(buffer.length, rootName);
}

async function main() {
  const html = await (await fetchOk(SITE)).text();
  const entry = html.match(/src="\/?(assets\/index-[\w-]+\.js)"/)?.[1];
  if (!entry) throw new Error('첫 화면에서 번들 주소를 찾지 못했습니다.');
  const bundle = await (await fetchOk(new URL(entry, SITE))).text();
  const { schemas, root } = extractSchemas(bundle);
  console.log(`스키마 ${Object.keys(schemas).length}개, 루트 ${root}`);

  const version = await (
    await fetchOk(`${RESOURCE_ORIGIN}resourceversion/${REGION}/${REGION}_resourceversion.json`)
  ).json();
  const packed = Buffer.from(
    await (
      await fetchOk(`${RESOURCE_ORIGIN}resourcedata/${REGION}/${REGION}_resourcedata.bin.br`)
    ).arrayBuffer(),
  );
  const data = decode(brotliDecompressSync(packed), schemas, root);

  const strings = new Map(data.StringTable.map((entry) => [entry.Id, entry.Str]));
  const text = (key) => {
    const value = strings.get(key);
    return value && !value.startsWith('not found key') ? value : '';
  };
  const itemById = new Map(data.ItemList.map((item) => [item.Id, item]));
  const skillById = new Map(data.SkillList.map((skill) => [skill.Id, skill]));

  const nameOfId = (id) => {
    const item = itemById.get(id);
    return item ? text(item.Name) : '';
  };

  /**
   * 재료 칸. 이름 문자열이 없는 아이템은 게임에서 더는 쓰지 않는 옛 대체품이다(2026-09 수집에서
   * 260개, 모두 이름 있는 대체품과 같은 칸에 있었다). 화면에 "#12345" 로 띄울 이유가 없어 뺀다.
   */
  const usedItems = new Set();
  let droppedAlternatives = 0;
  const slot = (essential) => {
    const all = essential.ItemIds ?? [];
    const named = all.filter((id) => nameOfId(id));
    droppedAlternatives += all.length - named.length;
    const ids = named.length ? named : all;
    for (const id of ids) usedItems.add(id);
    return [ids, essential.Count ?? 1];
  };

  const recipes = [];
  const unknownTypes = new Set();
  for (const production of data.ProductionList) {
    const kind = TYPE_SKILL[production.Type];
    if (!kind) {
      unknownTypes.add(production.Type);
      continue;
    }
    usedItems.add(production.ItemId);
    const recipe = {
      item: production.ItemId,
      skill: kind.skill,
      rank: production.Level ?? 0,
      yield: production.ProductionCount > 1 ? production.ProductionCount : 1,
      materials: (production.Essentials ?? []).map(slot),
    };
    if (kind.tool) recipe.tool = kind.tool;
    const station = production.NeedPropName ? text(production.NeedPropName) : '';
    if (station) recipe.station = station;
    const finish = production.CompleteEssentials?.[0]?.Essentials;
    if (finish?.length) recipe.finish = finish.map(slot);
    recipes.push(recipe);
  }
  if (unknownTypes.size)
    console.warn(`스킬을 모르는 제작 종류라 뺐습니다: ${[...unknownTypes].join(', ')}`);
  if (droppedAlternatives)
    console.log(`이름이 없는 옛 대체 재료 ${droppedAlternatives}개를 뺐습니다.`);

  // 요리. 재료 칸마다 들어갈 아이템은 하나뿐이고, 한 번에 한 개씩 쓴다.
  const cookingActions = new Map(data.CookingActionList.map((action) => [action.Name, action]));
  let skippedCooking = 0;
  for (const cooking of data.CookingRecipeList) {
    const action = cookingActions.get(cooking.Action);
    if (!action || SKIPPED_COOKING_ACTIONS.has(cooking.Action)) {
      skippedCooking += 1;
      continue;
    }
    const essentials = cooking.Essentials ?? [];
    usedItems.add(cooking.ItemId);
    const recipe = {
      item: cooking.ItemId,
      skill: COOKING_SKILL,
      rank: action.MinSkillLevel ?? 0,
      yield: cooking.ResultBundle > 1 ? cooking.ResultBundle : 1,
      materials: essentials.map((source) => {
        usedItems.add(source.ItemId);
        return [[source.ItemId], 1, Math.max(0, source.Amount ?? 0)];
      }),
    };
    if (cooking.CookExp) recipe.exp = cooking.CookExp;
    const tool = text(action.LocalName);
    if (tool) recipe.tool = tool;
    const station = action.PropLocalName ? text(action.PropLocalName) : '';
    if (station) recipe.station = station;
    const extras = essentials.length < 3 ? (cooking.Additionals ?? []) : [];
    if (extras.length) {
      for (const source of extras) usedItems.add(source.ItemId);
      recipe.extras = extras.map((source) => [[source.ItemId], 1, Math.max(0, source.Amount ?? 0)]);
    }
    recipes.push(recipe);
  }
  if (skippedCooking) console.log(`이벤트 요리 ${skippedCooking}개를 뺐습니다.`);

  /** 아이템 번호 -> [이름, 거래 가능이면 1]. */
  const items = {};
  const unnamed = [];
  for (const id of [...usedItems].sort((a, b) => a - b)) {
    const item = itemById.get(id);
    const name = nameOfId(id);
    if (!name) unnamed.push(id);
    items[id] = [name || `#${id}`, item && (item.RestrictionFlags ?? 0) & NO_TRADE ? 0 : 1];
  }
  if (unnamed.length)
    console.warn(`이름이 없는 아이템 ${unnamed.length}개: ${unnamed.slice(0, 10).join(', ')}`);

  const skillIds = [...new Set(recipes.map((recipe) => recipe.skill))];
  const skills = skillIds
    .map((id) => {
      const skill = skillById.get(id);
      const category = SKILL_CATEGORY[skill?.Category];
      const desc = plainText(text(skill?.Desc));
      return {
        id,
        name: text(skill?.Name) || SKILL_NAME_FALLBACK[id] || `스킬 ${id}`,
        count: recipes.filter((recipe) => recipe.skill === id).length,
        ...(category ? { category } : {}),
        ...(desc ? { desc } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 스킬 그림. 받지 못한 스킬은 화면이 그림 없이 그린다.
  await mkdir(SKILL_ICON_DIR, { recursive: true });
  const missingIcons = [];
  for (const { id } of skills) {
    const response = await fetch(`${RESOURCE_ORIGIN}skillimage/${REGION}/${id}/${id}.png`);
    if (!response.ok) {
      missingIcons.push(id);
      continue;
    }
    await writeFile(
      resolve(SKILL_ICON_DIR, `${id}.png`),
      Buffer.from(await response.arrayBuffer()),
    );
  }
  if (missingIcons.length) console.warn(`그림을 받지 못한 스킬: ${missingIcons.join(', ')}`);

  const nameOf = (id) => items[id][0];
  recipes.sort(
    (a, b) =>
      a.skill - b.skill || a.rank - b.rank || nameOf(a.item).localeCompare(nameOf(b.item), 'ko'),
  );

  const updated = new Date(version.CreatedAt * 1000).toISOString().slice(0, 10);
  // 한 줄에 제작법 하나씩 적어 다음 수집 때 무엇이 바뀌었는지 diff 로 보이게 한다.
  const body = [
    '{',
    `"updated":${JSON.stringify(updated)},`,
    `"skills":${JSON.stringify(skills)},`,
    `"items":${JSON.stringify(items)},`,
    '"recipes":[',
    recipes.map((recipe) => JSON.stringify(recipe)).join(',\n'),
    ']}',
    '',
  ].join('\n');
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, body);
  console.log(
    `제작법 ${recipes.length}개, 스킬 ${skills.length}개, 아이템 ${Object.keys(items).length}개 -> ${OUT} (${Math.round(body.length / 1024)} KB)`,
  );
}

await main();
