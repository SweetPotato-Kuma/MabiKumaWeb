import type { EnchantDef } from './types';

/**
 * 인챈트 목록의 정렬.
 *
 * 한 장비에 바를 수 있는 인챈트가 수백 개라 이름이나 랭크 순으로는 쓸 만한 것이 묻힌다. 게임을 하는
 * 사람이 실제로 고르는 순서를 따른다.
 *
 *   1. 어디서 나오는가. 가장 높은 던전(브리 레흐, 탈라 가흐)의 인챈트가 먼저다. 그 아래로 무기는
 *      크롬 바스, 방어구는 글렌 베르나가 다음이다.
 *   2. 장비 분류마다 중요한 능력치가 높은 순. 물리 무기는 최대 대미지와 피어싱, 마법 무기는 마법
 *      공격력과 피어싱, 힐링 원드는 힐링 효과, 경갑과 중갑은 최대 대미지, 천옷은 마법 공격력과
 *      연금술 대미지.
 *   3. 나머지는 늦게 나온 것, 랭크가 높은 것부터.
 *
 * 조건이 붙은 효과(스킬 랭크, 부위별 수치)도 그 인챈트가 낼 수 있는 값으로 본다. 부위마다 수치가
 * 다른 방어구 인챈트는 합치지 않고 가장 큰 값을 쓴다. 합치면 한 부위에만 붙는 수치가 부풀려진다.
 */

export type EquipClass = 'physical' | 'magic' | 'healing' | 'alchemy' | 'plate' | 'cloth' | 'armor';

const CLASS_BY_CATEGORY: Record<string, EquipClass> = {
  원드: 'magic',
  스태프: 'magic',
  마도서: 'magic',
  오브: 'magic',
  '힐링 원드': 'healing',
  실린더: 'alchemy',
  경갑옷: 'plate',
  중갑옷: 'plate',
  천옷: 'cloth',
  검: 'physical',
  둔기: 'physical',
  도끼: 'physical',
  랜스: 'physical',
  너클: 'physical',
  활: 'physical',
  석궁: 'physical',
  듀얼건: 'physical',
  수리검: 'physical',
  아틀라틀: 'physical',
  '체인 블레이드': 'physical',
  '대형 낫': 'physical',
  핸들: 'physical',
  '한손 장비': 'physical',
  '양손 장비': 'physical',
};

/** 사전 카테고리로 장비 분류를 정한다. 목록에 없는 것(모자, 장갑, 신발, 장신구 등)은 방어구로 본다. */
export function equipClass(category: string): EquipClass {
  return CLASS_BY_CATEGORY[category] ?? 'armor';
}

const isWeapon = (cls: EquipClass) =>
  cls === 'physical' || cls === 'magic' || cls === 'healing' || cls === 'alchemy';

/** 연금술 대미지는 속성별 이름이 여럿이라 하나로 묶어 본다. */
const ALCHEMY_STATS = new Set(['alchemy_damage', 'alchemy_all', 'alchemy_fire', 'alchemy_water']);

type KeyStat = 'attack_max' | 'magic_damage' | 'lance_piercing' | 'healing_potency' | 'alchemy';

const KEY_STATS: Record<EquipClass, KeyStat[]> = {
  physical: ['attack_max', 'lance_piercing'],
  magic: ['magic_damage', 'lance_piercing'],
  healing: ['healing_potency', 'magic_damage', 'lance_piercing'],
  alchemy: ['alchemy', 'attack_max'],
  plate: ['attack_max'],
  cloth: ['magic_damage', 'alchemy'],
  armor: ['attack_max', 'magic_damage'],
};

/** 가장 높은 던전. 무기와 방어구 모두 여기서 나온 것이 제일 앞이다. */
const TOP_SOURCES = ['브리 레흐', '탈라 가흐'];

/**
 * 출처 등급. 작을수록 앞이다.
 * 0 가장 높은 던전, 1 무기면 크롬 바스 방어구면 글렌 베르나, 2 그 반대쪽, 3 그 밖의 던전과 미션, 4 출처 모름.
 */
export function sourceTier(enchant: EnchantDef, cls: EquipClass): number {
  const src = enchant.src ?? [];
  if (src.length === 0) return 4;
  if (src.some((name) => TOP_SOURCES.includes(name))) return 0;
  const [first, second] = isWeapon(cls)
    ? ['크롬 바스', '글렌 베르나']
    : ['글렌 베르나', '크롬 바스'];
  if (src.includes(first)) return 1;
  if (src.includes(second)) return 2;
  return 3;
}

/** 이 인챈트가 그 능력치를 가장 높게 올리는 값. 없으면 0. 깎는 효과는 0 으로 본다. */
export function keyStatValue(enchant: EnchantDef, key: KeyStat): number {
  let best = 0;
  for (const [stat, , max] of enchant.effects) {
    const matches = key === 'alchemy' ? ALCHEMY_STATS.has(stat) : stat === key;
    if (matches && max > best) best = max;
  }
  return best;
}

/** 이 장비 분류에서 눈여겨볼 인챈트인지. 가까운 출처거나 중요한 능력치를 올린다. */
export function isNotableEnchant(enchant: EnchantDef, cls: EquipClass): boolean {
  if (sourceTier(enchant, cls) <= 2) return true;
  return KEY_STATS[cls].some((key) => keyStatValue(enchant, key) > 0);
}

export function compareForEquipment(cls: EquipClass) {
  const keys = KEY_STATS[cls];
  return (a: EnchantDef, b: EnchantDef): number => {
    const tier = sourceTier(a, cls) - sourceTier(b, cls);
    if (tier) return tier;
    for (const key of keys) {
      const diff = keyStatValue(b, key) - keyStatValue(a, key);
      if (diff) return diff;
    }
    return (b.gen ?? 0) - (a.gen ?? 0) || b.level - a.level || a.name.localeCompare(b.name, 'ko');
  };
}
