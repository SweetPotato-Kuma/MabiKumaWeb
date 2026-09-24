import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAG_NAMES } from './constants';
import { paintBag, parseDyeBook } from './dye';

/** 2x2 지도. 투명, 고정색, 파트 A, 파트 B 한 픽셀씩. */
function tinyBook() {
  const cells = Uint8Array.from([0, 0, 0, 0, 1, 10, 20, 30, 2, 200, 50, 100, 3, 150, 150, 150]);
  return parseDyeBook({
    size: 2,
    shadeScale: 100,
    bags: { '튼튼한 밀 주머니': { parts: 2, cells: btoa(String.fromCharCode(...cells)) } },
  });
}

describe('paintBag', () => {
  it('파트 색에 채널별 명암을 곱하고 255 에서 자른다', () => {
    const book = tinyBook();
    const pixels = paintBag(book, book.bags.get('튼튼한 밀 주머니')!, ['ff8000', '202020']);

    expect([...pixels!]).toEqual([
      // 투명
      0, 0, 0, 0,
      // 칠하지 않는 픽셀은 그 색 그대로
      10, 20, 30, 255,
      // 파트 A: 2.00 × 255 는 255 에서 잘리고, 0.50 × 128 = 64, 1.00 × 0 = 0
      255, 64, 0, 255,
      // 파트 B: 1.50 × 32 = 48
      48, 48, 48, 255,
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

describe('public/bags/dyes.json', () => {
  const file = JSON.parse(readFileSync(resolve(process.cwd(), 'public/bags/dyes.json'), 'utf8'));
  const book = parseDyeBook(file);

  it('튼튼한 주머니 32종이 모두 들어 있다', () => {
    expect([...book.bags.keys()].sort()).toEqual([...BAG_NAMES].sort());
  });

  it('칠하는 파트는 그 주머니가 가진 파트 안에 있다', () => {
    for (const [name, dye] of book.bags) {
      for (let i = 0; i < dye.cells.length; i += 4) {
        if (dye.cells[i] >= 2) expect(dye.cells[i] - 2, name).toBeLessThan(dye.parts);
      }
    }
  });

  it('허브 주머니는 색이 입혀지지 않아 상점 색과 상관없이 같은 그림이다', () => {
    const herbs = [...book.bags].filter(([name]) => /허브|만드레이크|해독초/.test(name));
    expect(herbs).toHaveLength(10);
    for (const [name, dye] of herbs) {
      expect(dye.parts, name).toBe(0);
      expect(paintBag(book, dye, ['ff0000', '00ff00']), name).toEqual(paintBag(book, dye, []));
    }
  });

  it('더 튼튼한 주머니에만 붙는 금색 + 표시가 남아 있지 않다', () => {
    for (const [name, dye] of book.bags) {
      if (dye.parts === 0) continue;
      // + 는 왼쪽 아래 1/3 칸에 금색(R 높음, G 중간, B 낮음) 칠하지 않는 픽셀로 있었다.
      for (let y = 24; y < 48; y++) {
        for (let x = 0; x < 16; x++) {
          const i = (y * 48 + x) * 4;
          const gold =
            dye.cells[i] === 1 &&
            dye.cells[i + 1] > 150 &&
            dye.cells[i + 2] > 100 &&
            dye.cells[i + 3] < 120;
          expect(gold, `${name} (${x}, ${y})`).toBe(false);
        }
      }
    }
  });
});
