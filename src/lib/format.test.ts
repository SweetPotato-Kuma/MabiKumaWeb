import { describe, expect, it } from 'vitest';
import { formatGold, formatNumber, formatRemaining } from './format';

describe('formatNumber', () => {
  it('천 단위로 구분한다', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('값이 없으면 하이픈을 돌려준다', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
  });
});

describe('formatGold', () => {
  it('골드 단위를 붙인다', () => {
    expect(formatGold(52000)).toBe('52,000 G');
  });
});

describe('formatRemaining', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');

  it('하루 이상 남으면 일/시간으로 표시한다', () => {
    expect(formatRemaining('2026-01-03T03:00:00Z', now)).toBe('2일 3시간');
  });

  it('한 시간 미만이면 분으로 표시한다', () => {
    expect(formatRemaining('2026-01-01T00:45:00Z', now)).toBe('45분');
  });

  it('이미 지난 시각은 만료로 표시한다', () => {
    expect(formatRemaining('2025-12-31T23:00:00Z', now)).toBe('만료');
  });
});
