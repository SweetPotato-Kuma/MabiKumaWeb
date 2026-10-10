import type { ItemOption } from '@/features/auction/types';

/**
 * 경매장 매물 색으로 아이템 그림을 다시 칠한다.
 *
 * 게임의 인벤토리 그림은 회색 레이어 여러 장을 겹친 것이고, 매물마다 레이어에 다른 색을 입힌다.
 * 그림 목록(iconMap.ts)이 기본 색으로 칠한 그림과 함께 회색 레이어를 가로로 이어 붙인 시트를
 * 알려 준다. 매물에 색 정보가 있으면 이 시트를 받아 그 색으로 칠한다.
 *
 * 규칙은 게임 툴팁과 맞춰 확인했다(2026-10).
 * - 경매장 "파트 A~F" 는 시트의 레이어 0, 1, 2, 4, 5, 6 이다. 레이어 3 은 파트가 아니고 늘 중립 회색(128)으로 칠한다
 * - 칠한 색 = clamp(2 × 회색 + 파트 색 - 256), R, G, B 마다 따로
 * - 레이어는 0 부터 차례로 겹친다
 * 매물에 없는 파트는 기본 색으로 칠한다. 기본 색은 사전 그림과 같은 색이다.
 */

export type DyePart = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface DyeLayer {
  /** 시트 안 순번. */
  index: number;
  /** 칠할 파트. 없으면 매물 색과 상관없이 colour 로 칠한다(레이어 3 은 중립 회색). */
  part: DyePart | null;
  /** 기본 색. 매물에 그 파트가 없을 때 쓴다. 없으면 칠하지 않고 그대로 겹친다. */
  colour: Rgb | null;
}

export interface ItemDye {
  /** 회색 레이어 시트 파일 이름. */
  sheet: string;
  /** 레이어 한 장의 너비, 높이. */
  width: number;
  height: number;
  layers: DyeLayer[];
}

export type Rgb = readonly [number, number, number];
export type DyeColors = Partial<Record<DyePart, Rgb>>;

const PART = /^[A-F]$/;

