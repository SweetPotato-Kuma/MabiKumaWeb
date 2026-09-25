import type { ErgGrade, ErgGradeDef, ErgSet } from './types';

/**
 * 에르그. 무기에 붙이는 성장 효과로, 등급(B, A, S)마다 레벨 50까지 있다. 어둠의 에르그는 S 등급 50레벨을
 * 채운 무기에 한 번 더 붙이는 것이라 S 등급 효과를 전부 가진 채로 제 효과가 더해진다.
 *
 * 효과는 문장 틀("무기 공격력 {0} 증가")과 레벨별 값으로 온다. 값을 앞에서부터 채우므로 낮은 레벨은
 * 첫 효과(기본 효과)만 나오고, 레벨이 오르면 추가 효과가 차례로 열린다.
 */

export interface ErgPick {
  grade: ErgGrade | null;
  /** 고른 등급의 레벨. 어둠의 에르그면 어둠의 에르그 레벨이다(S 는 늘 50). */
  level: number;
}

export const ERG_GRADES: ErgGrade[] = ['B', 'A', 'S', 'D'];

export const ERG_GRADE_LABEL: Record<ErgGrade, string> = {
  B: 'B 등급',
  A: 'A 등급',
  S: 'S 등급',
  D: '어둠의 에르그',
};

/** 이 장비에서 고를 수 있는 등급. 어둠의 에르그는 S 등급이 있어야 한다. */
export function availableGrades(set: ErgSet | null | undefined): ErgGrade[] {
  if (!set) return [];
  return ERG_GRADES.filter((grade) => set[grade] && (grade !== 'D' || set.S));
}

export function maxErgLevel(set: ErgSet | null | undefined, grade: ErgGrade): number {
  return set?.[grade]?.levels.length ?? 0;
}

export interface ErgEffect {
  /** 채운 문장 */
  text: string;
  /** 문장 틀. 능력치로 더할지 가를 때 쓴다 */
  template: string;
  args: number[];
}

const PLACEHOLDER = /\{(\d+)\}/g;

const formatValue = (value: number) => String(Math.round(value * 100) / 100);

/**
 * 한 등급, 한 레벨의 효과. 비어 있는 틀은 건너뛰고, 값이 모자라면 거기서 멈춘다(아직 안 열린 효과).
 */
export function fillErg(def: ErgGradeDef | undefined, level: number): ErgEffect[] {
  const values = def?.levels[level - 1];
  if (!def || !values) return [];
  const out: ErgEffect[] = [];
  let used = 0;
  for (const template of def.effects) {
    if (!template) continue;
    const count = [...template.matchAll(PLACEHOLDER)].length;
    if (used + count > values.length) break;
    const args = values.slice(used, used + count);
    out.push({
      template,
      args,
      text: template.replace(PLACEHOLDER, (_, index: string) =>
        formatValue(args[Number(index)] ?? 0),
      ),
    });
    used += count;
  }
  return out;
}

/**
 * 효과마다 처음 열리는 레벨. 비어 있는 틀은 빠진다. 아직 안 연 효과를 "21레벨부터" 로 알려 줄 때 쓴다.
 */
export function unlockLevels(def: ErgGradeDef | undefined): { template: string; level: number }[] {
  if (!def) return [];
  const templates = def.effects.filter(Boolean);
  return templates.map((template, index) => {
    const level = def.levels.findIndex((_, at) => fillErg(def, at + 1).length > index);
    return { template, level: level < 0 ? 0 : level + 1 };
  });
}

export interface ErgSummary {
  grade: ErgGrade;
  /** S, A, B 의 효과. 어둠의 에르그면 S 등급 50레벨 효과다 */
  base: ErgEffect[];
  /** 어둠의 에르그 효과. 어둠의 에르그가 아니면 비어 있다 */
  dark: ErgEffect[];
  /** "S 등급 (50/50 레벨)" 처럼 화면에 적을 등급과 레벨 */
  label: string;
}

export function ergSummary(set: ErgSet | null | undefined, pick: ErgPick): ErgSummary | null {
  const { grade, level } = pick;
  if (!set || !grade || level < 1 || !availableGrades(set).includes(grade)) return null;
  const max = maxErgLevel(set, grade);
  if (grade === 'D') {
    const sMax = maxErgLevel(set, 'S');
    return {
      grade,
      base: fillErg(set.S, sMax),
      dark: fillErg(set.D, level),
      label: `S 등급 ${sMax}레벨, 어둠의 에르그 (${level}/${max} 레벨)`,
    };
  }
  return {
    grade,
    base: fillErg(set[grade], level),
    dark: [],
    label: `${ERG_GRADE_LABEL[grade]} (${level}/${max} 레벨)`,
  };
}

/**
 * 능력치 표에 더할 효과. 문장이 곧 무기 능력치인 것만 더하고, 스킬 대미지나 쿨타임 같은 효과는 글로만
 * 둔다. "무기 공격력" 은 최소와 최대 공격력에 모두 더한다. 자동 방어 확률은 데이터가 비율(0.15)로
 * 들어 있는 칸이라 100 으로 나눠 더한다.
 */
const STAT_RULES: [pattern: RegExp, stats: string[], scale?: number][] = [
  [/^무기 공격력 \{0\} 증가$/, ['attack_min', 'attack_max']],
  [/^무기 마법 공격력 \{0\} 증가$/, ['magic_damage']],
  [/^4대 속성 연금술 대미지 \{0\} 증가$/, ['alchemy_all']],
  [
    /^방어, 보호, 마법방어, 마법보호 \{0\} 증가$/,
    ['defense', 'protect', 'magic_defense', 'magic_protect'],
  ],
  [
    /^근접공격, 원거리공격, 마법공격 자동방어 확률 \{0\}% 증가$/,
    ['immune_melee', 'immune_ranged', 'immune_magic'],
    0.01,
  ],
];

export function ergStats(summary: ErgSummary | null): [stat: string, value: number][] {
  if (!summary) return [];
  const out: [string, number][] = [];
  for (const effect of [...summary.base, ...summary.dark]) {
    const rule = STAT_RULES.find(([pattern]) => pattern.test(effect.template));
    if (!rule) continue;
    const [, stats, scale = 1] = rule;
    for (const stat of stats) out.push([stat, (effect.args[0] ?? 0) * scale]);
  }
  return out;
}

/** 이 효과가 능력치 표에 더해지는지. 에르그 칸에서 더해진 효과와 글로만 있는 효과를 가를 때 쓴다. */
export function isErgStatEffect(template: string): boolean {
  return STAT_RULES.some(([pattern]) => pattern.test(template));
}
