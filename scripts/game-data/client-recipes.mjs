import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  featureHolds,
  hiddenReason,
  koreaFeatures,
  koreaRecord,
  loadBundleItemJsons,
  loadBundleItems,
} from './bundle-items.mjs';
import { clientDataDate, loadClientRecords } from './client-tables.mjs';
import { compileItemFilter } from './item-filter.mjs';

/**
 * 제작법에 쓰는 게임 데이터를 클라이언트 내보내기에서 읽는다(build-recipes.mjs 가 쓴다).
 *
 *   제작       Production.xml. 제작 종류(물레, 베틀, 제련 ...)마다 ProductionId 가 따로 매겨져 있다
 *   천옷, 대장 ManualForm.xml. 옷본과 도면. 종류 번호는 65536 + ManualType(1 천옷만들기, 2 블랙스미스)
 *   요리       CookingRecipe.xml, CookingAction.xml
 *
 * 재료는 아이템 번호가 아니라 분류 경로 필터("/material/weaving/yarn/01/*, 1")로 적혀 있다. 필터는 경로의
 * 일부와 맞으면 되고(item-filter.mjs 의 contains), 맞는 아이템이 그 칸에 들어갈 수 있는 재료다. 게임에서
 * 볼 수 없는 아이템(임시 데이터 등, bundle-items.mjs 의 hiddenReason)과 "(사용불가)" 아이템은 넣지 않는다.
 *
 * 마무리 재료(CompleteEssentials)는 "(재료, 개수; 재료, 개수)(…)" 처럼 괄호로 묶음을 나눈다. 첫 묶음이
 * 게임의 기본 마무리다.
 *
 * 거래 가능 여부는 아이템의 Attr_ActionFlag 가 0, 1 이거나 경매장 검색(AuctionSearchFlag)에 한국이 있으면
 * 거래 가능으로 본다. 제작법에 나오는 아이템 3,653개 가운데 19개만 예전 표와 다르다.
 */

const decode = (text) =>
  String(text ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

/** "필터, 개수; 필터, 개수" -> [[필터, 개수]]. 셋째 값이 있는 칸도 있다("필터,1,15"). 개수는 둘째 값이다. */
export function parseEssentials(text) {
  return decode(text)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [filter, count] = part.split(',');
      return [filter.trim(), Number(count)];
    })
    .filter(([filter, count]) => filter && Number.isFinite(count));
}

/** 마무리 재료의 첫 괄호 묶음. 괄호가 없으면 전체다. */
export function firstGroup(text) {
  const value = decode(text).trim();
  if (!value.startsWith('(')) return value;
  let depth = 0;
  for (let at = 0; at < value.length; at++) {
    if (value[at] === '(') depth++;
    else if (value[at] === ')' && --depth === 0) return value.slice(1, at);
  }
  return value.slice(1);
}

