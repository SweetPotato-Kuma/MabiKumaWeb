import data from './data.json';

/**
 * 오검 워드 옵션 시뮬레이터.
 *
 * 오검 워드 하나에는 옵션이 세 줄 붙는다. 재설정하면 잠그지 않은 줄마다 옵션 목록에서 하나를 고르게
 * 고르고, 그 옵션의 1~최대 레벨 가운데 하나를 고르게 정한다. 한 워드 안에서 같은 옵션은 두 번 붙지 않는다.
 * 아르카나 스킬 옵션은 그 옵션이 붙는 워드(베헤, 리스, 페른, 살, 닌)에서만 나오고, 이 워드들에서는
 * 다른 아르카나의 스킬 옵션도 함께 나온다. 옵션마다 가중치는 같게 본다.
 *
 * 워드 다섯 칸 가운데 아르카나마다 정해진 세 워드가 모두 들어 있으면 그 조합의 스킬 효과가 발동한다.
 */

export interface OghamArcana {
  id: number;
  name: string;
  mainTalent: string;
  subTalent: string;
}

export interface OghamWord {
  id: number;
  name: string;
  /** 아르카나 스킬 옵션이 붙을 수 있는지. */
  arcanaOptions: boolean;
}

export interface OghamOption {
  id: number;
  name: string;
  /** 최대 레벨일 때의 수치. 레벨에 비례한다. */
  value: number;
  maxLevel: number;
  /** 아르카나 스킬 옵션이면 그 아르카나. */
  arcana: number | null;
  /** 재능 스킬 옵션이면 그 재능 이름. */
  talent: string | null;
  /** 능력치 옵션이면 그 능력치 이름. */
  stat: string | null;
}

export interface OghamCombination {
  id: number;
  arcana: number;
  /** 효과가 붙는 스킬. */
  skill: string | null;
  /** 그 스킬의 게임 번호. 스킬 그림(public/data/skills)을 찾는다. */
  skillId: number;
  /** 조합 이름. "뇌신" */
  name: string;
  /** 필요한 워드 셋. */
  words: number[];
  /** 점수(5~9)마다 효과 글. */
  effects: Record<string, string>;
}

export interface RerollCost {
  /** 잠근 줄 수. */
  locked: number;
  gold: number;
  materials: { name: string; count: number }[];
}

export const OGHAM_ARCANAS: readonly OghamArcana[] = data.arcanas;
export const OGHAM_WORDS: readonly OghamWord[] = data.words;
export const OGHAM_OPTIONS: readonly OghamOption[] = data.options;
export const OGHAM_COMBINATIONS: readonly OghamCombination[] = data.combinations;
export const REROLL_COSTS: readonly RerollCost[] = data.rerollCosts;

/** 워드 칸 수와 워드 한 개의 옵션 줄 수. */
export const SLOT_COUNT = 5;
export const LINE_COUNT = 3;
/** 조합 효과의 점수. */
export const COMBINATION_POINTS = [5, 6, 7, 8, 9] as const;

const optionById = new Map(OGHAM_OPTIONS.map((option) => [option.id, option]));
const wordById = new Map(OGHAM_WORDS.map((word) => [word.id, word]));

/** 워드 그림. 번호는 게임의 워드 번호와 같다. 64px 투명 바탕 그림이다. */
export const oghamWordIconUrl = (id: number) => `${import.meta.env.BASE_URL}data/ogham/${id}.png`;

export const oghamOption = (id: number): OghamOption => optionById.get(id)!;
export const oghamWord = (id: number): OghamWord => wordById.get(id)!;
export const oghamArcana = (id: number): OghamArcana =>
  OGHAM_ARCANAS.find((arcana) => arcana.id === id) ?? OGHAM_ARCANAS[0];

/**
 * 재능에 묶이지 않은 능력치 옵션 가운데 그 아르카나가 쓰는 것. 마법 공격력, 속성 연금술 대미지,
 * 마리오네트 최대 대미지처럼 무기 쪽 능력치라 아르카나를 보고 가른다.
 */
const ARCANA_STATS: Record<string, readonly string[]> = {
  '다크 메이지': ['마법 공격력'],
  '세인트 바드': ['마법 공격력'],
  '포비든 알케미스트': [
    '불 속성 연금술 대미지',
    '물 속성 연금술 대미지',
    '바람 속성 연금술 대미지',
    '흙 속성 연금술 대미지',
  ],
  '멜로딕 퍼피티어': ['마리오네트 최대 대미지'],
};

/** 그 아르카나에게 그 옵션이 어떤 옵션인지. 쓰지 않는 옵션이면 null. */
export type OptionRelevance = 'arcana' | 'main' | 'sub' | 'stat';

export const RELEVANCE_LABEL: Record<OptionRelevance, string> = {
  arcana: '아르카나',
  main: '메인 재능',
  sub: '서브 재능',
  stat: '능력치',
};

const RELEVANCE_ORDER: readonly OptionRelevance[] = ['arcana', 'main', 'sub', 'stat'];

