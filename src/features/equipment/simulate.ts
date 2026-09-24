import {
  REFORGE_MAX_OPTIONS,
  REFORGE_RANKS,
  highestLevel,
  levelRange,
  type ReforgeRank,
} from './reforge';
import { specialStep, type SpecialStep } from './specialUpgrade';
import { NON_ADDITIVE_STATS, compareStats, roundStat } from './stats';
import type { AbilityDef, EnchantDef, EquipmentRecord, LevelRow, UpgradeDef } from './types';

/**
 * 장비 시뮬레이션의 상태와 계산. 화면과 떨어뜨려 두어 시험할 수 있게 했다.
 *
 * 최종 능력치 = 기본 능력치 + 고른 유동 능력치 + 고른 개조 + 고른 인챈트 + 특별 개조.
 * 한 줄마다 어디서 얼마가 왔는지 따로 들고 있어서 화면이 합계와 구성을 같이 보여 준다.
 *
 * 세공은 능력치 칸에 더하지 않고 따로 적는다. 대부분 캐릭터 능력치나 스킬 효과를 올리는 옵션이라
 * 무기 능력치 표에 섞으면 오히려 틀린 표가 된다.
 */

export interface ReforgePick {
  abilityId: number;
  level: number;
}

export type SpecialKind = 's' | 'r';

export interface EnchantPick {
  prefix: number | null;
  suffix: number | null;
  /**
   * 조건이 붙은 효과(스킬 랭크, 레벨 등)도 더할지. 조건을 채웠는지는 캐릭터마다 달라 여기서 알 수
   * 없다. 기본은 채웠다고 본다. 인챈트를 고르는 사람은 보통 그 조건을 노린다.
   */
  conditional: boolean;
}

export interface SimulationState {
  /** 유동 능력치마다 고른 값(기본값에 더해지는 몫) */
  random: Record<string, number>;
  /** 일반 개조 칸마다 고른 개조 번호. 비운 칸은 null */
  slots: (number | null)[];
  gemSlots: (number | null)[];
  reforge: { rank: ReforgeRank; options: ReforgePick[] };
  special: { kind: SpecialKind | null; level: number };
  enchant: EnchantPick;
}

export function initialState(item: EquipmentRecord): SimulationState {
  return {
    // 처음에는 가장 낮은 값. 제작이나 드롭으로 얻었을 때 적어도 이만큼은 붙는다.
    random: Object.fromEntries((item.random ?? []).map(([stat, min]) => [stat, min])),
    slots: new Array<number | null>(item.upgrade?.max ?? 0).fill(null),
    gemSlots: new Array<number | null>(item.upgrade?.gemMax ?? 0).fill(null),
    reforge: { rank: 1, options: [] },
    special: { kind: null, level: 0 },
    enchant: { prefix: null, suffix: null, conditional: true },
  };
}

/**
 * 이 칸에 할 수 있는 개조. 칸 번호는 0 부터 센다.
 * 보석이 드는 개조는 보석 칸에만, 나머지는 일반 칸에만 들어간다.
 */
export function upgradesForSlot(
  item: EquipmentRecord,
  upgrades: Record<string, UpgradeDef>,
  slot: number,
  gem: boolean,
): [number, UpgradeDef][] {
  const result: [number, UpgradeDef][] = [];
  // 같은 번호가 목록에 두 번 들어 있어도 선택지는 하나다.
  for (const id of new Set(item.upgrade?.ids ?? [])) {
    const def = upgrades[id];
    if (!def) continue;
    if (Boolean(def.gems?.length) !== gem) continue;
    if (def.min <= slot && slot <= def.max) result.push([id, def]);
  }
  return result;
}

export function selectedUpgrades(
  state: Pick<SimulationState, 'slots' | 'gemSlots'>,
  upgrades: Record<string, UpgradeDef>,
): UpgradeDef[] {
  return [...state.slots, ...state.gemSlots]
    .filter((id): id is number => id !== null)
    .map((id) => upgrades[id])
    .filter((def): def is UpgradeDef => Boolean(def));
}

export function selectedEnchants(pick: EnchantPick, enchants: readonly EnchantDef[]): EnchantDef[] {
  return [pick.prefix, pick.suffix]
    .map((id) => enchants.find((enchant) => enchant.id === id))
    .filter((enchant): enchant is EnchantDef => Boolean(enchant));
}

