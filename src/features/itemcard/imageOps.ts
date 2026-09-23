/**
 * 툴팁 스크린샷에서 쓸 만한 조각을 잘라내는 순수 함수들.
 *
 * 입력은 캔버스에서 꺼낸 픽셀 뭉치고, 출력도 픽셀 뭉치다. DOM 을 건드리지 않아서
 * 테스트에서 손으로 만든 이미지를 그대로 넣어 볼 수 있다. 캔버스 쪽 배선은
 * `canvas.ts` 가 따로 맡는다.
 *
 * 전제는 하나다. 마비노기 툴팁은 거의 검은 직사각형이고, 아이템 아이콘은 그 바깥
 * 인벤토리 칸 위에 얹혀 있다. 이 둘의 밝기 차이가 워낙 커서 임계값 한 번으로
 * 갈린다. 게임 UI 스킨이 바뀌면 여기 상수들이 먼저 틀어진다.
 */

/** ImageData 와 구조가 같다. 테스트에서 캔버스 없이 만들어 넣으려고 따로 둔다. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 툴팁 본문으로 칠 밝기 상한. 실측한 패널 바탕은 #121212, 설명 상자는 #000000 이었다. */
const PANEL_MAX_CHANNEL = 70;

/** 패널이 이보다 작으면 툴팁이 아니라 그냥 어두운 얼룩으로 본다. */
const PANEL_MIN_WIDTH = 60;
const PANEL_MIN_HEIGHT = 40;

/** 가장자리를 깎을 때 기준이 되는 밀도. 이보다 성기면 패널 본체가 아니라 삐져나온 꼬리다. */
const PANEL_EDGE_DENSITY = 0.55;

/** 아이콘 후보로 칠 채도와 밝기. 인벤토리 칸 바탕(#5d5855)은 채도 0.09 라 걸리지 않는다. */
const ICON_MIN_SATURATION = 0.25;
const ICON_MIN_LUMA = 160;

/** 아이콘은 보통 여러 조각으로 끊긴다. 이 거리 안이면 한 덩어리로 합친다. */
const ICON_MERGE_GAP = 7;

/** 이보다 작은 얼룩은 노이즈, 이보다 큰 덩어리는 배경(하늘, 바닥, 창틀)으로 본다. */
const ICON_MIN_AREA = 40;
const ICON_MAX_AREA_RATIO = 0.25;

function channelAt(image: RgbaImage, index: number): [number, number, number] {
  const offset = index * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
}

function saturationOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  if (max === 0) return 0;
  return (max - Math.min(r, g, b)) / max;
}

/**
 * 4방향 연결 성분을 훑어 각 덩어리의 경계 상자와 넓이를 돌려준다.
 *
 * 재귀 대신 스택을 쓴다. 1000x1000 짜리 스크린샷에서 재귀로 채우면 콜스택이 먼저 터진다.
 */
function connectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): { box: Rect; area: number; touchesBorder: boolean }[] {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const found: { box: Rect; area: number; touchesBorder: boolean }[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;

    seen[start] = 1;
    stack.push(start);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    let touchesBorder = false;

    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % width;
      const y = (index - x) / width;

      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;

      if (x > 0 && mask[index - 1] && !seen[index - 1]) {
        seen[index - 1] = 1;
        stack.push(index - 1);
      }
      if (x < width - 1 && mask[index + 1] && !seen[index + 1]) {
        seen[index + 1] = 1;
        stack.push(index + 1);
      }
      if (y > 0 && mask[index - width] && !seen[index - width]) {
        seen[index - width] = 1;
        stack.push(index - width);
      }
      if (y < height - 1 && mask[index + width] && !seen[index + width]) {
        seen[index + width] = 1;
        stack.push(index + width);
      }
    }

    found.push({
      box: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      area,
      touchesBorder,
    });
  }

  return found;
}

