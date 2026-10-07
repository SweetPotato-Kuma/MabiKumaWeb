import data from './data.json';

/**
 * 에코스톤 각성 시뮬레이터.
 *
 * 각성하면 붙어 있던 각성 능력이 새로 뽑힌다. 게임 클라이언트 데이터의 규칙을 그대로 쓴다
 * (scripts/game-data/build-echostone.mjs).
 *
 * 1. 돌 종류마다 정해진 능력 목록에서 가중치에 비례해 능력 하나를 고른다. 몇몇 능력은 돌 등급이 높아야 나온다.
 * 2. 능력의 최대 레벨(1, 3, 5, 6, 10, 20)마다 레벨별 가중치가 있다. 낮은 레벨일수록 무겁다.
 * 3. 돌 등급이 그 능력이 나올 수 있는 가장 높은 레벨을 정한다. 30등급이어야 최대 레벨까지 나온다.
 * 4. 고급, 최고급 각성제는 낮은 레벨 몇 개를 빼 준다. 등급 상한이 그보다 낮으면 상한 레벨만 나온다.
 */

export interface EchoAbility {
  id: number;
  name: string;
  maxLevel: number;
  /** 레벨 1의 수치와 레벨마다 더하는 수치. 수치가 없는 능력은 null. */
  value: { min: number; gap: number; unit: string } | null;
}

export interface EchoStone {
  id: number;
  name: string;
  /** [능력 번호(ECHO_ABILITIES 의 자리), 가중치, 나오는 최저 등급?]. */
  pool: ([number, number] | [number, number, number])[];
}

export interface EchoBooster {
  name: string;
  /** 최대 레벨 무리마다 이 레벨 이하는 나오지 않는다. */
  floor: Record<string, number>;
}

export interface EchoResult {
  /** ECHO_ABILITIES 의 자리. */
  ability: number;
  level: number;
}

export interface EchoTarget {
  ability: number;
  minLevel: number;
}

export type RandomSource = () => number;

export const ECHO_STONES = data.stones as EchoStone[];
export const ECHO_ABILITIES = data.abilities as EchoAbility[];
export const ECHO_BOOSTERS = data.boosters as EchoBooster[];
const GRADE_CAPS = data.gradeCaps as Record<string, Record<string, number>>;
const LEVEL_WEIGHTS = data.levelWeights as Record<string, number[]>;

export const MIN_GRADE = 1;
export const MAX_GRADE = 30;

const clampGrade = (grade: number) => Math.min(MAX_GRADE, Math.max(MIN_GRADE, Math.round(grade)));

export const echoStone = (id: number) =>
  ECHO_STONES.find((stone) => stone.id === id) ?? ECHO_STONES[0];

/** 그 등급의 돌에서 나올 수 있는 능력과 가중치. */
export function abilityPool(
  stone: EchoStone,
  grade: number,
): { ability: number; weight: number }[] {
  const at = clampGrade(grade);
  return stone.pool
    .filter((entry) => (entry[2] ?? MIN_GRADE) <= at)
    .map(([ability, weight]) => ({ ability, weight }));
}

/** 그 능력이 뽑힐 확률. 목록에 없으면 0. */
export function abilityChance(stone: EchoStone, grade: number, ability: number): number {
  const pool = abilityPool(stone, grade);
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  const weight = pool.find((entry) => entry.ability === ability)?.weight ?? 0;
  return total > 0 ? weight / total : 0;
}

/** 등급과 각성제로 정해지는 레벨 폭(끝 포함). */
export function levelRange(ability: EchoAbility, grade: number, booster: EchoBooster) {
  const key = String(ability.maxLevel);
  const cap = Math.max(
    1,
    Math.min(ability.maxLevel, GRADE_CAPS[String(clampGrade(grade))]?.[key] ?? 1),
  );
  const low = Math.min(cap, (booster.floor[key] ?? 0) + 1);
  return { low, high: cap };
}

/** 레벨마다 나올 확률. 낮은 레벨부터. */
export function levelChances(
  ability: EchoAbility,
  grade: number,
  booster: EchoBooster,
): { level: number; chance: number }[] {
  const { low, high } = levelRange(ability, grade, booster);
  const weights = LEVEL_WEIGHTS[String(ability.maxLevel)] ?? [];
  const rows = [];
  for (let level = low; level <= high; level += 1)
    rows.push({ level, weight: weights[level - 1] ?? 0 });
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  // 가중치가 모두 0 인 표는 없지만, 있다면 고르게 본다.
  return rows.map((row) => ({
    level: row.level,
    chance: total > 0 ? row.weight / total : 1 / rows.length,
  }));
}

/** 목표 능력이 목표 레벨 이상으로 나올 확률. */
export function targetChance(
  stone: EchoStone,
  grade: number,
  booster: EchoBooster,
  target: EchoTarget,
): number {
  const ability = ECHO_ABILITIES[target.ability];
  if (!ability) return 0;
  const levels = levelChances(ability, grade, booster).filter(
    (row) => row.level >= target.minLevel,
  );
  return (
    abilityChance(stone, grade, target.ability) * levels.reduce((sum, row) => sum + row.chance, 0)
  );
}

function pick<T>(items: readonly T[], weightOf: (item: T) => number, random: RandomSource): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

/** 한 번 각성한다. */
export function awaken(
  stone: EchoStone,
  grade: number,
  booster: EchoBooster,
  random: RandomSource = Math.random,
): EchoResult {
  const { ability } = pick(abilityPool(stone, grade), (entry) => entry.weight, random);
  const { level } = pick(
    levelChances(ECHO_ABILITIES[ability], grade, booster),
    (row) => row.chance,
    random,
  );
  return { ability, level };
}

export const meetsTarget = (result: EchoResult, target: EchoTarget) =>
  result.ability === target.ability && result.level >= target.minLevel;

/** 목표가 나올 때까지(limit 번까지) 각성한다. 목표가 없으면 한 번. */
export function awakenUntil(
  stone: EchoStone,
  grade: number,
  booster: EchoBooster,
  target: EchoTarget | null,
  limit: number,
  random: RandomSource = Math.random,
): { result: EchoResult; tries: number; hit: boolean } {
  const times = target ? Math.max(1, limit) : 1;
  let result = awaken(stone, grade, booster, random);
  for (let tries = 1; ; tries += 1) {
    if (!target || meetsTarget(result, target)) return { result, tries, hit: true };
    if (tries >= times) return { result, tries, hit: false };
    result = awaken(stone, grade, booster, random);
  }
}

/** 그 레벨의 수치. 수치가 없는 능력은 null. */
export function abilityValue(ability: EchoAbility, level: number): number | null {
  if (!ability.value) return null;
  return Math.round((ability.value.min + ability.value.gap * (level - 1)) * 1e4) / 1e4;
}

/** "컴뱃 마스터리 최소 대미지 19레벨 (9.5)" 의 뒤쪽. */
export function abilityValueText(ability: EchoAbility, level: number): string {
  const value = abilityValue(ability, level);
  return value === null
    ? ''
    : `${value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}${ability.value!.unit}`;
}

/** 최대 레벨의 90% 이상. 오검 워드와 같은 기준으로 금빛으로 칠한다. */
export const HIGH_LEVEL_RATIO = 0.9;
export const isHighLevel = (result: EchoResult) =>
  result.level / Math.max(1, ECHO_ABILITIES[result.ability].maxLevel) >= HIGH_LEVEL_RATIO;
