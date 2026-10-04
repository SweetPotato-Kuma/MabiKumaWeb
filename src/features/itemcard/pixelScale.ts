/**
 * 그림을 몇 배로 그릴지.
 *
 * 마비노기 아이콘은 인벤토리 칸(24px) 단위로 그려진 픽셀 그림이다. 48x48 이 가장 많고
 * 48x96 처럼 긴 것도 많다(2026-09, 1만 5천 장 기준 48x48 이 38%). 칸에 맞춰 0.58배 같은
 * 어중간한 비율로 줄이면 픽셀이 뭉개져 번지고 길쭉해 보인다. 그래서 딱 떨어지는 배율만 쓴다.
 *
 * - 칸에 들어가면 늘리지도 줄이지도 않는다(1배)
 * - 안 들어가면 정확히 절반(0.5배). 48x96 이 24x48 로 깨끗하게 줄어든다
 * - 절반으로도 안 들어가는 드문 것(24x120 같은)만 칸에 맞춰 줄인다
 *
 * 작은 그림을 칸만큼 키우지는 않는다. 키우면 흐려진다.
 */
export function pixelScale(width: number, height: number, box: number): number {
  if (width <= 0 || height <= 0) return 1;
  if (width <= box && height <= box) return 1;
  if (width / 2 <= box && height / 2 <= box) return 0.5;
  return Math.min(box / width, box / height);
}
