import type { EnchantDef } from './types';

/**
 * 인챈트 랭크 표기. 데이터의 레벨 1~6 이 F~A 랭크, 7~15 가 9~1 랭크다.
 * 게임 안에서 "6 랭크 거침없는" 처럼 부르는 그 랭크다.
 */
const LETTER_RANKS = ['F', 'E', 'D', 'C', 'B', 'A'];

export function enchantRank(level: number): string {
  if (level >= 1 && level <= 6) return LETTER_RANKS[level - 1];
  if (level >= 7 && level <= 15) return String(16 - level);
  return '?';
}

/** 높은 랭크가 먼저. 같은 랭크 안에서는 이름순. */
export function compareEnchants(a: EnchantDef, b: EnchantDef): number {
  return b.level - a.level || a.name.localeCompare(b.name, 'ko');
}

/**
 * 설명 문장 가운데 효과가 아닌 줄. 목록에서 효과를 한눈에 보도록 앞뒤로 뺀다.
 * "양손 무기에 인챈트 가능" 같은 적용 조건과 대괄호로 싸인 부가 규칙이다.
 */
export function isEnchantNote(line: string): boolean {
  return /인챈트 가능$/.test(line) || /^\[.*\]$/.test(line);
}

/** 대괄호를 벗긴다. "[수리비 200% 증가]" → "수리비 200% 증가" */
export function stripBrackets(line: string): string {
  return line.replace(/^\[(.*)\]$/, '$1');
}

/** 목록 한 줄에 들어갈 효과. 적용 조건("양손 무기에 인챈트 가능")과 부가 규칙은 뺀다. */
export function effectSummary(enchant: EnchantDef): string {
  return enchant.desc.filter((line) => !isEnchantNote(line)).join(', ');
}
