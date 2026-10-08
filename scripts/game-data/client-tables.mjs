import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { compileItemFilter } from './item-filter.mjs';
import {
  koreaFeatures,
  koreaRecord,
  loadBundleItemJsons,
  loadBundleItems,
} from './bundle-items.mjs';

/**
 * 장비 정보에 쓰는 게임 데이터 표를 클라이언트 내보내기에서 만든다.
 *
 * 표의 모양은 장비 도구(collect-equipment.mjs)가 예전에 받던 것과 같다. 문자열 칸은 StringTable 의 열쇠이고
 * text() 로 풀어 쓴다. 원본은 내보내기의 records 다. 한 번호에 행이 여럿이면 한국 정식 서버에서 쓰이는 행을
 * 고른다(bundle-items.mjs 의 koreaRecord).
 *
 * 클라이언트 원본은 규칙으로 적혀 있다. "이 개조는 이 분류의 아이템에 붙는다" 처럼 분류 필터(item-filter.mjs)로
 * 적힌 것을 아이템마다 풀어 표를 만든다.
 *
 *   ItemUpgradeList         ItemUpgradeDB.xml 의 upgrade, effect, gem
 *   ItemExtendUpgradeList   아이템마다 item_filter 가 맞는 개조. 개조 횟수는 ItemDB 의 Par_UpgradeMax
 *   ItemExtendMetalWareList 아이템마다 맞는 세공 장비 종류(ItemNewMetalWare.xml 의 EquipFilter)
 *   MetalWareAbilityList    세공 능력(Ability). 붙는 장비 종류는 장비 종류 이름의 속성
 *   MetalWareLevelList      세공 레벨 분포(LevelDistribution)
 *   OptionSetList           인챈트와 옵션(OptionSet.xml)
 *   RaceList                종족과 NPC 이름(Race.xml)
 *   ErgTypeList             에르그 등급(S, A, B, 어둠)별 무기 묶음의 효과 문장과 레벨별 값(ErgEnhanceClient.xml)
 *   ErgItemList             에르그가 붙는 무기와 그 무기 묶음
 *
 * 에르그 S, A, B 의 효과 문장과 에르그가 붙는 무기 목록은 클라이언트에 적혀 있지 않다(서버 쪽 표다). 문장은
 * 클라이언트 문자열(ErgEnhance)에 있어서 무기 묶음마다 어느 문장인지만 erg-pins.json 에 적어 두었다. 무기 묶음
 * 번호의 순서는 공식 가이드의 에르그 효과 표(듀얼건, 수리검, 체인 블레이드 ...)와 같다. 붙는 무기는 카테고리
 * 규칙(erg-pins.json 의 sets, exclude)으로 고른다. 받던 목록 1,929개 가운데 규칙과 다른 2개만 items 에 적었다.
 *
 * 장인 개조의 확률은 클라이언트에 없다. 개조 행의 LuckyUpgradeId 로 넥슨 공식 확률 공개 페이지(artisan-odds.mjs)를
 * 찾아 붙인다.
 */

const rows = (path) =>
  gunzipSync(readFileSync(path))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

/** `_LT[xml.itemupgradedb.15]` -> `itemupgradedb.15`. 문자열 열쇠가 아니면 빈 문자열. */
export const textKey = (value) => /^_LT\[xml\.(.+)\]$/.exec(String(value ?? '').trim())?.[1] ?? '';
const num = (value) => (value === undefined || value === '' ? undefined : Number(value));
const bool = (value) => String(value ?? '').toLowerCase() === 'true';

/** 원본에서 0, 빈 칸, false 는 적지 않았다. 예전 표와 같은 모양을 내려고 같은 값을 뺀다. */
function compact(object) {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === 0 || value === '' || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'number' && Number.isNaN(value)) continue;
    out[key] = value;
  }
  return out;
}

/** 번호마다 한국 서버에서 쓰이는 행. 번호가 처음 나온 순서를 지킨다. */
function pickById(records, key, enabled) {
  const groups = new Map();
  for (const record of records) {
    const id = record.attributes?.[key];
    if (id === undefined) continue;
    (groups.get(id) ?? groups.set(id, []).get(id)).push(record);
  }
  const out = new Map();
  for (const [id, list] of groups) {
    const chosen = koreaRecord(list, enabled);
    if (chosen) out.set(id, chosen);
  }
  return out;
}

