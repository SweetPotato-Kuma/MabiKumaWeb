/**
 * 인챈트 정의를 만드는 코드. 장비 시뮬레이터(collect-equipment.mjs)와 인챈트 스크롤 사전
 * (build-enchant-scrolls.mjs)이 같은 정의를 쓴다.
 */

const round = (value) => Math.round(value * 1e4) / 1e4;

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
/** 인챈트 조건이 가르는 장비 재질. 아이템 JSON 의 Category 경로 토큰에서 찾는다. */
const ENCHANT_EQUIP_TAGS = new Set([
  'helmet',
  'headgear',
  'heavyarmor',
  'lightarmor',
  'cloth',
  'gauntlet',
  'armorboots',
  'glove',
  'shoes',
]);

export const equipTagsOf = (json) => [
  ...new Set(
    String(json?.Category ?? '')
      .split('/')
      .filter((token) => ENCHANT_EQUIP_TAGS.has(token)),
  ),
];

const ENCHANT_EFFECT_CALL =
  /(?:SetParamOnEquip|SetItemOption|SetSetItemEffectOnEquip|AddBonusOnAlchemy)\((\w+),\s*([+-])\s*\(?\s*([\d.]+)\s*(?:~\s*([\d.]+))?\s*\)?\s*\)/gi;

/**
 * 인챈트 효과 한 줄: "조건 : 조건 : SetParamOnEquip(AttMax, +(50~60));"
 * 앞 칸이 하나라도 차 있으면 조건이 붙은 효과다(스킬 랭크, 레벨, 타이틀 등). 조건의 뜻은 설명 문장에 있다.
 * 조건이 IsUsingEquip(a,b) 면 어느 재질의 장비에만 붙는 효과라서 그 목록을 다섯 번째 칸에 싣는다.
 * → [능력치, 최소, 최대, 조건 여부(1), 재질 목록?]
 */
function parseEnchantEffects(optionList, unknown) {
  const effects = [];
  for (const line of String(optionList ?? '').split('\n')) {
    const parts = line.split(':');
    const conditional = parts.slice(0, -1).some((part) => part.trim() !== '');
    const equip = /IsUsingEquip\(([^)]*)\)/i
      .exec(line)?.[1]
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
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
      if (equip?.length) effect.push(equip);
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
export function buildEnchantSources(data, text) {
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

export function buildEnchantDef(row, cached, text, unknown, sources) {
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
