/**
 * 주머니 색 비교.
 *
 * 같은 주머니라도 서버, 채널, NPC 마다 색이 다르다. 사람들이 찾는 것은 "흰색에 가까운 것"
 * 처럼 원하는 색에 가까운 주머니다. 그래서 거리를 재서 가까운 순으로 늘어놓는다.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_COLOR = /^#?([0-9a-f]{6})$/i;

/** "bb94c7" 이나 "#bb94c7" → { r, g, b }. 형식이 틀리면 null. */
export function hexToRgb(hex: string): Rgb | null {
  const match = HEX_COLOR.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/**
 * 두 색의 거리. 0 이면 같은 색이다.
 *
 * RGB 를 그대로 빼면 사람 눈과 어긋난다(초록 차이는 크게, 파랑 차이는 작게 느낀다).
 * 계산이 가벼우면서 눈에 가깝게 보정한 redmean 식을 쓴다. 결과가 수만 줄이라 가벼워야 한다.
 */
export function colorDistance(a: Rgb, b: Rgb): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

/** 검정과 흰색 사이. 가장 먼 두 색이다. */
const MAX_DISTANCE = colorDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });

/** 비슷한 정도. 100 이면 같은 색, 0 이면 검정과 흰색만큼 다르다. 소수 첫째 자리까지. */
export function similarity(a: Rgb, b: Rgb): number {
  const score = 100 - (colorDistance(a, b) / MAX_DISTANCE) * 100;
  return Math.round(Math.max(0, score) * 10) / 10;
}