/** 고른 특별 개조의 효과. 안 골랐거나 종류 표가 없으면 undefined, 그 단계 칸이 비었으면 null. */
export function selectedSpecial(
  item: EquipmentRecord,
  state: SimulationState,
): SpecialStep | undefined {
  const { kind, level } = state.special;
  if (!kind || !item.special || level < 1) return undefined;
  return specialStep(kind, kind === 's' ? item.special.s : item.special.r, level);
}

/** [최소, 최대] */
export type Range = [min: number, max: number];

export interface StatRow {
  stat: string;
  base: number;
  random: number;
  /** 유동 능력치의 폭(기본값에 더해지는 몫). 유동 능력치가 아니면 없다. */
  randomRange?: Range;
  upgrade: Range;
  enchant: Range;
  special: number;
  total: Range;
}

/** 능력치 표. 기본, 유동, 개조, 인챈트, 특별 개조를 칸별로 나눠 두어 어디서 온 값인지 보이게 한다. */
export function computeStats(
  item: EquipmentRecord,
  upgrades: Record<string, UpgradeDef>,
  state: SimulationState,
  enchants: readonly EnchantDef[] = [],
): StatRow[] {
  const rows = new Map<string, StatRow>();
  const row = (stat: string) => {
    let entry = rows.get(stat);
    if (!entry) {
      entry = {
        stat,
        base: 0,
        random: 0,
        upgrade: [0, 0],
        enchant: [0, 0],
        special: 0,
        total: [0, 0],
      };
      rows.set(stat, entry);
    }
    return entry;
  };

  for (const [stat, value] of Object.entries(item.base ?? {})) row(stat).base += value;
  for (const [stat, min, max] of item.random ?? []) {
    row(stat).random += state.random[stat] ?? min;
    row(stat).randomRange = [min, max];
  }
  for (const def of selectedUpgrades(state, upgrades)) {
    for (const [stat, min, max] of def.stats) {
      if (NON_ADDITIVE_STATS.has(stat)) continue;
      row(stat).upgrade[0] += min;
      row(stat).upgrade[1] += max;
    }
  }
  for (const enchant of selectedEnchants(state.enchant, enchants)) {
    for (const [stat, min, max, conditional] of enchant.effects) {
      if (conditional && !state.enchant.conditional) continue;
      row(stat).enchant[0] += min;
      row(stat).enchant[1] += max;
    }
  }
  for (const [stat, value] of selectedSpecial(item, state) ?? []) row(stat).special += value;

  return [...rows.values()]
    .map((entry) => {
      const fixed = entry.base + entry.random + entry.special;
      return {
        ...entry,
        upgrade: [roundStat(entry.upgrade[0]), roundStat(entry.upgrade[1])] as Range,
        enchant: [roundStat(entry.enchant[0]), roundStat(entry.enchant[1])] as Range,
        total: [
          roundStat(fixed + entry.upgrade[0] + entry.enchant[0]),
          roundStat(fixed + entry.upgrade[1] + entry.enchant[1]),
        ] as Range,
      };
    })
    .sort((a, b) => compareStats(a.stat, b.stat));
}

export function upgradeCost(defs: readonly UpgradeDef[]): { ep: number; gold: number } {
  return defs.reduce((sum, def) => ({ ep: sum.ep + def.ep, gold: sum.gold + def.gold }), {
    ep: 0,
    gold: 0,
  });
}

// ---------------------------------------------------------------------------
// 링크로 저장하고 불러오기
//
// 고른 조합을 주소 뒤에 붙여 두면 즐겨찾기나 공유로 그대로 다시 연다. 서버에 저장하지 않으므로
// 방문자 정보를 받을 일이 없다. 아이템 데이터가 바뀌어 맞지 않게 된 값은 불러올 때 버린다.

export interface SimulationParams {
  rv?: string;
  up?: string;
  gm?: string;
  rf?: string;
  sp?: string;
  /** 인챈트 "접두.접미" */
  en?: string;
  /** 조건 붙은 인챈트 효과를 뺐으면 "0" */
  ec?: string;
}

export const SIMULATION_PARAM_KEYS = ['rv', 'up', 'gm', 'rf', 'sp', 'en', 'ec'] as const;

const joinSlots = (slots: (number | null)[]) =>
  slots.map((id) => (id === null ? '' : String(id))).join('.');

