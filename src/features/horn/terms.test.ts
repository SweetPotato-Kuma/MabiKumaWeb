import { describe, expect, it } from 'vitest';
import {
  formatHornTime,
  formatRepeats,
  highlightPattern,
  highlightTerms,
  splitHighlight,
} from './terms';

/** 2026-09-28 22:00 KST. */
const NOW = Date.parse('2026-09-28T13:00:00.000Z');
const seconds = (iso: string) => Date.parse(iso) / 1000;

describe('검색어 칠하기', () => {
  it('띄어쓰기와 쉼표로 나눈 낱말을 긴 것부터 칠한다', () => {
    expect(highlightTerms('탈라,탈라가흐  세바')).toEqual(['탈라가흐', '탈라', '세바']);
    expect(highlightPattern([])).toBeNull();
  });

  it('공백을 사이에 둔 글자도 칠하고 대소문자를 가리지 않는다', () => {
    const pattern = highlightPattern(highlightTerms('탈라가흐 s50'));
    expect(splitHighlight('탈라 가흐 4인 S50', pattern)).toEqual([
      { text: '탈라 가흐', hit: true },
      { text: ' 4인 ', hit: false },
      { text: 'S50', hit: true },
    ]);
  });

  it('정규식 기호도 글자 그대로 찾는다', () => {
    const pattern = highlightPattern(highlightTerms('1.3.7'));
    expect(splitHighlight('각2통 1.3.7.첫', pattern).filter((part) => part.hit)).toEqual([
      { text: '1.3.7', hit: true },
    ]);
    expect(splitHighlight('1x3x7', pattern).some((part) => part.hit)).toBe(false);
  });
});

describe('외친 시각', () => {
  it('오늘이면 시각만, 아니면 날짜를 붙인다', () => {
    expect(formatHornTime(seconds('2026-09-28T12:31:00.000Z'), NOW)).toBe('21:31');
    expect(formatHornTime(seconds('2026-09-27T12:31:00.000Z'), NOW)).toBe('9. 27. 21:31');
  });

  it('여러 번 외친 글은 횟수와 처음 시각을 적는다', () => {
    expect(formatRepeats(1, seconds('2026-09-28T12:31:00.000Z'), NOW)).toBe('');
    expect(formatRepeats(1200, seconds('2026-09-28T12:31:00.000Z'), NOW)).toBe('21:31부터 1,200번 외침');
  });
});
