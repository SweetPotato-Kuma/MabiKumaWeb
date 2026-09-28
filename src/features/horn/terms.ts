/**
 * 뿔피리 검색어. 워커(worker/horn.js 의 parseTerms)와 같은 규칙으로 읽는다.
 *
 * 띄어쓰기로 나눈 낱말은 모두 들어 있어야 하고, 쉼표로 이은 낱말은 그중 하나만 있으면 된다.
 * "탈라,탈가 세바" 는 (탈라 또는 탈가) 그리고 세바다. 공백과 대소문자는 가리지 않는다.
 * 여기서는 찾은 글에서 어디가 걸렸는지 칠할 때 쓴다. 거르는 것은 워커가 한다.
 */

/** 검색어에서 칠할 낱말. 묶음과 상관없이 모두 칠한다. */
export function highlightTerms(query: string): string[] {
  const terms = query
    .split(/[\s,]+/)
    .map((term) => term.toLowerCase())
    .filter(Boolean);
  // 긴 것부터 맞춰야 "탈라가흐" 안의 "탈라" 가 먼저 잡혀 나머지가 칠해지지 않는 일이 없다.
  return [...new Set(terms)].sort((a, b) => b.length - a.length);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 낱말을 공백과 상관없이 찾는 정규식. "탈라가흐" 로 "탈라 가흐" 도 칠한다. */
export function highlightPattern(terms: readonly string[]): RegExp | null {
  if (terms.length === 0) return null;
  const parts = terms.map((term) => [...term].map(escapeRegExp).join('\\s*'));
  return new RegExp(`(${parts.join('|')})`, 'gi');
}

export interface TextPart {
  text: string;
  hit: boolean;
}

/** 글을 칠할 곳과 아닌 곳으로 나눈다. */
export function splitHighlight(text: string, pattern: RegExp | null): TextPart[] {
  if (!pattern) return [{ text, hit: false }];
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (match[0].length === 0) continue;
    if (index > last) parts.push({ text: text.slice(last, index), hit: false });
    parts.push({ text: match[0], hit: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}

const KST = 'Asia/Seoul';

const dayFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const monthDayFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  month: 'numeric',
  day: 'numeric',
});

/**
 * 외친 시각. 오늘이면 "22:31", 아니면 "9. 27. 22:31". 게임 시각이 한국 시각이라 한국 시각으로 적는다.
 * seconds 는 초 단위 유닉스 시각이다.
 */
export function formatHornTime(seconds: number, now = Date.now()): string {
  const date = new Date(seconds * 1000);
  const time = timeFormatter.format(date);
  if (dayFormatter.format(date) === dayFormatter.format(new Date(now))) return time;
  return `${monthDayFormatter.format(date)} ${time}`;
}

/** 몇 번 외쳤는지와 언제부터인지. 한 번뿐이면 빈 글자. */
export function formatRepeats(times: number, first: number, now = Date.now()): string {
  if (times <= 1) return '';
  return `${times.toLocaleString('ko-KR')}번 · ${formatHornTime(first, now)}부터`;
}
