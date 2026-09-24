import { useEffect, useState } from 'react';
import { hexToRgb } from './color';

/**
 * 튼튼한 주머니 색칠.
 *
 * 상점 응답에는 색만 있다. 주머니마다 "어느 픽셀이 어느 파트인지와 얼마나 밝게 칠해지는지"
 * 를 담은 지도(public/bags/dyes.json)를 들고 있다가 그 색을 칠해 그린다. 지도는
 * scripts/build-bag-dyes.mjs 가 넥슨이 색을 입혀 그린 그림들을 거꾸로 풀어 만든다.
 *
 * 칠하는 식은 넥슨과 같다: 칠해진 색 = min(255, 명암 × 파트 색), R, G, B 채널마다 따로.
 * 이 식으로 그린 그림은 넥슨 그림과 채널당 2 이내로 같다(2026-09-24, 넥슨 그림 110장으로 확인).
 * 넥슨 그림 왼쪽 아래의 + 표시는 더 튼튼한 주머니에만 붙는 것이라 지도에서 지워 두었다.
 *
 * 허브 주머니 10종은 파트가 0개인 지도다. 게임에서도 허브 주머니 그림에는 색이 입혀지지
 * 않으므로 칠하지 않는 픽셀로만 되어 있고, 상점 색과 상관없이 늘 같은 그림이 나온다.
 */

/** 한 픽셀은 4바이트. 첫 바이트가 종류다. */
const CELL_TRANSPARENT = 0;
const CELL_FIXED = 1;
/** 2 는 파트 A, 3 은 파트 B, 4 는 파트 C. 나머지 세 바이트가 R, G, B 명암이다. */
const CELL_FIRST_PART = 2;

export interface BagDye {
  parts: number;
  /** size × size × 4 바이트. */
  cells: Uint8Array;
}

export interface BagDyeBook {
  /** 그림 한 변. 48. */
  size: number;
  /** 명암 바이트를 이 값으로 나누면 배율이다. */
  shadeScale: number;
  bags: Map<string, BagDye>;
}

interface DyeFile {
  size: number;
  shadeScale: number;
  bags: Record<string, { parts: number; cells: string }>;
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 크기가 맞지 않는 주머니는 버린다. 잘못 칠하느니 색 칸으로 두는 편이 낫다. */
export function parseDyeBook(file: DyeFile): BagDyeBook {
  const bags = new Map<string, BagDye>();
  for (const [name, entry] of Object.entries(file.bags ?? {})) {
    const cells = decodeBase64(entry.cells);
    if (cells.length !== file.size * file.size * 4) continue;
    bags.set(name, { parts: entry.parts, cells });
  }
  return { size: file.size, shadeScale: file.shadeScale, bags };
}

/**
 * 주머니 하나를 칠한 RGBA 픽셀. 칠해야 할 파트의 색이 없으면 null.
 *
 * @param colors 파트 A, B, C 순서의 6자리 16진수(상점 응답 그대로)
 */
export function paintBag(
  book: BagDyeBook,
  dye: BagDye,
  colors: readonly string[],
): Uint8ClampedArray | null {
  const rgb = colors.map((hex) => hexToRgb(hex));
  for (let part = 0; part < dye.parts; part++) if (!rgb[part]) return null;

  const { cells } = dye;
  const pixels = new Uint8ClampedArray(cells.length);
  for (let i = 0; i < cells.length; i += 4) {
    const kind = cells[i];
    if (kind === CELL_TRANSPARENT) continue;
    if (kind === CELL_FIXED) {
      pixels[i] = cells[i + 1];
      pixels[i + 1] = cells[i + 2];
      pixels[i + 2] = cells[i + 3];
    } else {
      const color = rgb[kind - CELL_FIRST_PART];
      if (!color) return null;
      // Uint8ClampedArray 가 255 에서 잘라 준다. 넥슨 식의 min(255, …) 이 그대로 된다.
      pixels[i] = (cells[i + 1] * color.r) / book.shadeScale;
      pixels[i + 1] = (cells[i + 2] * color.g) / book.shadeScale;
      pixels[i + 2] = (cells[i + 3] * color.b) / book.shadeScale;
    }
    pixels[i + 3] = 255;
  }
  return pixels;
}

let pending: Promise<BagDyeBook | null> | null = null;

/**
 * 지도는 한 번만 받는다. 395KB 지만 gzip 으로 38KB 라 주머니 화면에 들어올 때 받아도 된다.
 * 받지 못하면 다음에 다시 시도하도록 기억하지 않는다.
 */
export function loadDyeBook(): Promise<BagDyeBook | null> {
  pending ??= fetch(`${import.meta.env.BASE_URL}bags/dyes.json`)
    .then((response) => (response.ok ? (response.json() as Promise<DyeFile>) : null))
    .then((file) => (file ? parseDyeBook(file) : null))
    .catch(() => null)
    .then((book) => {
      if (!book) pending = null;
      return book;
    });
  return pending;
}

/** 지도. 받는 중이거나 받지 못했으면 null 이고, 그동안 주머니는 색 칸으로 보인다. */
export function useDyeBook(): BagDyeBook | null {
  const [book, setBook] = useState<BagDyeBook | null>(null);
  useEffect(() => {
    let alive = true;
    void loadDyeBook().then((loaded) => {
      if (alive) setBook(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);
  return book;
}
