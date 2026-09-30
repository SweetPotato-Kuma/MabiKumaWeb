import { normalizeForSearch } from './dictionary';
import { splitTerms } from './nameIndex';

/**
 * 검색어가 이름에 얼마나 바로 들어맞는지. 작을수록 가깝다.
 * - 0 정확히 일치: 띄어쓰기를 빼고 이름 전체가 검색어다.
 * - 1 앞부분 일치: 이름이 검색어로 시작한다.
 * - 2 부분 일치: 이름 가운데에 검색어가 그대로 들어 있다.
 * - 3 단어만 일치: 검색어의 단어들이 이름 여기저기에 흩어져 있다.
 *   "소울리버레이트 보우" 는 단어가 둘이라 "소울 리버레이트 크로스보우" 도 걸리는데, 이것이 3 이다.
 */
export type MatchTier = 0 | 1 | 2 | 3;

/** 이 등급 이상은 사용자가 찾던 이름이 아니라 걸려 나온 것이다. */
export const PARTIAL_TIER: MatchTier = 2;

/**
 * 이름 하나의 등급. 검색어가 비었으면 견줄 것이 없어 0 이다.
 * 검색어는 여러 단어(쉼표나 띄어쓰기)일 수 있고, 붙여서 한 이름으로 본 것(phrase)과 견준다.
 */
export function matchTier(name: string, keyword: string): MatchTier {
  const phrase = splitTerms(keyword).join('');
  if (!phrase) return 0;
  const normalized = normalizeForSearch(name);
  if (normalized === phrase) return 0;
  if (normalized.startsWith(phrase)) return 1;
  if (normalized.includes(phrase)) return 2;
  return 3;
}
