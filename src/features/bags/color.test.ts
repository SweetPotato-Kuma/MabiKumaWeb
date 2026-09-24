import { describe, expect, it } from 'vitest';
import { colorDistance, hexToRgb, similarity } from './color';

describe('hexToRgb', () => {
  it('# 이 있든 없든 읽는다', () => {
    expect(hexToRgb('bb94c7')).toEqual({ r: 187, g: 148, b: 199 });
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('형식이 틀리면 null', () => {
    expect(hexToRgb('fff')).toBeNull();
    expect(hexToRgb('zzzzzz')).toBeNull();
  });
});

describe('similarity', () => {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };

  it('같은 색은 100, 검정과 흰색은 0', () => {
    expect(similarity(white, white)).toBe(100);
    expect(similarity(white, black)).toBe(0);
  });

  it('흰색에는 연한 회색이 진한 회색보다 가깝다', () => {
    const light = { r: 240, g: 240, b: 240 };
    const dark = { r: 120, g: 120, b: 120 };
    expect(similarity(white, light)).toBeGreaterThan(similarity(white, dark));
  });

  it('거리는 순서를 바꿔도 같다', () => {
    const a = { r: 187, g: 148, b: 199 };
    const b = { r: 107, g: 58, b: 68 };
    expect(colorDistance(a, b)).toBeCloseTo(colorDistance(b, a));
  });
});