function hexToRgb(hex: string): Rgb | null {
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/** 그림 목록의 셋째 칸. 모양이 어긋나면 null 이다. 잘못 칠하느니 기본 그림을 보인다. */
export function parseDye(raw: unknown): ItemDye | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const [sheet, width, height, layers] = raw as unknown[];
  if (typeof sheet !== 'string' || !sheet || !Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (!Array.isArray(layers)) return null;
  const parsed: DyeLayer[] = [];
  for (const layer of layers) {
    if (!Array.isArray(layer) || !Number.isInteger(layer[0])) return null;
    const part = typeof layer[1] === 'string' && PART.test(layer[1]) ? (layer[1] as DyePart) : null;
    parsed.push({ index: layer[0] as number, part, colour: typeof layer[2] === 'string' ? hexToRgb(layer[2]) : null });
  }
  if (!parsed.some((layer) => layer.part)) return null;
  return { sheet, width: width as number, height: height as number, layers: parsed };
}

/** 염색 앰플은 파트 없이 "색상" 한 칸으로 온다. 그림에서는 앰플 속 물감인 파트 A 다. */
const AMPOULE_CATEGORY = '염색 앰플';

/**
 * 매물 옵션의 색을 파트별 색으로 모은다. 장비는 "아이템 색상" 칸에 "파트 A" 와 "255,255,255" 로 오고,
 * 염색 앰플(category)은 "색상" 칸에 색만 온다.
 */
export function dyeColorsOf(options: readonly ItemOption[] | undefined, category?: string): DyeColors | null {
  const colors: DyeColors = {};
  let found = false;
  for (const option of options ?? []) {
    const ampoule = category === AMPOULE_CATEGORY && option.option_type === '색상';
    if (!ampoule && !option.option_type.startsWith('아이템 색상')) continue;
    const part = ampoule ? 'A' : (/파트\s*([A-F])/.exec(option.option_sub_type ?? '')?.[1] as DyePart | undefined);
    const rgb = (option.option_value ?? '').split(',').map((v) => Number(v.trim()));
    if (!part || rgb.length !== 3 || rgb.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) continue;
    colors[part] = [rgb[0], rgb[1], rgb[2]];
    found = true;
  }
  return found ? colors : null;
}

/** 색 조합을 캐시 열쇠로. 같은 아이템, 같은 색은 한 번만 칠한다. */
export function dyeKey(dye: ItemDye, colors: DyeColors): string {
  return [dye.sheet, ...dye.layers.map((layer) => (layer.part ? (colors[layer.part] ?? layer.colour ?? []).join(',') : ''))].join('|');
}

/**
 * 시트 픽셀을 칠해 정사각형 한 장으로 겹친다. 정사각형 한 변은 레이어의 긴 변이고 그림은 가운데다.
 * 사전 그림(정사각 WebP)과 같은 크기라 칸에서 같은 배율로 그려진다.
 */
export function paintDye(sheet: Uint8ClampedArray, sheetWidth: number, dye: ItemDye, colors: DyeColors): {
  side: number;
  pixels: Uint8ClampedArray;
} {
  const { width, height } = dye;
  const side = Math.max(width, height);
  const offsetX = (side - width) >> 1;
  const offsetY = (side - height) >> 1;
  const out = new Uint8ClampedArray(side * side * 4);

  for (const layer of dye.layers) {
    const colour = layer.part ? (colors[layer.part] ?? layer.colour) : layer.colour;
    const left = layer.index * width;
    if (left + width > sheetWidth) continue;
    for (let y = 0; y < height; y++) {
      let from = (y * sheetWidth + left) * 4;
      let to = ((y + offsetY) * side + offsetX) * 4;
      for (let x = 0; x < width; x++, from += 4, to += 4) {
        const alpha = sheet[from + 3];
        if (alpha === 0) continue;
        let r = sheet[from];
        let g = sheet[from + 1];
        let b = sheet[from + 2];
        if (colour) {
          // Uint8ClampedArray 에 쓰면 0~255 로 잘린다. 여기서는 계산값만 만든다.
          r = 2 * r + colour[0] - 256;
          g = 2 * g + colour[1] - 256;
          b = 2 * b + colour[2] - 256;
          r = r < 0 ? 0 : r > 255 ? 255 : r;
          g = g < 0 ? 0 : g > 255 ? 255 : g;
          b = b < 0 ? 0 : b > 255 ? 255 : b;
        }
        const below = out[to + 3];
        if (alpha === 255 || below === 0) {
          out[to] = r;
          out[to + 1] = g;
          out[to + 2] = b;
          out[to + 3] = alpha;
          continue;
        }
        // 반투명 가장자리. 위 레이어를 아래 위에 겹친다(곱하지 않은 알파).
        const a = alpha / 255;
        const keep = (below / 255) * (1 - a);
        const total = a + keep;
        out[to] = (r * a + out[to] * keep) / total;
        out[to + 1] = (g * a + out[to + 1] * keep) / total;
        out[to + 2] = (b * a + out[to + 2] * keep) / total;
        out[to + 3] = total * 255;
      }
    }
  }
  return { side, pixels: out };
}

const sheets = new Map<string, Promise<{ pixels: Uint8ClampedArray; width: number } | null>>();

/**
 * 시트 픽셀을 받는다. 같은 시트는 한 번만 받는다. 실패하면 null 이고 화면은 기본 그림을 둔다.
 * 그림 도메인은 모든 출처에 GET 을 열어 두어(R2 CORS) 캔버스로 읽을 수 있다.
 */
export function loadSheet(url: string): Promise<{ pixels: Uint8ClampedArray; width: number } | null> {
  let pending = sheets.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return { pixels: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width };
      } catch {
        return null;
      }
    })();
    sheets.set(url, pending);
  }
  return pending;
}

const painted = new Map<string, Promise<{ side: number; pixels: Uint8ClampedArray } | null>>();
/** 칠한 결과를 남겨 둘 개수. 경매장 몇 쪽을 오가도 다시 칠하지 않을 만큼이다. */
const PAINTED_MAX = 400;

/** 시트를 받아 칠한다. 같은 아이템과 같은 색이면 칠해 둔 것을 쓴다. */
export function paintFromSheet(url: string, dye: ItemDye, colors: DyeColors) {
  const key = dyeKey(dye, colors);
  let result = painted.get(key);
  if (!result) {
    result = loadSheet(url).then((sheet) => (sheet ? paintDye(sheet.pixels, sheet.width, dye, colors) : null));
    painted.set(key, result);
    if (painted.size > PAINTED_MAX) painted.delete(painted.keys().next().value as string);
  }
  return result;
}