const RACES = ['human', 'elf', 'giant'];

/**
 * 세공 옵션을 고를 종족. Attr_RaceFilter 만 본다("/human/female/ | /elf/female/"). 갈래마다 종족을 적었으면
 * 그 종족, 성별만 적었으면 모든 종족, 그 밖의 것(파트너용 "/human_pet/")은 아무 종족도 아니다. 필터가 없으면
 * 모든 종족이다. 카테고리의 human_elf_only 는 보지 않는다(받던 표와 11,543개가 모두 같다).
 */
export function racesOfItem(json) {
  const filter = String(json.Attr_RaceFilter ?? '').trim();
  if (!filter) return new Set(RACES);
  const races = new Set();
  for (const branch of filter.split('|')) {
    const segments = branch
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const named = RACES.filter((race) => segments.includes(race));
    if (named.length) named.forEach((race) => races.add(race));
    else if (
      segments.length &&
      segments.every((segment) => segment === 'male' || segment === 'female')
    )
      RACES.forEach((race) => races.add(race));
  }
  return races;
}

/** 표의 문자열 열쇠를 글로 푼다. 게임 안 표기(<color> 등)와 줄바꿈 글자는 걷어 낸다. */
export function tableText(tables) {
  const strings = new Map(tables.StringTable.map((row) => [row.Id, row.Str ?? '']));
  return (key) =>
    (key ? (strings.get(key) ?? '') : '')
      .replace(/\\n/g, ' ')
      .replace(/<\/?[^>]+>/g, '')
      .trim();
}

/** 개조 값. "10", "-5", 폭이 있는 "-(4~6)" 은 [-6, -4]. */
function parseRange(text) {
  const match = /^(-?)\(?\s*(-?[\d.]+)\s*(?:~\s*(-?[\d.]+))?\s*\)?$/.exec(
    String(text ?? '').trim(),
  );
  if (!match) return [Number(text), Number(text)];
  const sign = match[1] ? -1 : 1;
  const ends = [sign * Number(match[2]), sign * Number(match[3] ?? match[2])];
  return [Math.min(...ends), Math.max(...ends)];
}

/** 개조 효과 문장. modify(이름,값[,추가]), use_optionset(번호), luckyupgrade(번호), personalize() 가 섞여 있다. */
export function parseUpgradeEffect(text) {
  const out = { ModifyStats: [], OptionSetIds: [], LuckyUpgradeId: undefined, Personalize: false };
  for (const part of String(text ?? '').split(';')) {
    const match = /^\s*(\w+)\s*\((.*)\)\s*$/.exec(part);
    if (!match) continue;
    const [, name, body] = match;
    const args = body.split(',').map((arg) => arg.trim());
    if (name === 'modify' && args[0]) {
      const [min, max] = parseRange(args[1]);
      const stat = { Name: args[0], Min: min, Max: max };
      if (args[2] !== undefined && args[2] !== '') stat.Extra = Number(args[2]);
      out.ModifyStats.push(stat);
    } else if (name === 'use_optionset') {
      out.OptionSetIds.push(Number(args[0]));
    } else if (name === 'luckyupgrade') {
      out.LuckyUpgradeId = Number(args[0]);
    } else if (name === 'personalize') {
      out.Personalize = true;
    }
  }
  return out;
}

/**
 * @param run 클라이언트 내보내기 실행 폴더(client-bundle/runs/<시각>)
 */
/**
 * 클라이언트 데이터를 꺼낸 날(원본이 바뀌지 않았으면 마지막으로 바뀐 날). 화면의 "갱신" 날짜로 쓴다.
 */
export function clientDataDate(run) {
  const bundle = JSON.parse(readFileSync(resolve(run, 'bundle.json'), 'utf8'));
  const report = JSON.parse(readFileSync(resolve(bundle.source_raw, 'report.json'), 'utf8'));
  return String(report.started_utc ?? '').slice(0, 10);
}

/**
 * 표 하나만 필요한 도구가 쓰는 기록 읽기. pick 은 번호(key)마다 한국 서버에서 쓰이는 행 하나를 고른다.
 */
