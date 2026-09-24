import {
  REFORGE_MAX_OPTIONS,
  REFORGE_RANKS,
  highestLevel,
  levelRange,
  type ReforgeRank,
} from './reforge';
import { NON_ADDITIVE_STATS, compareStats, roundStat } from './stats';
import type { AbilityDef, EquipmentRecord, LevelRow, UpgradeDef } from './types';

/**
 * 장비 시뮬레이션의 상태와 계산. 화면과 떨어뜨려 두어 시험할 수 있게 했다.
 *
 * 최종 능력치 = 기본 능력치 + 고른 랜덤 능력치 + 고른 개조의 합.
 * 세공과 특별 개조는 능력치 칸에 더하지 않고 따로 적는다. 세공은 대부분 캐릭터 능력치나 스킬
 * 효과를 올리는 옵션이라 무기 능력치 표에 섞으면 오히려 틀린 표가 된다. 특별 개조는 단계별
 * 수치를 모으지 못했다.
 */

export interface ReforgePick {
  abilityId: number;
  level: number;
}

export type SpecialKind = 's' | 'r';

export interface SimulationState {
  /** 랜덤 능력치마다 고른 값 */
  random: Record<string, number>;
  /** 일반 개조 칸마다 고른 개조 번호. 비운 칸은 null */
  slots: (number | null)[];
  gemSlots: (number | null)[];
  reforge: { rank: ReforgeRank; options: ReforgePick[] };
  special: { kind: SpecialKind | null; level: number };
}

export function initialState(item: EquipmentRecord): SimulationState {
  return {
    // 처음에는 가장 낮은 값. 제작이나 드롭으로 얻었을 때 적어도 이만큼은 붙는다.
    random: Object.fromEntries((item.random ?? []).map(([stat, min]) => [stat, min])),
    slots: new Array<number | null>(item.upgrade?.max ?? 0).fill(null),
    gemSlots: new Array<number | null>(item.upgrade?.gemMax ?? 0).fill(null),
    reforge: { rank: 1, options: [] },
    special: { kind: null, level: 0 },
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

export interface StatRow {
  stat: string;
  base: number;
  random: number;
  upgradeMin: number;
  upgradeMax: number;
  totalMin: number;
  totalMax: number;
}

/** 능력치 표. 기본, 랜덤, 개조를 칸별로 나눠 두어 어디서 온 값인지 보이게 한다. */
export function computeStats(
  item: EquipmentRecord,
  upgrades: Record<string, UpgradeDef>,
  state: SimulationState,
): StatRow[] {
  const rows = new Map<string, StatRow>();
  const row = (stat: string) => {
    let entry = rows.get(stat);
    if (!entry) {
      entry = { stat, base: 0, random: 0, upgradeMin: 0, upgradeMax: 0, totalMin: 0, totalMax: 0 };
      rows.set(stat, entry);
    }
    return entry;
  };

  for (const [stat, value] of Object.entries(item.base ?? {})) row(stat).base += value;
  for (const [stat] of item.random ?? []) row(stat).random += state.random[stat] ?? 0;
  for (const def of selectedUpgrades(state, upgrades)) {
    for (const [stat, min, max] of def.stats) {
      if (NON_ADDITIVE_STATS.has(stat)) continue;
      row(stat).upgradeMin += min;
      row(stat).upgradeMax += max;
    }
  }

  return [...rows.values()]
    .map((entry) => ({
      ...entry,
      upgradeMin: roundStat(entry.upgradeMin),
      upgradeMax: roundStat(entry.upgradeMax),
      totalMin: roundStat(entry.base + entry.random + entry.upgradeMin),
      totalMax: roundStat(entry.base + entry.random + entry.upgradeMax),
    }))
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
}

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

  return state;
}