export function relevanceOf(option: OghamOption, arcana: OghamArcana): OptionRelevance | null {
  if (option.arcana !== null) return option.arcana === arcana.id ? 'arcana' : null;
  if (option.talent === arcana.mainTalent) return 'main';
  if (option.talent === arcana.subTalent) return 'sub';
  if (option.stat && ARCANA_STATS[arcana.name]?.includes(option.stat)) return 'stat';
  return null;
}

/** 줄 세울 때의 순서. 아르카나, 메인 재능, 서브 재능, 능력치, 그 밖. */
export function relevanceRank(option: OghamOption, arcana: OghamArcana): number {
  const relevance = relevanceOf(option, arcana);
  return relevance === null ? RELEVANCE_ORDER.length : RELEVANCE_ORDER.indexOf(relevance);
}

/** 그 워드에 붙을 수 있는 옵션 전부. */
export function optionPool(word: OghamWord): readonly OghamOption[] {
  return word.arcanaOptions
    ? OGHAM_OPTIONS
    : OGHAM_OPTIONS.filter((option) => option.arcana === null);
}

/** 그 레벨의 수치. 소수 넷째 자리에서 자른다. */
export function optionValue(option: OghamOption, level: number): number {
  return Number(((option.value / Math.max(1, option.maxLevel)) * level).toFixed(4));
}

/** 배율 옵션은 %, 나머지는 단위가 없다. */
export const optionUnit = (option: OghamOption) => (option.name.includes('배율') ? '%' : '');

/** 옵션 한 줄. */
export interface OghamLine {
  option: number;
  level: number;
  locked: boolean;
}

/** 워드 한 칸. 옵션 줄은 재설정하기 전에는 null 이다. */
export interface OghamSlot {
  word: number;
  lines: (OghamLine | null)[];
}

export const emptyLines = (): (OghamLine | null)[] =>
  Array.from({ length: LINE_COUNT }, () => null);

export const lockedCount = (lines: readonly (OghamLine | null)[]) =>
  lines.filter((line) => line?.locked).length;

/** 잠근 줄 수에 맞는 한 번 비용. 셋 다 잠그면 재설정할 수 없어 null. */
export function rerollCost(locked: number): RerollCost | null {
  if (locked >= LINE_COUNT) return null;
  return (
    REROLL_COSTS.find((cost) => cost.locked === locked) ?? REROLL_COSTS[REROLL_COSTS.length - 1]
  );
}

/** [0, 1) 난수. 테스트에서 바꿔 끼운다. */
export type RandomSource = () => number;

const pick = (length: number, random: RandomSource) =>
  Math.min(length - 1, Math.floor(random() * length));

/** 잠그지 않은 줄을 한 번 재설정한다. */
export function reroll(
  lines: readonly (OghamLine | null)[],
  pool: readonly OghamOption[],
  random: RandomSource = Math.random,
): (OghamLine | null)[] {
  const taken = new Set(lines.filter((line) => line?.locked).map((line) => line!.option));
  return lines.map((line) => {
    if (line?.locked) return line;
    const candidates = pool.filter((option) => !taken.has(option.id));
    if (candidates.length === 0) return null;
    const option = candidates[pick(candidates.length, random)];
    taken.add(option.id);
    return { option: option.id, level: 1 + pick(option.maxLevel, random), locked: false };
  });
}

/** 목표 한 줄. 이 옵션이 이 레벨 이상으로 붙기를 바란다. */
export interface OghamTarget {
  option: number;
  minLevel: number;
}

/** 목표는 세 개까지다. 워드 한 개의 옵션이 세 줄이다. */
export const MAX_TARGETS = LINE_COUNT;

/** 그 줄이 그 목표를 채우는지. */
export const lineMeets = (line: OghamLine | null, target: OghamTarget) =>
  line !== null && line.option === target.option && line.level >= target.minLevel;

/** 세 줄이 목표를 모두 채우는지. 목표가 없으면 false 다. */
export function meetsTargets(
  lines: readonly (OghamLine | null)[],
  targets: readonly OghamTarget[],
): boolean {
  if (targets.length === 0) return false;
  return targets.every((target) => lines.some((line) => lineMeets(line, target)));
}

/**
 * 한 번 재설정해 목표를 모두 채울 확률.
 *
 * 잠근 줄이 이미 채운 목표는 빼고 남은 목표 t 개를 센다. 잠그지 않은 k 줄은 잠근 옵션을 뺀 M 개에서
 * 겹치지 않게 뽑히고 어느 조합이든 확률이 같으므로, 정한 t 개가 모두 뽑힐 확률은
 * k/M x (k-1)/(M-1) x ... (t 개) 이다. 레벨은 옵션마다 따로 정해지니 곱한다. 잠근 줄에 목표 옵션이
 * 모자란 레벨로 묶여 있거나, 이 워드에 붙지 않는 옵션이 있거나, 남은 목표가 열린 줄보다 많으면 0.
 */
