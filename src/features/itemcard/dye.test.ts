import { describe, expect, it } from 'vitest';
import { dyeColorsOf, dyeKey, paintDye, parseDye, type ItemDye } from './dye';
import { parseIconMap } from './iconMap';

/** width x height 레이어 count 장을 가로로 이은 시트. fill(레이어, x, y) 가 [r, g, b, a] 를 준다. */
function sheet(width: number, height: number, count: number, fill: (layer: number, x: number, y: number) => number[]) {
  const pixels = new Uint8ClampedArray(width * count * height * 4);
  for (let layer = 0; layer < count; layer++)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) pixels.set(fill(layer, x, y), ((y * width * count) + layer * width + x) * 4);
  return pixels;
}

const pixel = (pixels: Uint8ClampedArray, side: number, x: number, y: number) =>
  Array.from(pixels.slice((y * side + x) * 4, (y * side + x) * 4 + 4));

describe('parseDye', () => {
  it('레이어 순번, 파트, 기본 색을 읽는다', () => {
    expect(parseDye(['a.webp', 48, 96, [[0, 'A', 'f2f4ff'], [3, '', '']]])).toEqual({
      sheet: 'a.webp',
      width: 48,
      height: 96,
      layers: [
        { index: 0, part: 'A', colour: [242, 244, 255] },
        { index: 3, part: null, colour: null },
      ],
    });
  });

  it('칠할 파트가 하나도 없거나 모양이 깨지면 null 이다', () => {
    expect(parseDye(['a.webp', 48, 96, [[3, '', '']]])).toBeNull();
    expect(parseDye(['a.webp', 48, 96])).toBeNull();
    expect(parseDye('a.webp')).toBeNull();
  });

  it('그림 목록의 셋째 칸에서 읽는다', () => {
    const map = parseIconMap({ items: { 수트: ['b.webp', '', ['a.webp', 24, 24, [[0, 'A', '000000']]]], 검: ['c.webp'] } });
    expect(map.get('수트')?.dye?.sheet).toBe('a.webp');
    expect(map.get('검')?.dye).toBeUndefined();
  });
});

describe('dyeColorsOf', () => {
  it('아이템 색상 칸을 파트별 색으로 모은다', () => {
    const colors = dyeColorsOf([
      { option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '77,100,96' },
      { option_type: '아이템 색상', option_sub_type: '파트 D', option_value: '237, 98, 88' },
      { option_type: '내구력', option_value: '21' },
    ]);
    expect(colors).toEqual({ A: [77, 100, 96], D: [237, 98, 88] });
  });

  it('색이 없거나 값이 깨졌으면 null 이다', () => {
    expect(dyeColorsOf(undefined)).toBeNull();
    expect(dyeColorsOf([{ option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '1,2' }])).toBeNull();
  });
});

describe('paintDye', () => {
  const dye: ItemDye = {
    sheet: 's.webp',
    width: 2,
    height: 1,
    layers: [
      { index: 0, part: 'A', colour: [10, 20, 30] },
      { index: 1, part: null, colour: null },
      { index: 2, part: 'B', colour: [128, 128, 128] },
    ],
  };
  // 레이어 0 은 두 칸 모두 회색 100, 레이어 1 은 둘째 칸에 원래 색, 레이어 2 는 첫 칸에 회색 200.
  const pixels = sheet(2, 1, 3, (layer, x) =>
    layer === 0 ? [100, 100, 100, 255] : layer === 1 && x === 1 ? [7, 8, 9, 255] : layer === 2 && x === 0 ? [200, 200, 200, 255] : [0, 0, 0, 0],
  );

  it('파트 색으로 칠하고, 파트 없는 레이어는 그대로 겹치고, 정사각형 가운데에 둔다', () => {
    const { side, pixels: out } = paintDye(pixels, 6, dye, { A: [200, 120, 60], B: [0, 255, 255] });
    expect(side).toBe(2);
    // 첫 칸: 레이어 2(B) 가 위다. 2 x 200 + 0 - 256 = 144, 2 x 200 + 255 - 256 = 399 -> 255
    expect(pixel(out, side, 0, 0)).toEqual([144, 255, 255, 255]);
    // 둘째 칸: 레이어 1 의 원래 색이 위다.
    expect(pixel(out, side, 1, 0)).toEqual([7, 8, 9, 255]);
    // 사전 그림과 같은 배치다. 남는 한 줄은 아래로 간다((2 - 1) >> 1 = 0).
    expect(pixel(out, side, 0, 1)).toEqual([0, 0, 0, 0]);
  });

  it('레이어 3 처럼 파트가 없는 레이어는 실린 중립색으로 칠한다. 매물 색은 쓰지 않는다', () => {
    const neutral: ItemDye = { ...dye, layers: [{ index: 1, part: null, colour: [128, 128, 128] }] };
    const { side, pixels: out } = paintDye(pixels, 6, neutral, { A: [255, 0, 0] });
    // 2 x 7 + 128 - 256 = -114 -> 0
    expect(pixel(out, side, 1, 0)).toEqual([0, 0, 0, 255]);
  });

  it('매물에 없는 파트는 기본 색으로 칠한다', () => {
    const only = { ...dye, layers: [dye.layers[0]] };
    const { side, pixels: out } = paintDye(pixels, 6, only, {});
    // 2 x 100 + 10 - 256 = -46 -> 0, 2 x 100 + 20 - 256 -> 0, 2 x 100 + 30 - 256 -> 0
    expect(pixel(out, side, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it('같은 아이템과 같은 색이면 같은 열쇠다', () => {
    expect(dyeKey(dye, { A: [1, 2, 3] })).toBe(dyeKey(dye, { A: [1, 2, 3] }));
    expect(dyeKey(dye, { A: [1, 2, 3] })).not.toBe(dyeKey(dye, { A: [1, 2, 4] }));
  });
});