export function loadClientRecords(run) {
  const enabled = koreaFeatures(run);
  const cache = new Map();
  const records = (file) => {
    if (!cache.has(file)) cache.set(file, rows(resolve(run, 'records', file)));
    return cache.get(file);
  };
  const pick = (file, predicate, key) => pickById(records(file).filter(predicate), key, enabled);
  return { enabled, records, pick, updated: clientDataDate(run) };
}

export function loadClientTables(run) {
  const enabled = koreaFeatures(run);
  const records = (file) => rows(resolve(run, 'records', file));
  const bundle = JSON.parse(readFileSync(resolve(run, 'bundle.json'), 'utf8'));

  // 문자열. 원본 열쇠는 "xml.itemupgradedb.15" 이고 표는 앞의 "xml." 을 뗀 열쇠를 쓴다.
  const StringTable = [];
  for (const line of readFileSync(resolve(bundle.source_raw, 'localization.jsonl'), 'utf8').split(
    '\n',
  )) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (row.key?.startsWith('xml.'))
      StringTable.push({ Id: row.key.slice(4), Str: row.text ?? '' });
  }

  // 아이템. 이름은 한국 서버에서 보이는 그대로다. 표의 이름 칸은 열쇠라 아이템마다 열쇠를 지어 붙인다.
  const texts = loadBundleItems(run, enabled);
  const jsons = loadBundleItemJsons(run, enabled);
  const ItemList = [];
  for (const [id, text] of texts) {
    if (!text.name) continue;
    StringTable.push({ Id: `bundle.item.${id}`, Str: text.name });
    ItemList.push({ Id: Number(id), Name: `bundle.item.${id}` });
  }
  ItemList.sort((x, y) => x.Id - y.Id);

  const RaceList = [
    ...pickById(
      records('pets-and-races.jsonl.gz').filter(
        (r) => r.tag === 'Race' && r.source.endsWith('/Race.xml'),
      ),
      'ID',
      enabled,
    ).values(),
  ].map(({ attributes: a }) =>
    compact({ Id: Number(a.ID), Name: textKey(a.LocalName), ClassName: a.ClassName }),
  );

  const optionRecords = pickById(
    records('enchants.jsonl.gz').filter((r) => r.tag === 'OptionSet'),
    'ID',
    enabled,
  );
  const OptionSetList = [...optionRecords.values()].map(({ attributes: a }) =>
    compact({
      Id: Number(a.ID),
      Name: textKey(a.LocalName),
      Name2: textKey(a.LocalName2),
      Desc: textKey(a.OptionDesc),
      Usage: num(a.Usage),
      Level: num(a.Level),
    }),
  );

  /**
   * 인챈트(쓰임새 0 접두, 1 접미)마다 { json, allow }. json 은 문자열을 푼 옵션셋 한 줄이고, allow 는 붙일 수
   * 있는 아이템 번호다. 게임이 인챈트 안내를 보여 주는 아이템(Enchant_UItooltip)의 카테고리가 AllowItem 에
   * 맞고 BlockItem 에 맞지 않으면 붙는다.
   */
  const enchantable = [...jsons]
    .filter(([, json]) => bool(json.Enchant_UItooltip))
    .map(([id, json]) => [Number(id), String(json.Category ?? '')]);
  const enchants = new Map();
  for (const { attributes: a, display = {} } of optionRecords.values()) {
    if (Number(a.Usage ?? 0) > 1) continue;
    const allow = compileItemFilter(a.AllowItem);
    const block = compileItemFilter(a.BlockItem);
    enchants.set(Number(a.ID), {
      json: compact({
        ID: Number(a.ID),
        LocalName: display.LocalName,
        LocalName2: display.LocalName2,
        OptionList: a.OptionList,
        OptionDesc: display.OptionDesc,
        Usage: num(a.Usage),
        Level: num(a.Level),
        Generation: num(a.Generation),
      }),
      allow: allow
        ? enchantable
            .filter(([, category]) => allow(category) && !block?.(category))
            .map(([id]) => id)
        : [],
    });
  }

  const upgradeRows = records('upgrades.jsonl.gz').filter((r) =>
    r.source.endsWith('ItemUpgradeDB.xml'),
  );
  const effects = new Map(
    upgradeRows
      .filter((r) => r.tag === 'effect')
      .map((r) => [r.attributes.id, r.attributes.effect]),
  );
  const gems = new Map(
    upgradeRows
      .filter((r) => r.tag === 'gem')
      .map((r) => [r.attributes.id, textKey(r.attributes.name)]),
  );
  const upgrades = pickById(
    upgradeRows.filter((r) => r.tag === 'upgrade'),
    'id',
    enabled,
  );
  const ItemUpgradeList = [];
  const upgradeFilters = [];
  for (const [id, { attributes: a }] of upgrades) {
    const effect = parseUpgradeEffect(effects.get(a.effect));
    ItemUpgradeList.push(
      compact({
        Id: Number(id),
        Name: textKey(a.localname),
        Desc: textKey(a.desc),
        NeedEp: num(a.need_ep),
        NeedGold: num(a.need_gold),
        NeedGems: String(a.need_gem ?? '')
          .split(';')
          .map((pair) => pair.split(','))
          .filter(([gem]) => gem)
          .map(([gem, size]) => ({ Name: gems.get(gem.trim()) ?? '', Size: Number(size) })),
        // 보석 개조는 단계를 gem_upgraded_min/max 에 적었다.
        UpgradedMin: num(a.upgraded_min ?? a.gem_upgraded_min),
        UpgradedMax: num(a.upgraded_max ?? a.gem_upgraded_max),
        AvailableNpcs: String(a.available_npc ?? '')
          .split(';')
          .map((npc) => npc.trim())
          .filter(Boolean),
        ModifyStats: effect.ModifyStats,
        OptionSetIds: effect.OptionSetIds,
        LuckyUpgradeId: effect.LuckyUpgradeId,
        Personalize: effect.Personalize,
      }),
    );
    const filter = compileItemFilter(a.item_filter);
    if (filter) upgradeFilters.push([Number(id), filter]);
  }
  upgradeFilters.sort((x, y) => x[0] - y[0]);

  const ItemExtendUpgradeList = [];
  for (const [id, json] of jsons) {
    // 게임이 개조 안내를 보여 주는 아이템만. 임시 아이템, 코스튬 껍질은 횟수가 적혀 있어도 꺼져 있다.
    if (!bool(json.Upgrade_UItooltip)) continue;
    const category = String(json.Category ?? '');
    const row = compact({
      Id: Number(id),
      UpgradeMax: Number(json.Par_UpgradeMax ?? 0),
      GemUpgradeMax: Number(json.Par_GemUpgradeMax ?? 0),
      UpgradeIds: upgradeFilters
        .filter(([, match]) => match(category))
        .map(([upgradeId]) => upgradeId),
    });
    if (row.UpgradeMax || row.GemUpgradeMax || row.UpgradeIds) ItemExtendUpgradeList.push(row);
  }

  const reforge = records('reforges.jsonl.gz').filter((r) =>
    r.source.endsWith('ItemNewMetalWare.xml'),
  );
  const equipFilters = [
    ...pickById(
      reforge.filter((r) => r.tag === 'EquipFilter'),
      'EquipFilterId',
      enabled,
    ).values(),
  ]
    .map(({ attributes: a }) => ({
      id: Number(a.EquipFilterId),
      type: a.FilterName,
      allow: compileItemFilter(a.AllowString),
      block: compileItemFilter(a.BlockString),
    }))
    .sort((x, y) => x.id - y.id);
  const typeNames = equipFilters.map((filter) => filter.type);

  const ItemExtendMetalWareList = [];
  for (const [id, json] of jsons) {
    if (!bool(json.Metalware_UItooltip)) continue;
    const category = String(json.Category ?? '');
    const filter = equipFilters.find((f) => f.allow?.(category) && !f.block?.(category));
    if (!filter) continue;
    const races = racesOfItem(json);
    ItemExtendMetalWareList.push(
      compact({
        Id: Number(id),
        EquipType: filter.type,
        Human: races.has('human'),
        Elf: races.has('elf'),
        Giant: races.has('giant'),
      }),
    );
  }

  const MetalWareAbilityList = [
    ...pickById(
      reforge.filter((r) => r.tag === 'Ability'),
      'AbilityId',
      enabled,
    ).values(),
  ].map(({ attributes: a }) =>
    compact({
      Id: Number(a.AbilityId),
      Desc: textKey(a.Desc),
      BaseMaxLevel: num(a.BaseMaxLevel),
      BaseMaxLevelAcc: num(a.BaseMaxLevelAcc),
      BaseMaxLevelOH: num(a.BaseMaxLevelOH),
      SubDesc: textKey(a.SubDesc),
      InitialValue: num(a.InitialValue),
      ValuePerLevel: num(a.ValuePerLevel),
      LimitBreak: bool(a.LimitBreak),
      Standard: num(a.Standard),
      EquipFilterMap: Object.fromEntries(
        typeNames.filter((type) => bool(a[type])).map((type) => [type, true]),
      ),
      Human: bool(a.Human),
      Elf: bool(a.Elf),
      Giant: bool(a.Giant),
    }),
  );

  const MetalWareLevelList = reforge
    .filter((r) => r.tag === 'LevelDistribution')
    .map(({ attributes: a }) =>
      compact({
        Level: num(a.BaseMaxLevel),
        Rank3MinLevel: num(a.Rank3MinLevel),
        Rank3MaxLevel: num(a.Rank3MaxLevel),
        Rank2MinLevel: num(a.Rank2MinLevel),
        Rank2MaxLevel: num(a.Rank2MaxLevel),
        Rank1MinLevel: num(a.Rank1MinLevel),
        Rank1MaxLevel: num(a.Rank1MaxLevel),
        LimitBreakMinLevel: num(a.LimitBreakMinLevel),
        LimitBreakMaxLevel: num(a.LimitBreakMaxLevel),
      }),
    );

  /**
   * 던전과 미션 보상(ContentsRewardTableClient.xml). 인챈트가 어디서 나오는지 적는 데 쓴다. 보상 종류 2 가
   * 인챈트이고, 아이템 보상(1)의 argument "prefix:번호" "suffix:번호" 는 그 아이템에 붙어 나오는 인챈트다.
   * 이름은 던전 안내(DungeonGuide2025.xml)의 묶음 이름("알비 던전")이고, 묶음에 없으면 보상 표의 이름이다.
   * 한국 서버에서 쓰이지 않는 행(다른 지역, 꺼진 기능)은 뺀다.
   */
  const live = (record) => koreaRecord([record], enabled) !== null;
  const guide = records('dungeons.jsonl.gz').filter((r) =>
    r.source.endsWith('DungeonGuide2025.xml'),
  );
  const ContentsRewardGroupList = guide
    .filter((r) => r.tag === 'Group')
    .map(({ attributes: a }) => ({ Id: Number(a.DungeonGroupID), Name: textKey(a.LocalName) }));
  const groupOfDungeon = new Map(
    guide
      .filter((r) => r.tag === 'Detail')
      .map(({ attributes: a }) => [a.DungeonIDStr, Number(a.DungeonGroupID)]),
  );
  // 던전이나 유적이면 그 이름(DungeonDB2.xml 등)을 쓴다. 보상 표의 이름은 띄어쓰기가 다른 것이 있다("센마이 성 던전").
  const dungeonName = new Map(
    [
      ...pickById(
        records('dungeons.jsonl.gz').filter(
          (r) => r.tag === 'dungeon' && textKey(r.attributes.localname),
        ),
        'name',
        enabled,
      ),
    ].map(([name, { attributes: a }]) => [name, textKey(a.localname)]),
  );
  const rewards = records('other.jsonl.gz').filter((r) =>
    r.source.endsWith('ContentsRewardTableClient.xml'),
  );
  // 기록은 문서 순서가 아니다. 보상 묶음 참조는 경로 "…/ContentsList[c]/Contents[d]/Difficulty[p]/RewardPool"
  // 로 어느 콘텐츠(c), 몇 번째 난이도(d)인지 안다. 경로의 [n] 은 부모 안에서 몇 번째 자식인지다.
  const contentsByPath = new Map();
  const poolsById = new Map();
  for (const record of rewards.filter((r) => r.tag === 'Contents')) {
    const a = record.attributes;
    StringTable.push({ Id: `bundle.contents.${a.id}`, Str: a.desc ?? '' });
    contentsByPath.set(record.path, {
      GroupId: groupOfDungeon.get(a.id),
      Name: dungeonName.get(a.id) || `bundle.contents.${a.id}`,
      difficulties: new Map(),
    });
  }
  for (const record of rewards) {
    const a = record.attributes;
    if (record.tag === 'RewardPool' && a.rewardPoolId !== undefined) {
      const match = /^(.*\/Contents)\[(\d+)\]\/Difficulty\[\d+\]\/RewardPool$/.exec(record.path);
      const content = match && contentsByPath.get(match[1]);
      if (!content || !live(record)) continue;
      const pools =
        content.difficulties.get(match[2]) ?? content.difficulties.set(match[2], []).get(match[2]);
      pools.push(Number(a.rewardPoolId));
    } else if (record.tag === 'RewardPool' && a.id !== undefined) {
      if (!poolsById.has(Number(a.id)))
        poolsById.set(Number(a.id), { Id: Number(a.id), Rewards: [] });
    }
  }
  for (const record of rewards.filter((r) => r.tag === 'Reward' && live(r))) {
    const a = record.attributes;
    const id = Number(record.ancestors.findLast((x) => x.tag === 'RewardPool')?.attributes.id);
    const pool = poolsById.get(id) ?? poolsById.set(id, { Id: id, Rewards: [] }).get(id);
    const reward = {
      Type: a.type === '2' ? 'optionset' : a.type === '1' ? 'item' : `type${a.type}`,
      RewardId: Number(a.rewardId),
    };
    for (const [, slot, option] of String(a.argument ?? '').matchAll(/(prefix|suffix):(\d+)/g))
      reward[slot === 'prefix' ? 'PrefixOptionSetId' : 'SuffixOptionSetId'] = Number(option);
    pool.Rewards.push(reward);
  }
  const ContentsRewardList = [...contentsByPath.values()].map(({ difficulties, ...content }) => ({
    ...content,
    Difficulties: [...difficulties]
      .sort((x, y) => Number(x[0]) - Number(y[0]))
      .map(([, PoolIds]) => ({ PoolIds })),
  }));
  const ContentsRewardPoolList = [...poolsById.values()];

  /**
   * 세트 효과(SetItemDesc.xml). 효과는 Element(이름, 발동 기준 "10:37" 의 앞 수), 아이템마다 Item 의
   * element "fast_attack:1~4 stamina_saving:2~4", 품질 조건이 붙은 수치는 그 아래 quality 다.
   */
  const setRecords = records('equipment-effects.jsonl.gz').filter((r) =>
    r.source.endsWith('SetItemDesc.xml'),
  );
  const setElements = (text) =>
    String(text ?? '')
      .trim()
      // 띄어 쓰거나 쉼표로 가른다("a:10, b:10").
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((part) => {
        const at = part.lastIndexOf(':');
        const [min, max] = parseRange(part.slice(at + 1));
        return { Name: part.slice(0, at), Min: min, Max: max };
      });
  const SetItemDescElementList = [
    ...pickById(
      setRecords.filter((r) => r.tag === 'Element'),
      'id',
      enabled,
    ).values(),
  ].map(({ attributes: a }) => ({
    Id: Number(a.id),
    Key: a.name,
    Name: textKey(a.localname),
    Desc: textKey(a.description),
    ThresholdCount: Number(String(a.threshold ?? '').split(':')[0]) || 0,
  }));
  const setItems = new Map();
  for (const record of setRecords) {
    if (!live(record)) continue;
    if (record.tag === 'Item') {
      setItems.set(record.path, {
        Id: Number(record.attributes.id),
        Elements: setElements(record.attributes.element),
        QualityElements: [],
      });
    }
  }
  for (const record of setRecords) {
    if (record.tag !== 'quality' || !live(record)) continue;
    const item = setItems.get(record.path.replace(/\[\d+\]\/quality$/, ''));
    item?.QualityElements.push({
      Quality: Number(record.attributes.threshold) || 0,
      Elements: setElements(record.attributes.bonus),
    });
  }
  const ItemExtendSetItemDescList = [...setItems.values()];

  const ergPins = JSON.parse(readFileSync(new URL('./erg-pins.json', import.meta.url), 'utf8'));
  const ergRecords = records('upgrades.jsonl.gz').filter((r) =>
    r.source.endsWith('ErgEnhanceClient.xml'),
  );
  const ergTypeOf = (record) => {
    const type = record.ancestors.find((a) => a.tag === 'ErgType' || a.tag === 'DarkErgType');
    if (!type) return undefined;
    return type.tag === 'DarkErgType' ? 101 : Number(type.attributes.typeId);
  };
  const ergGroups = new Map();
  for (const record of ergRecords.filter((r) => r.tag === 'WeaponAblity')) {
    const set = Number(
      record.ancestors.find((a) => a.tag === 'ErgWeaponAblity')?.attributes.weaponSetId,
    );
    const key = `${ergTypeOf(record)}/${set}/${record.attributes.ergLevel}`;
    (ergGroups.get(key) ?? ergGroups.set(key, []).get(key)).push(record);
  }
  const darkTemplates = new Map(
    ergRecords
      .filter((r) => r.tag === 'WeaponSet')
      .map(({ attributes: a }) => [Number(a.weaponSetId), textKey(a.baseVar1)]),
  );
  // S 는 효과 넷, A 는 셋, B 는 둘이다(공식 가이드: S 1/21/31/41, A 1/16/26, B 1/11 레벨부터).
  const ERG_EFFECTS = { 1: 4, 2: 3, 3: 2 };
  const ergTypes = new Map();
  for (const [key, list] of ergGroups) {
    const chosen = koreaRecord(list, enabled);
    if (!chosen) continue;
    const [typeId, set] = key.split('/').map(Number);
    const a = chosen.attributes;
    const values = [a.baseVar1, a.addVar1, a.addVar2, a.addVar3]
      .filter((value) => value !== undefined && value !== '')
      .flatMap((value) => String(value).split(',').map(Number));
    const ability = { ErgLevel: Number(a.ergLevel), Values: values };
    if (a.displayVar !== undefined)
      ability.DisplayValues = String(a.displayVar).split(',').map(Number);
    const sets = ergTypes.get(typeId) ?? ergTypes.set(typeId, new Map()).get(typeId);
    if (!sets.has(set)) {
      const templates =
        typeId === 101
          ? [darkTemplates.get(set) ?? '']
          : (ergPins.effects[set] ?? []).slice(0, ERG_EFFECTS[typeId] ?? 0);
      sets.set(set, { WeaponSetId: set, EffectTemplates: templates, Ablities: [] });
    }
    sets.get(set).Ablities.push(ability);
  }
  const ErgTypeList = [...ergTypes]
    .sort((x, y) => x[0] - y[0])
    .map(([TypeId, sets]) => ({
      TypeId,
      WeaponSets: [...sets.values()]
        .sort((x, y) => x.WeaponSetId - y.WeaponSetId)
        .map((set) => ({ ...set, Ablities: set.Ablities.sort((x, y) => x.ErgLevel - y.ErgLevel) })),
    }));

  const ergSets = Object.entries(ergPins.sets).map(([set, filter]) => [
    Number(set),
    compileItemFilter(filter),
  ]);
  const ergExclude = compileItemFilter(ergPins.exclude);
  const ErgItemList = [];
  for (const [id, json] of jsons) {
    const category = String(json.Category ?? '');
    let set = 0;
    if (category.startsWith('/equip/') && !ergExclude(category) && json.DB_StoreType !== '5')
      set = ergSets.find(([, match]) => match(category))?.[0] ?? 0;
    if (ergPins.items[id] !== undefined) set = ergPins.items[id];
    if (set) ErgItemList.push({ Id: Number(id), WeaponSetId: set });
  }

  return {
    StringTable,
    clientDate: clientDataDate(run),
    ItemList,
    RaceList,
    OptionSetList,
    enchants,
    ItemUpgradeList,
    ItemExtendUpgradeList,
    ItemExtendMetalWareList,
    MetalWareAbilityList,
    MetalWareLevelList,
    ErgTypeList,
    ErgItemList,
    ContentsRewardGroupList,
    ContentsRewardPoolList,
    ContentsRewardList,
    SetItemDescElementList,
    ItemExtendSetItemDescList,
    itemJsons: jsons,
  };
}