/**
 * 툴팁 패널의 경계 상자.
 *
 * 가장 큰 어두운 덩어리를 잡은 뒤 가장자리를 깎는다. 깎지 않으면 인벤토리 칸 사이
 * 검은 격자선이 패널에 붙어 딸려 들어온다. 격자선은 얇아서 행 밀도가 낮고,
 * 패널 본체는 한 행이 거의 다 차므로 밀도 하나로 갈린다.
 */
export function findTooltipPanel(image: RgbaImage): Rect | null {
  const { width, height } = image;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < mask.length; i++) {
    const [r, g, b] = channelAt(image, i);
    mask[i] = Math.max(r, g, b) <= PANEL_MAX_CHANNEL ? 1 : 0;
  }

  const components = connectedComponents(mask, width, height);
  if (components.length === 0) return null;

  const largest = components.reduce((best, item) => (item.area > best.area ? item : best));
  const box = { ...largest.box };

  const rowDensity = (y: number) => {
    let filled = 0;
    for (let x = box.x; x < box.x + box.width; x++) filled += mask[y * width + x];
    return filled / box.width;
  };
  const columnDensity = (x: number) => {
    let filled = 0;
    for (let y = box.y; y < box.y + box.height; y++) filled += mask[y * width + x];
    return filled / box.height;
  };

  while (box.height > 1 && rowDensity(box.y) < PANEL_EDGE_DENSITY) {
    box.y++;
    box.height--;
  }
  while (box.height > 1 && rowDensity(box.y + box.height - 1) < PANEL_EDGE_DENSITY) {
    box.height--;
  }
  while (box.width > 1 && columnDensity(box.x) < PANEL_EDGE_DENSITY) {
    box.x++;
    box.width--;
  }
  while (box.width > 1 && columnDensity(box.x + box.width - 1) < PANEL_EDGE_DENSITY) {
    box.width--;
  }

  if (box.width < PANEL_MIN_WIDTH || box.height < PANEL_MIN_HEIGHT) return null;
  return box;
}

function rectsWithinGap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x - gap < b.x + b.width &&
    b.x - gap < a.x + a.width &&
    a.y - gap < b.y + b.height &&
    b.y - gap < a.y + a.height
  );
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * 아이템 아이콘의 경계 상자.
 *
 * 패널 바깥에서 "배경 같지 않은" 픽셀을 모은다. 인벤토리 칸 바탕은 채도도 밝기도
 * 낮아 걸리지 않고, 아이콘은 대부분 색이 있거나 밝다.
 *
 * 화면 가장자리에 닿는 덩어리는 버린다. 툴팁 뒤로 보이는 게임 배경(하늘, 나무 바닥)이
 * 딱 그 모양인데, 아이콘은 인벤토리 칸 안에 들어 있어서 가장자리에 닿지 않는다.
 *
 * 한 아이콘은 보통 여러 조각으로 끊겨 나온다. 병뚜껑과 병 몸통 사이에 어두운 띠가
 * 있으면 다른 덩어리가 된다. 그래서 가까운 것끼리 먼저 합치고 나서 고른다.
 */
export function findIconBox(image: RgbaImage, panel: Rect | null): Rect | null {
  const { width, height } = image;
  const mask = new Uint8Array(width * height);
  let outsideArea = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const insidePanel =
        panel !== null &&
        x >= panel.x &&
        x < panel.x + panel.width &&
        y >= panel.y &&
        y < panel.y + panel.height;
      if (insidePanel) continue;

      outsideArea++;
      const [r, g, b] = channelAt(image, index);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (saturationOf(r, g, b) >= ICON_MIN_SATURATION || luma >= ICON_MIN_LUMA) mask[index] = 1;
    }
  }

  const maxArea = outsideArea * ICON_MAX_AREA_RATIO;
  const candidates = connectedComponents(mask, width, height).filter(
    (item) => !item.touchesBorder && item.area >= ICON_MIN_AREA && item.area <= maxArea,
  );
  if (candidates.length === 0) return null;

  // 가까운 조각끼리 합친다. 개수가 적어 제곱 루프로 충분하다.
  const groups = candidates.map((item) => ({ box: item.box, area: item.area }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (!rectsWithinGap(groups[i].box, groups[j].box, ICON_MERGE_GAP)) continue;
        groups[i] = {
          box: unionRect(groups[i].box, groups[j].box),
          area: groups[i].area + groups[j].area,
        };
        groups.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }

  // 넓은 쪽을 고르되, 툴팁에서 먼 덩어리에는 벌점을 준다. 툴팁은 가리킨 아이템 옆에 뜬다.
  const anchor = panel ? { x: panel.x, y: panel.y } : { x: 0, y: 0 };
  const best = groups.reduce((winner, item) => {
    const score = (rect: Rect, area: number) => {
      const dx = rect.x + rect.width / 2 - anchor.x;
      const dy = rect.y + rect.height / 2 - anchor.y;
      return area / (1 + Math.hypot(dx, dy) / 200);
    };
    return score(item.box, item.area) > score(winner.box, winner.area) ? item : winner;
  });

  return best.box;
}

