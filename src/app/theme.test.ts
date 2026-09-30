import { describe, expect, it } from 'vitest';
import { KIND_BADGE_COLORS } from '@/app/theme';

/** WCAG 상대 휘도와 대비. 글자와 배경의 대비가 4.5:1 이상인지 본다. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('분류 배지 색', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const kind of ['party', 'buy', 'sell'] as const) {
      it(`${mode} 모드의 ${kind} 배지는 글자와 배경 대비가 4.5:1 이상이다`, () => {
        const { text, background } = KIND_BADGE_COLORS[mode][kind];

        expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('세 분류의 색이 서로 다르다', () => {
    for (const mode of ['light', 'dark'] as const) {
      const colors = Object.values(KIND_BADGE_COLORS[mode]).map((each) => each.text);
      expect(new Set(colors).size).toBe(3);
    }
  });
});