export function encodeState(item: EquipmentRecord, state: SimulationState): SimulationParams {
  const params: SimulationParams = {};

  const random = item.random ?? [];
  if (random.some(([stat, min]) => (state.random[stat] ?? min) !== min)) {
    params.rv = random.map(([stat, min]) => String(state.random[stat] ?? min)).join('.');
  }
  if (state.slots.some((id) => id !== null)) params.up = joinSlots(state.slots);
  if (state.gemSlots.some((id) => id !== null)) params.gm = joinSlots(state.gemSlots);
  if (state.reforge.options.length > 0) {
    params.rf = `${state.reforge.rank}_${state.reforge.options.map((o) => `${o.abilityId}-${o.level}`).join('.')}`;
  }
  if (state.special.kind && state.special.level > 0)
    params.sp = `${state.special.kind}${state.special.level}`;
  if (state.enchant.prefix !== null || state.enchant.suffix !== null) {
    params.en = joinSlots([state.enchant.prefix, state.enchant.suffix]);
  }
  if (!state.enchant.conditional) params.ec = '0';
  return params;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function decodeSlots(
  text: string | undefined,
  item: EquipmentRecord,
  upgrades: Record<string, UpgradeDef>,
  count: number,
  gem: boolean,
): (number | null)[] {
  const parts = (text ?? '').split('.');
  return Array.from({ length: count }, (_, slot) => {
    const id = Number(parts[slot]);
    if (!parts[slot] || !Number.isInteger(id)) return null;
    return upgradesForSlot(item, upgrades, slot, gem).some(([candidate]) => candidate === id)
      ? id
      : null;
  });
}

/** 주소의 값을 상태로. 맞지 않는 값은 조용히 버리고 기본값을 쓴다. */
export function decodeState(
  params: SimulationParams,
  item: EquipmentRecord,
  upgrades: Record<string, UpgradeDef>,
  abilities: readonly AbilityDef[],
  levels: readonly LevelRow[],
  enchants: readonly EnchantDef[] = [],
): SimulationState {
  const state = initialState(item);

  const values = (params.rv ?? '').split('.');
  (item.random ?? []).forEach(([stat, min, max], index) => {
    const value = Number(values[index]);
    if (values[index] !== undefined && values[index] !== '' && Number.isFinite(value)) {
      state.random[stat] = clamp(Math.round(value), min, max);
    }
  });

  state.slots = decodeSlots(params.up, item, upgrades, state.slots.length, false);
  state.gemSlots = decodeSlots(params.gm, item, upgrades, state.gemSlots.length, true);

  const [rankText, optionText] = (params.rf ?? '').split('_');
  const rank = Number(rankText) as ReforgeRank;
  if (REFORGE_RANKS.includes(rank) && item.reforge) {
    state.reforge.rank = rank;
    const seen = new Set<number>();
    for (const part of (optionText ?? '').split('.')) {
      const [idText, levelText] = part.split('-');
      const ability = abilities.find((entry) => entry.id === Number(idText));
      if (!ability || seen.has(ability.id)) continue;
      const range = levelRange(ability, rank, item.reforge.type, levels);
      if (range.max <= 0) continue;
      seen.add(ability.id);
      state.reforge.options.push({
        abilityId: ability.id,
        level: clamp(Math.round(Number(levelText) || range.min), range.min, highestLevel(range)),
      });
      if (state.reforge.options.length >= REFORGE_MAX_OPTIONS) break;
    }
  }

  const special = /^([sr])(\d+)$/.exec(params.sp ?? '');
  if (special && item.special) {
    const kind = special[1] as SpecialKind;
    const hasKind = kind === 's' ? item.special.s > 0 : item.special.r > 0;
    if (hasKind) state.special = { kind, level: clamp(Number(special[2]), 1, item.special.max) };
  }

  // 인챈트는 그 자리(접두/접미)에 맞는 것만 받는다.
  const [prefixText, suffixText] = (params.en ?? '').split('.');
  const pickEnchant = (text: string | undefined, slot: 0 | 1) => {
    const found = enchants.find((enchant) => enchant.id === Number(text) && enchant.slot === slot);
    return text && found ? found.id : null;
  };
  state.enchant = {
    prefix: pickEnchant(prefixText, 0),
    suffix: pickEnchant(suffixText, 1),
    conditional: params.ec !== '0',
  };

  return state;
}
