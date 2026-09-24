import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAG_NAMES } from './constants';
import { paintBag, parseDyeBook } from './dye';

/**
 * 3x3 지도. 투명, 고정색, 곱하기 파트 A, 곱하기 파트 B, 더하기 파트 A(-20), 더하기 파트 B(+30),
 * 나머지 셋은 투명.
 */
function tinyBook() {
  // prettier-ignore
  const cells = Uint8Array.from([
    0, 0, 0, 0,
    1, 10, 20, 30,
    2, 200, 50, 100,
    3, 150, 150, 150,
    5, 1, 20, 0,
    6, 0, 30, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  return parseDyeBook({
    size: 3,
    shadeScale: 100,
    bags: { '튼튼한 밀 주머니': { parts: 2, cells: btoa(String.fromCharCode(...cells)) } },
  });
}

describe('paintBag', () => {
  it('곱하기 칸은 채널별 명암을 곱하고, 더하기 칸은 세 채널에 같은 명암을 더한다', () => {
    const book = tinyBook();
    const pixels = paintBag(book, book.bags.get('튼튼한 밀 주머니')!, ['ff8000', '202020']);

    expect([...pixels!.slice(0, 24)]).toEqual([
      // 투명
      0, 0, 0, 0,
      // 칠하지 않는 픽셀은 그 색 그대로
      10, 20, 30, 255,
      // 곱하기 파트 A: 2.00 × 255 는 255 에서 잘리고, 0.50 × 128 = 64, 1.00 × 0 = 0
      255, 64, 0, 255,
      // 곱하기 파트 B: 1.50 × 32 = 48
      48, 48, 48, 255,
      // 더하기 파트 A: (255, 128, 0) - 20, 0 아래는 0 에서 자른다
      235, 108, 0, 255,
      // 더하기 파트 B: (32, 32, 32) + 30
      62, 62, 62, 255,
    ]);
  });

  it('칠해야 할 파트의 색이 없으면 그리지 않는다', () => {
    const book = tinyBook();
    expect(paintBag(book, book.bags.get('튼튼한 밀 주머니')!, ['ff8000'])).toBeNull();
  });

  it('크기가 맞지 않는 지도는 버린다', () => {
    const book = parseDyeBook({
      size: 48,
      shadeScale: 100,
      bags: { '튼튼한 밀 주머니': { parts: 2, cells: btoa('abcd') } },
    });
    expect(book.bags.size).toBe(0);
  });
});

describe('public/bag-dyes.json', () => {
  const file = JSON.parse(readFileSync(resolve(process.cwd(), 'public/bag-dyes.json'), 'utf8'));
  const book = parseDyeBook(file);
  const herbs = [...book.bags].filter(([name]) => /허브|만드레이크|해독초/.test(name));

  it('상점에 나오는 주머니 42종이 모두 들어 있다', () => {
    expect([...book.bags.keys()].sort()).toEqual([...BAG_NAMES].sort());
  });

  it('칠하는 파트는 그 주머니가 가진 파트 안에 있다', () => {
    for (const [name, dye] of book.bags) {
      for (let i = 0; i < dye.cells.length; i += 4) {
        const kind = dye.cells[i];
        if (kind >= 5) expect(kind - 5, name).toBeLessThan(dye.parts);
        else if (kind >= 2) expect(kind - 2, name).toBeLessThan(dye.parts);
      }
    }
  });

  it('허브 주머니도 파트 색으로 칠한다. 튼튼한은 A, B 두 파트, 더 튼튼한은 A, B, C 세 파트다', () => {
    expect(herbs).toHaveLength(20);
    for (const [name, dye] of herbs) {
      expect(dye.parts, name).toBe(name.startsWith('더 튼튼한') ? 3 : 2);
      const red = paintBag(book, dye, ['ff0000', 'ff0000', 'ff0000']);
      const blue = paintBag(book, dye, ['0000ff', '0000ff', '0000ff']);
      expect(red, name).not.toEqual(blue);
    }
  });

  /** 왼쪽 아래 칸(+ 자리)에 그 색이 칠하지 않는 픽셀로 몇 개 있나. */
  function plusPixels(cells: Uint8Array, color: [number, number, number]): number {
    let count = 0;
    for (let y = 24; y < 48; y++) {
      for (let x = 0; x < 20; x++) {
        const i = (y * 48 + x) * 4;
        if (
          cells[i] === 1 &&
          cells[i + 1] === color[0] &&
          cells[i + 2] === color[1] &&
          cells[i + 3] === color[2]
        )
          count++;
      }
    }
    return count;
  }

  it('+ 표시는 모든 주머니에 있고, 튼튼한은 주황, 더 튼튼한은 노랑이다', () => {
    // 게임 화면 캡처에서 뽑은 + 가운데 색.
    const orange: [number, number, number] = [251, 153, 5];
    const yellow: [number, number, number] = [251, 235, 137];
    for (const [name, dye] of book.bags) {
      const sturdier = name.startsWith('더 튼튼한');
      expect(plusPixels(dye.cells, orange), name).toBe(sturdier ? 0 : 15);
      expect(plusPixels(dye.cells, yellow) > 0, name).toBe(sturdier);
    }
  });

  it('더 튼튼한 허브 주머니는 창 안 허브 그림만 서로 다르다', () => {
    const bloody = book.bags.get('더 튼튼한 블러디 허브 주머니')!.cells;
    const mana = book.bags.get('더 튼튼한 마나 허브 주머니')!.cells;
    let differ = 0;
    for (let p = 0; p < 48 * 48; p++) {
      if ([0, 1, 2, 3].every((k) => bloody[p * 4 + k] === mana[p * 4 + k])) continue;
      differ++;
      // 다른 픽셀은 모두 칠하지 않는 픽셀(허브 그림)이고, 가운데 쪽에 있다.
      expect(bloody[p * 4]).toBe(1);
      expect(p % 48).toBeGreaterThanOrEqual(16);
    }
    expect(differ).toBeGreaterThan(10);
  });
});
