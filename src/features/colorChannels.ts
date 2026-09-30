import type { Rgb } from '@/features/bags/color';

/**
 * 색의 R, G, B 를 채널마다 거는 조건. 경매장 상세 검색과 튼튼한 주머니 찾기가 함께 쓴다.
 */

/**
 * 색 채널(R, G, B) 하나의 조건. 두 방식 가운데 하나를 쓴다.
 * - 범위: min 이상 max 이하. 한쪽이 비면 그쪽은 끝이 없다(0 또는 255).
 * - 유사도(similar): 기준값 base 에서 위아래로 percent% 이내. 퍼센트는 채널 전체 폭(255)에 대한 것이라
 *   기준 120, 10% 면 120 ± 25.5 이다.
 */
export interface ColorChannel {
  similar: boolean;
  min: number | null;
  max: number | null;
  base: number | null;
  percent: number;
}

export const COLOR_CHANNEL_MAX = 255;
/** 유사도를 처음 켰을 때의 오차. */
export const DEFAULT_COLOR_PERCENT = 10;
export const COLOR_CHANNEL_KEYS = ['r', 'g', 'b'] as const;
export type ColorChannelKey = (typeof COLOR_CHANNEL_KEYS)[number];

export const emptyColorChannel = (): ColorChannel => ({
  similar: false,
  min: null,
  max: null,
  base: null,
  percent: DEFAULT_COLOR_PERCENT,
});

/** 채널이 받아들이는 값의 범위. 아무것도 걸지 않았으면 null. */
export function colorChannelBounds(channel: ColorChannel): { low: number; high: number } | null {
  if (channel.similar) {
    if (channel.base === null) return null;
    const tolerance = (channel.percent / 100) * COLOR_CHANNEL_MAX;
    return {
      low: Math.max(0, channel.base - tolerance),
      high: Math.min(COLOR_CHANNEL_MAX, channel.base + tolerance),
    };
  }
  if (channel.min === null && channel.max === null) return null;
  return { low: channel.min ?? 0, high: channel.max ?? COLOR_CHANNEL_MAX };
}

/** 채널 셋을 묶은 것. 색 조건과 주머니 파트가 같은 모양을 쓴다. */
export type ColorChannels = Record<ColorChannelKey, ColorChannel>;

export const emptyColorChannels = (): ColorChannels => ({
  r: emptyColorChannel(),
  g: emptyColorChannel(),
  b: emptyColorChannel(),
});

/** 건 채널이 하나라도 있는지. 없으면 조건이 아니다. */
export const hasColorChannels = (channels: ColorChannels): boolean =>
  COLOR_CHANNEL_KEYS.some((key) => colorChannelBounds(channels[key]) !== null);

/** 색이 건 채널을 모두 만족하는지. 건 채널이 없으면 무엇이든 맞다. */
export function channelsMatch(channels: ColorChannels, rgb: Rgb): boolean {
  return COLOR_CHANNEL_KEYS.every((key) => {
    const bounds = colorChannelBounds(channels[key]);
    // 반올림 오차로 경계에서 빗나가지 않게 아주 조금 넉넉히 둔다.
    return bounds === null || (rgb[key] >= bounds.low - 1e-9 && rgb[key] <= bounds.high + 1e-9);
  });
}

const formatBound = (value: number) => String(Math.round(value * 10) / 10);

/** "R 100~200", "R 120 ±10%". 걸지 않은 채널은 빈 문자열. */
export function describeColorChannel(key: ColorChannelKey, channel: ColorChannel): string {
  const name = key.toUpperCase();
  if (colorChannelBounds(channel) === null) return '';
  if (channel.similar) return `${name} ${channel.base} ±${channel.percent}%`;
  if (channel.min !== null && channel.max !== null) return `${name} ${channel.min}~${channel.max}`;
  return channel.min !== null ? `${name} ${channel.min} 이상` : `${name} ${channel.max} 이하`;
}

/** 유사도로 받아들이는 범위를 숫자로. 사용자가 오차가 어떻게 계산되는지 그대로 볼 수 있게 한다. */
export function describeColorRange(channel: ColorChannel): string {
  const bounds = colorChannelBounds(channel);
  return bounds ? `${formatBound(bounds.low)}~${formatBound(bounds.high)}` : '';
}
