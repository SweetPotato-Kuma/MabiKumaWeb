import { roundStat } from './stats';
import type { AbilityDef, LevelRow } from './types';

/**
 * 세공 계산.
 *
 * 세공 옵션의 레벨 범위는 두 단계로 정해진다.
 *   1. 옵션마다 "레벨 상한 기준값" 이 있다. 한손 무기와 장신구는 따로 적힌 값을 쓴다.
 *   2. 그 기준값 줄에서 랭크(3, 2, 1)별 최소/최대 레벨을 읽는다. 1랭크에서 한계 돌파가 되는
 *      옵션은 그보다 높은 레벨이 따로 있다.
 * 옵션 값은 (시작값 + 레벨당 증가 × (레벨 - 1)) × 배율이다.
 *
 * 세공 도구마다 레벨 폭을 좁히는 계수가 있지만 여기서는 쓰지 않는다. 시뮬레이터는 "이 옵션이
 * 이 랭크에서 가질 수 있는 레벨" 을 고르는 곳이라 도구와 상관없는 전체 폭을 보여 준다.
 */

/** 1랭크가 가장 높다. 게임 표기를 그대로 따른다. */
export type ReforgeRank = 1 | 2 | 3;

export const REFORGE_RANKS: ReforgeRank[] = [3, 2, 1];

/** 한 번에 붙는 세공 옵션은 셋까지다. */
export const REFORGE_MAX_OPTIONS = 3;

const ONE_HAND_TYPES = new Set(['OHSword', 'OHAxe', 'OHBlunt', 'RoughTouch', 'Rapier']);
const ACCESSORY_TYPE = 'Accessary';

export function baseMaxLevel(ability: AbilityDef, equipType: string): number {
  const [base, oneHand, accessory] = ability.lv;
  if (equipType === ACCESSORY_TYPE) return accessory || base;
  if (ONE_HAND_TYPES.has(equipType)) return oneHand || base;
  return base;
}

export interface LevelRange {
  min: number;
  max: number;
  /** 한계 돌파 레벨. 없으면 둘 다 0 */
  limitBreakMin: number;
  limitBreakMax: number;
}

const EMPTY_RANGE: LevelRange = { min: 0, max: 0, limitBreakMin: 0, limitBreakMax: 0 };

export function levelRange(
  ability: AbilityDef,
  rank: ReforgeRank,
  equipType: string,
  levels: readonly LevelRow[],
): LevelRange {
  const row = levels.find((entry) => entry[0] === baseMaxLevel(ability, equipType));
  if (!row) return EMPTY_RANGE;

  const [, r3Min, r3Max, r2Min, r2Max, r1Min, r1Max, lbMin, lbMax] = row;
  const [min, max] = rank === 3 ? [r3Min, r3Max] : rank === 2 ? [r2Min, r2Max] : [r1Min, r1Max];
  if (max <= 0) return EMPTY_RANGE;

  const limitBreak = rank === 1 && ability.lb && lbMax > 0;
  return {
    min: Math.min(Math.max(min, 1), max),
    max,
    limitBreakMin: limitBreak ? lbMin : 0,
    limitBreakMax: limitBreak ? lbMax : 0,
  };
}

/** 이 랭크에서 고를 수 있는 가장 높은 레벨. 한계 돌파가 있으면 그것까지. */
export function highestLevel(range: LevelRange): number {
  return range.limitBreakMax || range.max;
}

export function isLimitBreakLevel(range: LevelRange, level: number): boolean {
  return range.limitBreakMax > 0 && level > range.max;
}

/** 이 랭크에서 붙을 수 있는 옵션만. */
export function reforgeCandidates(
  abilities: readonly AbilityDef[],
  rank: ReforgeRank,
  equipType: string,
  levels: readonly LevelRow[],
): AbilityDef[] {
  return abilities.filter((ability) => levelRange(ability, rank, equipType, levels).max > 0);
}

export function abilityValue(ability: AbilityDef, level: number): number {
  if (level < 1) return 0;
  return roundStat((ability.init + ability.per * (level - 1)) * ability.std);
}

/** 단위가 값에 바로 붙는 말. "5% 증가", "3초 감소". 나머지는 띄어 쓴다("15 증가"). */
const ATTACHED_UNIT = /^(%|cm|m|초|도|배|개|마리|명)(\s|$)/;

/** "체력 15 증가", "공격 속도 5% 증가" */
export function describeAbility(ability: AbilityDef, level: number): string {
  const value = abilityValue(ability, level).toLocaleString('ko-KR', { maximumFractionDigits: 4 });
  const unit = ability.unit.trim();
  if (!unit) return `${ability.name} ${value}`;
  return ATTACHED_UNIT.test(unit)
    ? `${ability.name} ${value}${unit}`
    : `${ability.name} ${value} ${unit}`;
}
