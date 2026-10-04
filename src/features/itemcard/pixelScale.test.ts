import { describe, expect, it } from 'vitest';
import { pixelScale } from './pixelScale';

describe('pixelScale', () => {
  it('칸에 들어가면 원래 크기 그대로 둔다', () => {
    expect(pixelScale(48, 48, 48)).toBe(1);
    expect(pixelScale(24, 24, 48)).toBe(1);
    expect(pixelScale(48, 24, 48)).toBe(1);
  });

  it('작은 그림을 칸만큼 키우지 않는다', () => {
    // 키우면 픽셀이 번져 흐려진다. 늘어나 보인다는 말이 여기서 나왔다.
    expect(pixelScale(24, 24, 96)).toBe(1);
  });

  it('칸보다 크면 정확히 절반으로 줄인다', () => {
    // 48x96 이 24x48 로 깨끗하게 줄어든다. 0.58 같은 어중간한 비율이면 뭉개진다.
    expect(pixelScale(48, 96, 48)).toBe(0.5);
    expect(pixelScale(48, 72, 48)).toBe(0.5);
    expect(pixelScale(72, 48, 48)).toBe(0.5);
  });

  it('절반으로도 안 들어가는 드문 것만 칸에 맞춘다', () => {
    const scale = pixelScale(24, 120, 48);

    expect(120 * scale).toBe(48);
    expect(scale).toBeLessThan(0.5);
  });

  it('크기를 모르면 건드리지 않는다', () => {
    expect(pixelScale(0, 0, 48)).toBe(1);
  });
});