export function loadClientRecipes(run) {
  const enabled = koreaFeatures(run);
  const { records } = loadClientRecords(run);
  const jsons = loadBundleItemJsons(run, enabled);
  const texts = loadBundleItems(run, enabled);

  const items = new Map();
  for (const [id, json] of jsons) {
    const text = texts.get(id);
    const name = text?.name ?? '';
    // "(사용불가)" 를 붙인 옛 장비는 재료 칸에 들어갈 수 없다.
    const visible =
      name &&
      !hiddenReason(name, text?.description ?? '') &&
      !/^\(사용 ?불가\)/.test(name.replace(/^@/, ''));
    const tradeable =
      [0, 1].includes(Number(json.Attr_ActionFlag ?? 0)) ||
      /korea/i.test(json.AuctionSearchFlag ?? '');
    items.set(Number(id), { name, visible, tradeable, category: String(json.Category ?? '') });
  }

  // 같은 분류 경로를 가진 아이템이 많아 경로마다 한 번만 맞춰 본다.
  const idsByCategory = new Map();
  for (const [id, item] of items) {
    if (!item.visible) continue;
    (
      idsByCategory.get(item.category) ?? idsByCategory.set(item.category, []).get(item.category)
    ).push(id);
  }
  const categories = [...idsByCategory.keys()];
  const resolved = new Map();
  const itemsOf = (filter) => {
    if (!resolved.has(filter)) {
      const match = compileItemFilter(filter, { contains: true });
      const ids = match
        ? categories.filter(match).flatMap((category) => idsByCategory.get(category))
        : [];
      resolved.set(
        filter,
        ids.sort((x, y) => x - y),
      );
    }
    return resolved.get(filter);
  };
  // 개수 0 인 칸은 재료가 아니다(아무 재료나 넣는 칸을 막는 표시).
  const slots = (text) =>
    parseEssentials(text)
      .filter(([, count]) => count > 0)
      .map(([filter, count]) => ({ ItemIds: itemsOf(filter), Count: count }));

  const recipes = records('recipes.jsonl.gz');
  // 아르바이트 납품용 옷본과 도면. 제작 책(ProductionBookList.xml)이 감추는 분류 가운데 아르바이트 표시만
  // 쓴다(같은 목록의 /scrapbooknone/ 은 책에만 안 나올 뿐 만들 수 있다). 물레, 베틀 같은 제작의 아르바이트용
  // 재료는 아르바이트 밖에서도 만들 수 있어 그대로 둔다.
  const blockFilter = compileItemFilter(
    recipes
      .filter((r) => r.tag === 'ProductionSkill' && r.attributes.BlockStringID)
      .flatMap((r) => r.attributes.BlockStringID.split('|'))
      .map((term) => term.trim())
      .filter((term) => /arbeit/i.test(term))
      .join('|'),
    { contains: true },
  );
  const blocked = (id) => Boolean(blockFilter?.(items.get(Number(id))?.category ?? ''));
  // 같은 제작 종류, 같은 번호의 행이 기능과 시즌마다 여럿이다. 한국 서버에서 쓰이는 행 하나를 고른다.
  const pickRows = (rows, keyOf) => {
    const groups = new Map();
    for (const row of rows) {
      const key = keyOf(row);
      (groups.get(key) ?? groups.set(key, []).get(key)).push(row);
    }
    return [...groups.values()].map((list) => koreaRecord(list, enabled)).filter(Boolean);
  };

  const ProductionList = [];
  const production = recipes.filter(
    (r) => r.tag === 'Production' && r.source.endsWith('/Production.xml'),
  );
  // 같은 번호로 시즌마다 다른 아이템을 만드는 행도 있어 만드는 아이템까지 묶음 열쇠에 넣는다.
  const productionKey = (r) =>
    `${r.ancestors[1]?.tag}/${r.attributes.ProductionId}/${r.attributes.ProductItemId}`;
  for (const record of pickRows(production, productionKey)) {
    const a = record.attributes;
    // 행 속성의 Feature 는 조건 기록에 없는 것이 있다. 꺼진 기능의 제작법은 뺀다.
    if (a.Feature && !featureHolds(a.Feature, enabled)) continue;
    // 재료가 하나도 없는 행(아무 아이템이나 0개)은 실제 제작법이 아니다.
    const essentials = slots(a.Essentials);
    if (!essentials.length) continue;
    ProductionList.push({
      Type: Number(a.ProductionType),
      ItemId: Number(a.ProductItemId),
      Level: Number(a.Difficulty ?? 0),
      ProductionCount: Number(a.ProductionCount ?? 1),
      Essentials: essentials,
      // 설비가 필요한 제작은 설비가 없을 때의 안내가 곧 설비 이름이다("물레", "공학 선반").
      NeedPropName: record.localized?.PropMissmatchMsg ?? '',
    });
  }
  const manuals = recipes.filter((r) => r.tag === 'ManualForm');
  for (const record of pickRows(
    manuals,
    (r) => `${r.attributes.ManualType}/${r.attributes.FormID}`,
  )) {
    const a = record.attributes;
    if (a.Feature && !featureHolds(a.Feature, enabled)) continue;
    if (blocked(a.ProductItemID)) continue;
    const finish = firstGroup(a.CompleteEssentials);
    ProductionList.push({
      Type: 65536 + Number(a.ManualType),
      ItemId: Number(a.ProductItemID),
      Level: Number(a.Level ?? 0),
      ProductionCount: 1,
      Essentials: slots(a.Essentials),
      NeedPropName: '',
      CompleteEssentials: finish ? [{ Essentials: slots(finish) }] : [],
    });
  }

  // 요리. 행은 문서 순서가 아니라 경로로 묶는다. 재료 경로 "/CookingRecipe[i]/recipe[j]/essential[k]/source" 의
  // 앞부분 "/CookingRecipe[i]/recipe" 가 그 요리의 경로다.
  const cooking = recipes.filter((r) => r.source.endsWith('/CookingRecipe.xml'));
  const byPath = new Map();
  for (const record of cooking.filter((r) => r.tag === 'recipe')) {
    if (koreaRecord([record], enabled) === null) continue;
    const a = record.attributes;
    byPath.set(record.path, {
      Action: a.action,
      ItemId: Number(a.result_item),
      ResultBundle: Number(a.result_bundle ?? 1),
      CookExp: Number(a.cookexp ?? 0),
      Event: a.event ?? '',
      Essentials: [],
      Additionals: [],
    });
  }
  for (const record of cooking.filter((r) => r.tag === 'source')) {
    const match = /^(.*\/recipe)\[\d+\]\/(essential|additional)\[\d+\]\/source$/.exec(record.path);
    const recipe = match && byPath.get(match[1]);
    if (!recipe) continue;
    const entry = {
      ItemId: Number(record.attributes.item_id),
      Amount: Number(record.attributes.amount ?? 0),
    };
    (match[2] === 'essential' ? recipe.Essentials : recipe.Additionals).push(entry);
  }
  const CookingRecipeList = [...byPath.values()];
  const CookingActionList = recipes
    .filter((r) => r.tag === 'action' && r.source.endsWith('/CookingAction.xml'))
    .map((r) => ({
      Name: r.attributes.name,
      LocalName: r.localized?.localname ?? '',
      PropLocalName: r.localized?.prop_local_name ?? '',
      MinSkillLevel: Number(r.attributes.min_skill_level ?? 0),
    }));

  return {
    items,
    skills: loadSkills(run, enabled),
    ProductionList,
    CookingRecipeList,
    CookingActionList,
    updated: clientDataDate(run),
  };
}

/** 스킬 번호 -> { name, category, desc }. 같은 스킬이 기능마다 여러 줄이면 켜진 줄이다. */
export function loadSkills(run, enabled = koreaFeatures(run)) {
  const skills = new Map();
  for (const line of readFileSync(resolve(run, 'assets/skills.jsonl'), 'utf8').split('\n')) {
    if (!line) continue;
    const skill = JSON.parse(line);
    const feature = skill.conditions?.Feature;
    const live = !feature || featureHolds(feature, enabled);
    const id = Number(skill.id);
    if (!skill.name || (!live && skills.has(id))) continue;
    skills.set(id, {
      name: skill.name.trim(),
      category: Number(skill.attributes?.SkillCategory ?? 0),
      desc: skill.description ?? '',
    });
  }
  return skills;
}