export function clampRect(rect: Rect, image: RgbaImage): Rect {
  const x = Math.max(0, Math.min(Math.round(rect.x), image.width - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), image.height - 1));
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(rect.width), image.width - x)),
    height: Math.max(1, Math.min(Math.round(rect.height), image.height - y)),
  };
}

export function cropImage(image: RgbaImage, rect: Rect): RgbaImage {
  const box = clampRect(rect, image);
  const out = new Uint8ClampedArray(box.width * box.height * 4);

  for (let y = 0; y < box.height; y++) {
    const source = ((box.y + y) * image.width + box.x) * 4;
    out.set(image.data.subarray(source, source + box.width * 4), y * box.width * 4);
  }

  return { width: box.width, height: box.height, data: out };
}

/** 최근접 이웃 확대. 작은 게임 폰트는 흐려지는 것보다 계단이 지는 편이 읽기 낫다. */
export function scaleNearest(image: RgbaImage, factor: number): RgbaImage {
  const scale = Math.max(1, Math.round(factor));
  if (scale === 1) return image;

  const width = image.width * scale;
  const height = image.height * scale;
  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const sourceRow = ((y / scale) | 0) * image.width;
    for (let x = 0; x < width; x++) {
      const source = (sourceRow + ((x / scale) | 0)) * 4;
      const target = (y * width + x) * 4;
      out[target] = image.data[source];
      out[target + 1] = image.data[source + 1];
      out[target + 2] = image.data[source + 2];
      out[target + 3] = image.data[source + 3];
    }
  }

  return { width, height, data: out };
}

export interface CutoutOptions {
  /** 이 거리 안이면 배경으로 확정하고 완전히 지운다. */
  hardTolerance?: number;
  /** 이 거리를 넘으면 아이템으로 보고 남긴다. 사이 구간은 반투명으로 넘어간다. */
  softTolerance?: number;
}

const DEFAULT_HARD_TOLERANCE = 26;
const DEFAULT_SOFT_TOLERANCE = 58;

