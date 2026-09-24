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

  it('그림이 있는 22종이 모두 들어 있고, 이름이 알려진 주머니 이름이다', () => {
    expect(book.bags.size).toBe(22);
    for (const name of book.bags.keys()) expect(BAG_NAMES).toContain(name);
  });

  it('칠하는 파트는 그 주머니가 가진 파트 안에 있다', () => {
    for (const [name, dye] of book.bags) {
      const kinds = new Set<number>();
      for (let i = 0; i < dye.cells.length; i += 4) kinds.add(dye.cells[i]);
      const parts = [...kinds].filter((kind) => kind >= 2).map((kind) => kind - 2);
      expect(Math.max(...parts), name).toBeLessThan(dye.parts);
    }
  });
});
