import { describe, expect, it } from 'vitest';
import { formatGoldWith, formatKoreanReading, formatNumber, formatRemaining } from './format';

describe('formatNumber', () => {
  it('천 단위로 구분한다', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('값이 없으면 하이픈을 돌려준다', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
  });
});

describe('formatKoreanReading', () => {
  it('억, 만 묶음의 천 자리를 천으로 읽는다', () => {
    expect(formatKoreanReading(30_000_456)).toBe('3천만 456');
    expect(formatKoreanReading(31_000_000)).toBe('3천100만');
    expect(formatKoreanReading(1_231_005_000)).toBe('12억 3천100만 5천');
    expect(formatKoreanReading(200_000_000)).toBe('2억');
    expect(formatKoreanReading(4_560_000)).toBe('456만');
  });
});

describe('formatGoldWith', () => {
  const number = { style: 'number', omitSmall: false } as const;
  const korean = { style: 'korean', omitSmall: false } as const;
  const koreanOmit = { style: 'korean', omitSmall: true } as const;

  it('숫자 표기는 자릿수를 다 적고 G 를 붙인다', () => {
    expect(formatGoldWith(52000, number)).toBe('52,000 G');
    expect(formatGoldWith(1_149_000_000, number)).toBe('1,149,000,000 G');
  });

  it('설정을 넘기지 않으면 숫자 표기다', () => {
    expect(formatGoldWith(52000)).toBe('52,000 G');
  });

  it('한글 표기는 억, 만, 나머지로 끊는다', () => {
    expect(formatGoldWith(1_149_001_234, korean)).toBe('11억 4,900만 1,234 G');
    expect(formatGoldWith(178_400_000, korean)).toBe('1억 7,840만 G');
    expect(formatGoldWith(200_000_000, korean)).toBe('2억 G');
    expect(formatGoldWith(80_000_000, korean)).toBe('8,000만 G');
    expect(formatGoldWith(20_000, korean)).toBe('2만 G');
  });

  it('만이 안 되는 값은 어느 표기든 그대로 적는다', () => {
    expect(formatGoldWith(9_500, korean)).toBe('9,500 G');
    expect(formatGoldWith(9_500, koreanOmit)).toBe('9,500 G');
    expect(formatGoldWith(0, korean)).toBe('0 G');
  });

  it('1만 미만 생략은 끝자리를 버린다', () => {
    expect(formatGoldWith(1_149_001_234, koreanOmit)).toBe('11억 4,900만 G');
    expect(formatGoldWith(215_999, koreanOmit)).toBe('21만 G');
  });

  it('생략은 숫자 표기에는 영향이 없다', () => {
    expect(formatGoldWith(1_149_001_234, { style: 'number', omitSmall: true })).toBe('1,149,001,234 G');
  });

  it('단위를 끄면 G 를 뗀다', () => {
    expect(formatGoldWith(1_079_000_000, korean, false)).toBe('10억 7,900만');
    expect(formatGoldWith(52_000, number, false)).toBe('52,000');
  });

  it('음수는 부호를 앞에 붙인다', () => {
    expect(formatGoldWith(-1_234_567, number)).toBe('-1,234,567 G');
    expect(formatGoldWith(-1_234_567, korean)).toBe('-123만 4,567 G');
  });

  it('값이 없으면 하이픈이다', () => {
    expect(formatGoldWith(null, korean)).toBe('-');
    expect(formatGoldWith(undefined, number)).toBe('-');
    expect(formatGoldWith(Number.NaN, number)).toBe('-');
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