/** 테두리 한 줄에서 배경색 후보를 뽑는다. 32 단계로 뭉갠 뒤 자주 나온 색만 남긴다. */
function sampleBackgroundColors(image: RgbaImage): [number, number, number][] {
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();
  let total = 0;

  const record = (x: number, y: number) => {
    const [r, g, b] = channelAt(image, y * image.width + x);
    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count++;
    buckets.set(key, bucket);
    total++;
  };

  for (let x = 0; x < image.width; x++) {
    record(x, 0);
    record(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y++) {
    record(0, y);
    record(image.width - 1, y);
  }

  const colors = [...buckets.values()]
    .filter((bucket) => bucket.count / total >= 0.04)
    .map((bucket): [number, number, number] => [
      bucket.r / bucket.count,
      bucket.g / bucket.count,
      bucket.b / bucket.count,
    ]);

  // 테두리가 온통 제각각이면 아무것도 지우지 않는 편이 낫다. 지울 대상을 못 고른 것이다.
  return colors;
}

/**
 * 인벤토리 칸 바탕을 지우고 알파를 채운 이미지를 만든다.
 *
 * 색만 보고 지우면 아이템 안쪽에 있는 같은 색까지 뚫린다. 그래서 테두리에서 시작해
 * 이어진 곳만 지운다. 안쪽에 갇힌 배경색은 남는데, 그게 맞다. 병 안에 비치는
 * 회색은 병의 일부다.
 *
 * 경계는 반투명으로 넘긴다. 게임 아이콘은 배경 위에 안티앨리어싱되어 찍혀 있어서
 * 딱 잘라내면 회색 테가 남는다. 반투명 구간에서 배경색을 역으로 빼내 그 테를 지운다.
 */
export function removeBackground(image: RgbaImage, options: CutoutOptions = {}): RgbaImage {
  const hard = options.hardTolerance ?? DEFAULT_HARD_TOLERANCE;
  const soft = Math.max(options.softTolerance ?? DEFAULT_SOFT_TOLERANCE, hard + 1);

  const out: RgbaImage = {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };

  const palette = sampleBackgroundColors(image);
  if (palette.length === 0) return out;

  const pixels = image.width * image.height;
  const distance = new Float32Array(pixels);
  const nearest = new Int32Array(pixels);

  for (let i = 0; i < pixels; i++) {
    const [r, g, b] = channelAt(image, i);
    let best = Infinity;
    let bestIndex = 0;
    for (let p = 0; p < palette.length; p++) {
      const [pr, pg, pb] = palette[p];
      const value = Math.hypot(r - pr, g - pg, b - pb);
      if (value < best) {
        best = value;
        bestIndex = p;
      }
    }
    distance[i] = best;
    nearest[i] = bestIndex;
  }

  // 테두리에서 시작해 "배경에 가까운" 픽셀만 타고 번진다.
  const reached = new Uint8Array(pixels);
  const stack: number[] = [];
  const push = (index: number) => {
    if (reached[index] || distance[index] > soft) return;
    reached[index] = 1;
    stack.push(index);
  };

  for (let x = 0; x < image.width; x++) {
    push(x);
    push((image.height - 1) * image.width + x);
  }
  for (let y = 0; y < image.height; y++) {
    push(y * image.width);
    push(y * image.width + image.width - 1);
  }

  while (stack.length > 0) {
    const index = stack.pop() as number;
    const x = index % image.width;
    const y = (index - x) / image.width;
    if (x > 0) push(index - 1);
    if (x < image.width - 1) push(index + 1);
    if (y > 0) push(index - image.width);
    if (y < image.height - 1) push(index + image.width);
  }

  for (let i = 0; i < pixels; i++) {
    if (!reached[i]) continue;

    const alpha = Math.max(0, Math.min(1, (distance[i] - hard) / (soft - hard)));
    const offset = i * 4;

    if (alpha <= 0) {
      out.data[offset + 3] = 0;
      continue;
    }

    // 반투명 구간은 배경이 섞여 있다. 섞인 만큼 빼야 회색 테가 안 남는다.
    const [br, bg, bb] = palette[nearest[i]];
    out.data[offset] = (image.data[offset] - br * (1 - alpha)) / alpha;
    out.data[offset + 1] = (image.data[offset + 1] - bg * (1 - alpha)) / alpha;
    out.data[offset + 2] = (image.data[offset + 2] - bb * (1 - alpha)) / alpha;
    out.data[offset + 3] = Math.round(alpha * 255);
  }

  return out;
}

/** 다 지워진 바깥 줄을 잘라낸다. 아이콘만 남은 PNG 가 되도록. */
export function trimTransparent(image: RgbaImage): RgbaImage {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return image;
  return cropImage(image, { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
}

export interface TooltipLayout {
  panel: Rect | null;
  icon: Rect | null;
}

/** 스크린샷 한 장에서 툴팁과 아이콘 자리를 한 번에 찾는다. */
export function analyzeTooltipImage(image: RgbaImage): TooltipLayout {
  const panel = findTooltipPanel(image);
  return { panel, icon: findIconBox(image, panel) };
}
