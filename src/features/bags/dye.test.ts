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

  it('상점에 나오는 주머니 42종이 모두 들어 있다', () => {
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
    expect(herbs).toHaveLength(20);
    for (const [name, dye] of herbs) {
      expect(dye.parts, name).toBe(0);
      expect(paintBag(book, dye, ['ff0000', '00ff00']), name).toEqual(paintBag(book, dye, []));
    }
  });

  it('넥슨 그림에서 뽑은 주머니에는 금색 + 표시가 남아 있지 않다', () => {
    for (const [name, dye] of book.bags) {
      if (dye.parts === 0) continue;
      // + 는 왼쪽 아래 1/3 칸에 금색(R 높음, G 중간 이상, B 낮음) 칠하지 않는 픽셀로 있었다.
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

  it('허브 주머니의 + 표시는 더 튼튼한 쪽에만 있다', () => {
    // 허브 주머니는 주황, 금색 몸통이 많아 색으로는 가를 수 없다. 더 튼튼한 열 장에서 같은 자리,
    // 같은 색인 왼쪽 아래 픽셀을 + 로 보고, 튼튼한 쪽에 그 모양이 남았는지 본다.
    const herbs = [...book.bags].filter(([name]) => /허브|만드레이크|해독초/.test(name));
    const sturdier = herbs
      .filter(([name]) => name.startsWith('더 튼튼한'))
      .map(([, dye]) => dye.cells);
    const plus: number[] = [];
    for (let y = 24; y < 48; y++) {
      for (let x = 0; x < 24; x++) {
        const i = (y * 48 + x) * 4;
        if (sturdier[0][i] === 0) continue;
        if (
          sturdier.every((cells) => [0, 1, 2, 3].every((k) => cells[i + k] === sturdier[0][i + k]))
        )
          plus.push(i);
      }
    }
    expect(plus.length).toBeGreaterThan(80);

    for (const [name, dye] of herbs) {
      if (name.startsWith('더 튼튼한')) continue;
      const left = plus.filter((i) =>
        [0, 1, 2, 3].every((k) => dye.cells[i + k] === sturdier[0][i + k]),
      );
      expect(left.length, name).toBeLessThan(plus.length / 4);
    }
  });

  it('튼튼한 허브 주머니는 더 튼튼한 쪽과 + 자리만 다르다', () => {
    const plain = book.bags.get('튼튼한 마나 허브 주머니')!.cells;
    const sturdier = book.bags.get('더 튼튼한 마나 허브 주머니')!.cells;
    let differ = 0;
    for (let p = 0; p < 48 * 48; p++) {
      const same = [0, 1, 2, 3].every((k) => plain[p * 4 + k] === sturdier[p * 4 + k]);
      if (same) continue;
      differ++;
      // 다른 픽셀은 모두 왼쪽 아래 1/4 에 있다.
      expect(p % 48).toBeLessThan(24);
      expect(Math.floor(p / 48)).toBeGreaterThanOrEqual(24);
    }
    expect(differ).toBeGreaterThan(0);
  });
});