export function targetChance(
  lines: readonly (OghamLine | null)[],
  pool: readonly OghamOption[],
  targets: readonly OghamTarget[],
): number {
  if (targets.length === 0) return 0;
  const locked = lines.filter((line): line is OghamLine => line !== null && line.locked);
  const open = LINE_COUNT - locked.length;
  const remaining =
    pool.length - locked.filter((line) => pool.some((each) => each.id === line.option)).length;
  let chance = 1;
  let needed = 0;
  for (const target of targets) {
    const held = locked.find((line) => line.option === target.option);
    if (held) {
      if (held.level < target.minLevel) return 0;
      continue;
    }
    const option = pool.find((each) => each.id === target.option);
    if (!option) return 0;
    const minLevel = Math.min(Math.max(target.minLevel, 1), option.maxLevel);
    chance *= (option.maxLevel - minLevel + 1) / option.maxLevel;
    needed += 1;
  }
  if (needed > open || needed > remaining) return 0;
  for (let index = 0; index < needed; index += 1) chance *= (open - index) / (remaining - index);
  return chance;
}

export interface RerollRun {
  lines: (OghamLine | null)[];
  /** 재설정한 횟수. */
  tries: number;
  /** 목표를 모두 채웠는지. 목표 없이 돌리면 true. */
  hit: boolean;
}

/** 목표를 모두 채울 때까지(또는 limit 번까지) 재설정한다. 목표가 없으면 한 번만. */
export function rerollUntil(
  lines: readonly (OghamLine | null)[],
  pool: readonly OghamOption[],
  targets: readonly OghamTarget[],
  limit: number,
  random: RandomSource = Math.random,
): RerollRun {
  let current = [...lines];
  const times = targets.length > 0 ? limit : 1;
  for (let tries = 1; tries <= times; tries += 1) {
    current = reroll(current, pool, random);
    if (targets.length === 0 || meetsTargets(current, targets))
      return { lines: current, tries, hit: true };
  }
  return { lines: current, tries: times, hit: false };
}

/** 넣어 둔 워드로 발동하는 그 아르카나의 조합. 셋이 모두 들어 있어야 한다. */
export function activeCombinations(arcana: number, slots: readonly (OghamSlot | null)[]) {
  const placed = new Set(slots.filter(Boolean).map((slot) => slot!.word));
  return OGHAM_COMBINATIONS.filter(
    (combination) =>
      combination.arcana === arcana && combination.words.every((word) => placed.has(word)),
  );
}

export const combinationsOf = (arcana: number) =>
  OGHAM_COMBINATIONS.filter((combination) => combination.arcana === arcana);

/**
 * 조합 워드를 빈 칸에 차례로 넣는다. 이미 들어 있는 워드는 건너뛴다. 빈 칸이 모자라면 들어가는 만큼만.
 */
export function placeCombination(
  slots: readonly (OghamSlot | null)[],
  combination: OghamCombination,
): (OghamSlot | null)[] {
  const next = [...slots];
  const placed = new Set(slots.filter(Boolean).map((slot) => slot!.word));
  const missing = combination.words.filter((word) => !placed.has(word));
  for (const word of missing) {
    const empty = next.findIndex((slot) => slot === null);
    if (empty < 0) break;
    next[empty] = { word, lines: emptyLines() };
  }
  return next;
}

/** 다섯 칸 옵션 합계 한 줄. */
export interface OptionTotal {
  option: OghamOption;
  levelSum: number;
  valueSum: number;
}

/** 칸마다 붙은 옵션을 옵션별로 더한다. 그 아르카나에게 쓸모 있는 것부터, 같은 무리는 수치가 큰 것부터. */
export function optionTotals(
  slots: readonly (OghamSlot | null)[],
  arcana: OghamArcana,
): OptionTotal[] {
  const totals = new Map<number, OptionTotal>();
  for (const slot of slots) {
    for (const line of slot?.lines ?? []) {
      if (!line) continue;
      const option = oghamOption(line.option);
      const total = totals.get(option.id) ?? { option, levelSum: 0, valueSum: 0 };
      total.levelSum += line.level;
      total.valueSum = Number((total.valueSum + optionValue(option, line.level)).toFixed(4));
      totals.set(option.id, total);
    }
  }
  return [...totals.values()].sort(
    (a, b) =>
      relevanceRank(a.option, arcana) - relevanceRank(b.option, arcana) || b.valueSum - a.valueSum,
  );
}

/** 지금까지 쓴 것. */
export interface OghamSpent {
  count: number;
  gold: number;
  materials: Record<string, number>;
}

export const NO_SPENT: OghamSpent = { count: 0, gold: 0, materials: {} };

/** 잠근 줄이 locked 개인 채로 times 번 재설정한 비용을 더한다. */
export function addSpent(spent: OghamSpent, locked: number, times: number): OghamSpent {
  const cost = rerollCost(locked);
  if (!cost || times <= 0) return spent;
  const materials = { ...spent.materials };
  for (const material of cost.materials)
    materials[material.name] = (materials[material.name] ?? 0) + material.count * times;
  return { count: spent.count + times, gold: spent.gold + cost.gold * times, materials };
}

/** 재설정 재료 이름 전부. 처음 나온 차례대로. */
export const REROLL_MATERIALS: readonly string[] = [
  ...new Set(REROLL_COSTS.flatMap((cost) => cost.materials.map((material) => material.name))),
];
