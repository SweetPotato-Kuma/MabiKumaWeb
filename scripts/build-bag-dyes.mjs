/**
 * 튼튼한 주머니 색칠 지도 만들기
 *
 * 화면은 주머니마다 "기본 그림 + 어느 픽셀이 어느 파트인지"를 들고, 상점에서 받은 색을 그
 * 위에 칠해 그린다. 넥슨이 색을 입혀 그려 주는 그림 주소는 줄마다 달라 워커 응답이 세 배로
 * 불어나고, 허브 주머니처럼 그림을 아예 주지 않는 것도 있다. 칠하는 방법을 알면 응답에는
 * 색만 있으면 된다.
 *
 * 파트 지도는 어디에도 공개돼 있지 않다. 그래서 넥슨이 색을 입혀 그린 그림을 여러 장 모아
 * 거꾸로 푼다. 같은 주머니를 색만 바꿔 17장 이상 보면, 픽셀마다 어느 파트 색을 따라 움직이는지와
 * 얼마나 밝게 칠해지는지가 드러난다.
 *
 * 2026-09-24 에 22종 전부에서 확인한 칠하는 식:
 *   칠해진 색 = min(255, 명암 × 파트 색)   (R, G, B 채널마다 명암이 따로 있다)
 * 이 식으로 다시 그린 그림이 넥슨 그림과 채널당 1~2 이내로 같다. 스크립트가 끝에 그 차이를
 * 다시 재서 보여 주고, 차이가 크면 파일을 쓰지 않는다.
 *
 * 넥슨 그림은 48x48 픽셀 그림을 14/3 배(224px)로 키워 240px 캔버스 가운데(여백 8px)에 둔
 * 것이다. 각 칸의 가운데 픽셀을 읽어 48x48 로 되돌린다.
 *
 * + 표시는 모든 주머니에 붙고, 색으로 등급을 가른다. 튼튼한 주머니는 주황, 더 튼튼한
 * 주머니는 노랑이다(게임 화면으로 확인, scripts/bag-dye-sources). 그런데 넥슨 그림은 튼튼한
 * 주머니에도 노란 + 를 그린다. 그래서 넥슨 그림과 대 본 뒤에 노란 + 를 지우고(가려져 있던 주머니
 * 모서리는 보이는 가장자리를 이어 그어 되살린다, fillUnderPlus), 게임 화면에서 뽑은 주황 + 를
 * 그 자리에 찍는다.
 *
 * 허브 주머니(튼튼한 10종, 더 튼튼한 10종)는 넥슨이 그림 주소를 비워서 준다. 클라이언트 아이콘은
 * 게임 화면과 그림이 달라 쓸 수 없다. 그래서 게임 화면 캡처 두 장(튼튼한 만드레이크 주머니, 더
 * 튼튼한 블러디 허브 주머니)과 그때의 파트 색으로 주머니 틀을 푼다.
 * - 허브 주머니는 곱하기가 아니라 더하기로 칠한다: 칠해진 색 = 파트 색 + 명암(세 채널에 같은 값)
 *   캡처의 몸통이 파트 A 에서 세 채널 모두 같은 만큼 빠지고 더해진 색이라 알 수 있었다. 그래서
 *   캡처 한 장으로도 픽셀마다 세 채널의 차이가 같아지는 파트를 고를 수 있다
 * - 창 안의 허브 그림은 파트 색과 상관없다. 더 튼튼한 쪽 창 안은 클라이언트 아이콘의 창 안과
 *   픽셀 하나까지 같아서, 열 종 모두 클라이언트 아이콘에서 옮긴다
 * - 튼튼한 쪽 창은 모양이 달라 옮길 그림이 없다. 만드레이크는 캡처 그대로 두고, 나머지 아홉 종은
 *   더 튼튼한 쪽 허브 그림을 창 가운데에 옮겨 넣는다(근사)
 *
 * 실행: NEXON_API_KEY=... node scripts/build-bag-dyes.mjs
 * 산출: public/bag-dyes.json
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

const API_ORIGIN = 'https://open.api.nexon.com';
/** 게임 클라이언트 아이콘. 아이템 사전 아이콘을 받는 곳과 같다(scripts/local 참고). */
const CLIENT_ICON_URL = (id) => `https://mabires2.pril.cc/invimage/kr/${id}/${id}.png`;

/**
 * 게임 화면 캡처. 인벤토리의 아이콘을 원래 크기로 찍은 것과, 그 주머니의 파트 색(툴팁 값).
 * 허브 주머니의 주머니 틀과 + 표시를 여기서 푼다.
 */
const HERB_CAPTURES = {
  plain: {
    file: 'scripts/bag-dye-sources/sturdy-mandrake-bag.png',
    herb: '만드레이크 주머니',
    colors: [
      [245, 132, 89],
      [155, 89, 91],
    ],
  },
  sturdier: {
    file: 'scripts/bag-dye-sources/sturdier-bloody-herb-bag.png',
    herb: '블러디 허브 주머니',
    colors: [
      [167, 184, 218],
      [248, 195, 145],
      [232, 188, 180],
    ],
  },
};

/** 더하기로 칠하는 칸. 5 는 파트 A, 6 은 파트 B, 7 은 파트 C. [종류, 음수면 1, 명암 크기, 0] */
const CELL_ADD_FIRST = 5;
/** 캡처에서 세 채널의 차이가 이만큼 안에서 같으면 그 파트로 칠해진 픽셀로 본다. */
const ADD_SPREAD = 6;

/**
 * 더 튼튼한 허브 주머니의 클라이언트 아이템 번호. 2026-09-24 클라이언트 리소스에서 이름으로 찾았다.
 * 튼튼한 허브 주머니도 이 그림에서 + 만 지워 만든다.
 */
const HERB_ICON_IDS = {
  '블러디 허브 주머니': 5110050,
  '마나 허브 주머니': 5110051,
  '선라이트 허브 주머니': 5110052,
  '베이스 허브 주머니': 5110053,
  '만드레이크 주머니': 5110054,
  '골드 허브 주머니': 5110060,
  '못쓰게 된 허브 주머니': 5110061,
  '화이트 허브 주머니': 5110062,
  '해독초 주머니': 5110063,
  '포이즌 허브 주머니': 5110064,
};
const OUT_FILE = resolve(process.cwd(), 'public/bag-dyes.json');

/** 상점에서 튼튼한 주머니와 더 튼튼한 주머니를 가려낸다. worker/worker.js 와 같다. */
const BAG_NAME = /^(더 )?튼튼한 /;

/** 튼튼한 주머니를 파는 NPC. worker/worker.js 의 BAG_SELLERS 와 같다. */
const SELLERS = [
  '상인 라누',
  '상인 피루',
  '모락',
  '상인 아루',
  '리나',
  '상인 누누',
  '상인 메루',
  '켄',
  '귀넥',
  '얼리',
  '데위',
  '테일로',
  '상인 세누',
  '상인 베루',
  '상인 에루',
  '상인 네루',
  '카디',
];
/** 채널 둘이면 종류마다 색이 다른 그림 34장이 모인다. 17장으로도 풀리지만 넉넉히 본다. */
const SAMPLE_SERVER = '울프';
const SAMPLE_CHANNELS = [1, 2];

const SIZE = 48;
const SCALE = 14 / 3;
const MARGIN = 8;

/** 색이 달라져도 이만큼 안 움직이는 픽셀은 칠하지 않는 픽셀(윤곽선, + 표시)로 본다. */
const FIXED_SPREAD = 4;
/** 명암은 한 바이트에 담는다. 100 이면 0.01 단위, 최대 2.55 배. */
const SHADE_SCALE = 100;
/** 다시 그린 그림이 넥슨 그림과 이보다 많이 다르면 파일을 쓰지 않는다. */
const MAX_ALLOWED_DIFF = 4;

const apiKey = process.env.NEXON_API_KEY;
if (!apiKey) {
  console.error('NEXON_API_KEY 가 없습니다. 환경변수로 넘겨 주세요.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/** 넥슨 그림은 8비트 RGBA PNG 다. 의존성을 늘리지 않으려고 필요한 만큼만 직접 푼다. */
function decodePng(buffer) {
  let pos = 8;
  let width = 0;
  let height = 0;
  const chunks = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0)
        throw new Error('8비트 RGBA PNG 가 아닙니다.');
    } else if (type === 'IDAT') {
      chunks.push(data);
    }
    pos += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? line[x - 4] : 0;
      const up = previous[x];
      const upLeft = x >= 4 ? previous[x - 4] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      line[x] = value & 255;
    }
    line.copy(pixels, y * stride);
    previous = line;
  }
  return { width, height, pixels };
}

/** 240px 그림을 48x48 픽셀 그림으로 되돌린다. */
function toGrid({ width, pixels }) {
  const grid = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = Math.floor(MARGIN + (x + 0.5) * SCALE);
      const sy = Math.floor(MARGIN + (y + 0.5) * SCALE);
      const from = (sy * width + sx) * 4;
      grid.set(pixels.subarray(from, from + 4), (y * SIZE + x) * 4);
    }
  }
  return grid;
}

/** "187,148,199" → [187, 148, 199] */
function parseRgb(value) {
  return String(value)
    .split(',')
    .map((part) => Number(part.trim()));
}

async function fetchShop(npc, channel) {
  const url = new URL('/mabinogi/v1/npcshop/list', API_ORIGIN);
  url.searchParams.set('npc_name', npc);
  url.searchParams.set('server_name', SAMPLE_SERVER);
  url.searchParams.set('channel', String(channel));
  const response = await fetch(url, { headers: { 'x-nxopen-api-key': apiKey } });
  if (!response.ok) throw new Error(`${npc} ${channel}채널: HTTP ${response.status}`);
  return response.json();
}

/** 종류별로 "색을 아는 그림" 을 모은다. */
async function collectSamples() {
  const byName = new Map();
  const noImage = new Set();
  for (const channel of SAMPLE_CHANNELS) {
    for (const npc of SELLERS) {
      const shop = await fetchShop(npc, channel);
      await sleep(250);
      for (const tab of shop.shop ?? []) {
        for (const item of tab.item ?? []) {
          const name = item.item_display_name ?? '';
          if (!BAG_NAME.test(name)) continue;
          if (!item.image_url) {
            noImage.add(name);
            continue;
          }
          const colors = (item.item_option ?? [])
            .filter((option) => option.option_type === '아이템 색상')
            .sort((a, b) => String(a.option_sub_type).localeCompare(String(b.option_sub_type)))
            .map((option) => parseRgb(option.option_value));
          if (!byName.has(name)) byName.set(name, []);
          byName.get(name).push({ url: item.image_url, colors });
        }
      }
    }
  }

  for (const [name, samples] of byName) {
    for (const sample of samples) {
      const response = await fetch(sample.url);
      if (!response.ok) throw new Error(`${name} 그림: HTTP ${response.status}`);
      sample.grid = toGrid(decodePng(Buffer.from(await response.arrayBuffer())));
      await sleep(50);
    }
  }
  return { byName, noImage };
}

/** min(255, s × c) 의 s 를 최소제곱으로. 255 에 걸린 표본은 정보가 모자라 빼고 푼다. */
function fitShade(inputs, outputs) {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < inputs.length; i++) {
    if (outputs[i] >= 255) continue;
    numerator += inputs[i] * outputs[i];
    denominator += inputs[i] * inputs[i];
  }
  const shade = denominator > 0 ? numerator / denominator : 0;
  return Math.min(255, Math.max(0, Math.round(shade * SHADE_SCALE)));
}

/**
 * 픽셀 하나를 푼다. 결과는 4바이트다.
 *   [0, 0, 0, 0]          투명
 *   [1, R, G, B]          칠하지 않는 픽셀. 그 색 그대로
 *   [2 + 파트, sR, sG, sB] 그 파트 색에 채널별 명암(÷ SHADE_SCALE)을 곱한다
 */
function solvePixel(samples, index, parts) {
  const alphas = samples.map((sample) => sample.grid[index * 4 + 3]);
  if (alphas.every((alpha) => alpha === 0)) return [0, 0, 0, 0];
  if (!alphas.every((alpha) => alpha === 255)) throw new Error(`반투명 픽셀이 있습니다(${index}).`);

  const values = samples.map((sample) => [0, 1, 2].map((k) => sample.grid[index * 4 + k]));
  const mean = [0, 1, 2].map(
    (k) => values.reduce((sum, value) => sum + value[k], 0) / values.length,
  );
  const spread = Math.max(...values.flatMap((value) => value.map((v, k) => Math.abs(v - mean[k]))));
  if (spread < FIXED_SPREAD) return [1, ...mean.map((v) => Math.round(v))];

  let best = null;
  for (let part = 0; part < parts; part++) {
    const shades = [0, 1, 2].map((k) =>
      fitShade(
        samples.map((sample) => sample.colors[part][k]),
        values.map((value) => value[k]),
      ),
    );
    const cell = [2 + part, ...shades];
    let error = 0;
    samples.forEach((sample, s) => {
      const painted = paint(cell, sample.colors);
      for (let k = 0; k < 3; k++) error += (painted[k] - values[s][k]) ** 2;
    });
    if (!best || error < best.error) best = { cell, error };
  }
  return best.cell;
}

/** 화면(src/features/bags/dye.ts 의 paintBag)과 같은 식. */
function paint(cell, colors) {
  const [kind, a, b, c] = cell;
  if (kind === 0) return [0, 0, 0];
  if (kind === 1) return [a, b, c];
  if (kind >= CELL_ADD_FIRST) {
    const offset = a === 1 ? -b : b;
    return colors[kind - CELL_ADD_FIRST].map((value) => Math.min(255, Math.max(0, value + offset)));
  }
  const color = colors[kind - 2];
  return [a, b, c].map((shade, k) => Math.min(255, Math.round((shade * color[k]) / SHADE_SCALE)));
}

function solveBag(samples) {
  const parts = samples[0].colors.length;
  const cells = new Uint8Array(SIZE * SIZE * 4);
  for (let index = 0; index < SIZE * SIZE; index++)
    cells.set(solvePixel(samples, index, parts), index * 4);

  // 다시 그려서 넥슨 그림과 대 본다.
  let worst = 0;
  for (const sample of samples) {
    for (let index = 0; index < SIZE * SIZE; index++) {
      if (cells[index * 4] === 0) continue;
      const painted = paint(cells.subarray(index * 4, index * 4 + 4), sample.colors);
      for (let k = 0; k < 3; k++)
        worst = Math.max(worst, Math.abs(painted[k] - sample.grid[index * 4 + k]));
    }
  }
  return { parts, cells, worst };
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * 넥슨 그림의 + 표시 자리. + 는 금색 가운데와 한두 칸 두께의 테두리로 된 칠하지 않는 픽셀
 * 덩어리다. 주머니마다 한두 칸씩 자리가 달라서 모양을 박아 두지 않고, 왼쪽 아래의 금색
 * 픽셀에서 시작해 이어진 칠하지 않는 픽셀을 세 칸까지 넓혀 잡는다.
 */
function findNexonPlus(cells) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const kindAt = (x, y) => cells[(y * SIZE + x) * 4];
  const isGold = (x, y) => {
    const o = (y * SIZE + x) * 4;
    return cells[o] === 1 && cells[o + 1] > 150 && cells[o + 2] > 100 && cells[o + 3] < 120;
  };

  const plus = new Set();
  let frontier = [];
  for (let y = SIZE / 2; y < SIZE; y++) {
    for (let x = 0; x < SIZE / 3; x++) {
      if (!isGold(x, y)) continue;
      plus.add(y * SIZE + x);
      frontier.push([x, y]);
    }
  }
  if (plus.size === 0)
    throw new Error('+ 표시를 찾지 못했습니다. 넥슨 그림이 바뀌었는지 확인하세요.');

  for (let step = 0; step < 3; step++) {
    const next = [];
    for (const [x, y] of frontier) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inside(nx, ny) || kindAt(nx, ny) !== 1 || plus.has(ny * SIZE + nx)) continue;
          plus.add(ny * SIZE + nx);
          next.push([nx, ny]);
        }
      }
    }
    frontier = next;
  }
  return plus;
}

/**
 * 가려진 구간의 가장자리 위치. 아는 값 사이면 잇고, 한쪽만 알면 그쪽의 기울기로 늘인다.
 * 기울기는 [minSlope, maxSlope] 로 묶는다. 둥근 주머니는 모서리로 갈수록 안으로 말려 들고,
 * 상자 주머니는 곧게 떨어진다. 그 밖으로 벗어나게 늘이면 주머니가 부풀거나 파인다.
 *
 * @param known 위치 → 가장자리 값
 * @param at 구할 위치
 * @param step 아는 값이 한쪽에만 있을 때 어느 쪽에서 늘일지(-1 이면 작은 쪽, 1 이면 큰 쪽)
 */
function extendEdge(known, at, step, minSlope, maxSlope) {
  if (known.has(at)) return known.get(at);
  const positions = [...known.keys()];
  const before = Math.max(-Infinity, ...positions.filter((p) => p < at));
  const after = Math.min(Infinity, ...positions.filter((p) => p > at));
  if (Number.isFinite(before) && Number.isFinite(after)) {
    const t = (at - before) / (after - before);
    return known.get(before) + (known.get(after) - known.get(before)) * t;
  }
  const from = step < 0 ? before : after;
  if (!Number.isFinite(from)) return null;
  const further = from + step * 2;
  const slope = known.has(further) ? (known.get(from) - known.get(further)) / 2 : 0;
  const clamped = Math.min(maxSlope, Math.max(minSlope, slope));
  return known.get(from) + clamped * Math.abs(at - from);
}

/**
 * + 를 지우고, 그 아래 가려져 있던 주머니를 되살린다.
 *
 * + 는 주머니의 왼쪽 아래 모서리에 걸쳐 있어서 모서리 윤곽이 통째로 가려져 있다. 그래서
 * 가려진 줄의 왼쪽 가장자리는 + 위쪽 줄들에서 보이는 가장자리를, 가려진 칸의 아래쪽
 * 가장자리는 + 오른쪽 칸들에서 보이는 가장자리를 이어 그어 되살린다. 그 안쪽만 주머니다.
 *
 * 되살린 자리는 가장자리면 남은 가장자리 픽셀(윤곽선)에서, 안쪽이면 남은 안쪽 픽셀에서
 * 가장 가까운 것을 옮겨 온다. 그래야 메운 자리에도 윤곽선이 이어진다.
 */
function fillUnderPlus(cells, plus) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const kept = (index) => !plus.has(index) && cells[index * 4] !== 0;
  const plusXs = [...plus].map((index) => index % SIZE);
  const plusYs = [...plus].map((index) => Math.floor(index / SIZE));

  // 줄마다 왼쪽 가장자리. 그 줄의 + 보다 왼쪽에 주머니가 보이면 가장자리를 아는 줄이다.
  const leftKnown = new Map();
  for (let y = 0; y < SIZE; y++) {
    const plusLeft = Math.min(Infinity, ...plusXs.filter((_, i) => plusYs[i] === y));
    for (let x = 0; x < SIZE; x++) {
      if (!kept(y * SIZE + x)) continue;
      if (x < plusLeft) leftKnown.set(y, x);
      break;
    }
  }
  // 칸마다 아래쪽 가장자리. 그 칸의 + 보다 아래에 주머니가 보이면 가장자리를 아는 칸이다.
  const bottomKnown = new Map();
  for (let x = 0; x < SIZE; x++) {
    const plusBottom = Math.max(-Infinity, ...plusYs.filter((_, i) => plusXs[i] === x));
    for (let y = SIZE - 1; y >= 0; y--) {
      if (!kept(y * SIZE + x)) continue;
      if (y > plusBottom) bottomKnown.set(x, y);
      break;
    }
  }

  const covered = new Set(
    [...plus].filter((index) => {
      const x = index % SIZE;
      const y = Math.floor(index / SIZE);
      // 아래로 내려갈수록 왼쪽 가장자리는 그대로이거나 안으로 들어온다(0 ~ 1.5칸).
      const left = extendEdge(leftKnown, y, -1, 0, 1.5);
      // 왼쪽으로 갈수록 아래쪽 가장자리는 그대로이거나 위로 올라온다(-1.5 ~ 0칸).
      const bottom = extendEdge(bottomKnown, x, 1, -1.5, 0);
      return left !== null && bottom !== null && x >= Math.round(left) && y <= Math.round(bottom);
    }),
  );

  const out = Uint8Array.from(cells);
  for (const index of plus) out.fill(0, index * 4, index * 4 + 4);
  const onEdge = (index) => {
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    return NEIGHBORS.some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny)) return true;
      const next = ny * SIZE + nx;
      return !covered.has(next) && out[next * 4] === 0;
    });
  };

  const sources = [];
  for (let index = 0; index < SIZE * SIZE; index++) if (kept(index)) sources.push(index);
  const edgeSources = sources.filter(onEdge);
  const innerSources = sources.filter((index) => !onEdge(index));
  for (const index of covered) {
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    let best = -1;
    let bestDistance = Infinity;
    for (const from of onEdge(index) ? edgeSources : innerSources) {
      const distance = ((from % SIZE) - x) ** 2 + (Math.floor(from / SIZE) - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = from;
      }
    }
    out.set(out.subarray(best * 4, best * 4 + 4), index * 4);
  }
  return out;
}

/** 클라이언트 아이콘을 받는다. 게임 아이콘은 완전히 투명하거나 불투명하다. */
async function fetchIcon(id) {
  // 아이콘 서버가 가끔 503 을 준다. 잠깐 쉬었다가 두 번 더 묻는다.
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(CLIENT_ICON_URL(id));
    if (response.ok) break;
    await sleep(1000 * (attempt + 1));
  }
  if (!response.ok) throw new Error(`아이콘 ${id}: HTTP ${response.status}`);
  const { width, pixels } = decodePng(Buffer.from(await response.arrayBuffer()));
  if (width !== SIZE) throw new Error(`아이콘 ${id} 가 ${SIZE}px 이 아닙니다(${width}px).`);
  return pixels;
}

/**
 * 캡처에서 아이콘 픽셀만 고른다. 배경(인벤토리 칸의 회색, 투명 표시 바둑판)은 가장자리에서
 * 회색으로 이어진 곳이고, 남은 것 가운데 가장 큰 덩어리가 아이콘이다. 칸 번호 숫자나 격자
 * 점처럼 떨어져 있는 것은 빠진다. 아이콘 안의 어두운 회색은 가장자리와 이어지지 않아 남는다.
 */
function captureIcon({ width, height, pixels }) {
  const isGray = (index) => {
    const [r, g, b] = [pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2]];
    return Math.abs(r - g) < 4 && Math.abs(g - b) < 4 && r >= 20 && r < 100;
  };
  const outside = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
  for (let k = 0; k < queue.length; k++) {
    const index = queue[k];
    if (outside[index] || !isGray(index)) continue;
    outside[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) queue.push(ny * width + nx);
    }
  }

  const seen = new Uint8Array(width * height);
  let icon = [];
  for (let start = 0; start < width * height; start++) {
    if (outside[start] || seen[start]) continue;
    const part = [start];
    seen[start] = 1;
    for (let k = 0; k < part.length; k++) {
      const x = part[k] % width;
      const y = Math.floor(part[k] / width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const next = ny * width + nx;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || outside[next] || seen[next])
            continue;
          seen[next] = 1;
          part.push(next);
        }
      }
    }
    if (part.length > icon.length) icon = part;
  }
  return new Set(icon);
}

/**
 * 캡처 한 장을 48x48 지도로 푼다. 아이콘을 칸 가운데에 둔다.
 * 픽셀마다 파트 색과의 차이가 세 채널에서 같아지는 파트가 있으면 그 파트를 더하기로 칠하는
 * 칸, 없으면 칠하지 않는 칸(창 안 허브, + 표시, 흰 바느질 점)이다. 0 이나 255 에 닿은 채널은
 * 잘린 값이라 차이를 재는 데 쓰지 않고, 잘린 방향만 맞는지 본다.
 */
function captureCells(image, colors) {
  const icon = captureIcon(image);
  const xs = [...icon].map((index) => index % image.width);
  const ys = [...icon].map((index) => Math.floor(index / image.width));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left + 1;
  const height = Math.max(...ys) - top + 1;
  if (width > SIZE || height > SIZE)
    throw new Error(`캡처의 아이콘이 ${width}x${height} 로 ${SIZE}px 보다 큽니다.`);
  const offsetX = left - Math.floor((SIZE - width) / 2);
  const offsetY = top - Math.floor((SIZE - height) / 2);

  const cells = new Uint8Array(SIZE * SIZE * 4);
  const original = new Map();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = x + offsetX;
      const sy = y + offsetY;
      const from = sy * image.width + sx;
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height || !icon.has(from)) continue;
      const value = [0, 1, 2].map((k) => image.pixels[from * 4 + k]);
      original.set(y * SIZE + x, value);

      let best = null;
      colors.forEach((color, part) => {
        const free = [0, 1, 2].filter((k) => value[k] > 0 && value[k] < 255);
        if (free.length < 2) return;
        const diffs = free.map((k) => value[k] - color[k]);
        const spread = Math.max(...diffs) - Math.min(...diffs);
        const offset = Math.round(diffs.reduce((sum, d) => sum + d, 0) / diffs.length);
        const clipped = [0, 1, 2].every((k) =>
          value[k] === 0
            ? color[k] + offset <= 2
            : value[k] === 255
              ? color[k] + offset >= 253
              : true,
        );
        if (clipped && (!best || spread < best.spread)) best = { part, spread, offset };
      });

      const cell =
        best && best.spread <= ADD_SPREAD
          ? [
              CELL_ADD_FIRST + best.part,
              best.offset < 0 ? 1 : 0,
              Math.min(255, Math.abs(best.offset)),
              0,
            ]
          : [1, ...value];
      cells.set(cell, (y * SIZE + x) * 4);
    }
  }
  return { cells, original };
}

/** 푼 지도를 캡처 때의 색으로 다시 칠해 캡처 원본과 대 본다. 풀이가 맞으면 그대로 돌아와야 한다. */
function captureWorst({ cells, original }, colors) {
  let worst = 0;
  for (const [index, value] of original) {
    const painted = paint(cells.subarray(index * 4, index * 4 + 4), colors);
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(painted[k] - value[k]));
  }
  return worst;
}

/** 가운데 쪽에서 시작해 이어진 칠하지 않는 픽셀 덩어리. 창 안이다. + 표시(왼쪽 아래)로는 번지지 않게 한다. */
function windowOf(cells, accept = () => true) {
  const inCenter = (x, y) => x >= 18 && x < 40 && y >= 14 && y < 44;
  const ok = (index) => cells[index * 4] === 1 && index % SIZE >= 16 && accept(index);
  let best = new Set();
  const seen = new Set();
  for (let index = 0; index < SIZE * SIZE; index++) {
    if (seen.has(index) || !ok(index) || !inCenter(index % SIZE, Math.floor(index / SIZE)))
      continue;
    const area = [index];
    seen.add(index);
    for (let k = 0; k < area.length; k++) {
      const x = area[k] % SIZE;
      const y = Math.floor(area[k] / SIZE);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        const next = ny * SIZE + nx;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || seen.has(next) || !ok(next)) continue;
        seen.add(next);
        area.push(next);
      }
    }
    if (area.length > best.size) best = new Set(area);
  }
  return best;
}

/** 클라이언트 아이콘에서 창 안 그림을 캡처의 창 자리로 옮길 때 어긋남. 캡처의 허브와 같은 허브 아이콘으로 찾는다. */
function alignIcon(cells, iconPixels) {
  const center = [];
  for (let index = 0; index < SIZE * SIZE; index++) {
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    if (cells[index * 4] === 1 && x >= 18 && x < 40 && y >= 14 && y < 44) center.push(index);
  }
  const same = (index, dx, dy) => {
    const x = (index % SIZE) + dx;
    const y = Math.floor(index / SIZE) + dy;
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
    const o = (y * SIZE + x) * 4;
    return (
      iconPixels[o + 3] >= 128 &&
      [0, 1, 2].every((k) => Math.abs(iconPixels[o + k] - cells[index * 4 + 1 + k]) <= 3)
    );
  };
  let best = { dx: 0, dy: 0, count: -1 };
  for (let dy = -12; dy <= 12; dy++) {
    for (let dx = -12; dx <= 12; dx++) {
      const count = center.filter((index) => same(index, dx, dy)).length;
      if (count > best.count) best = { dx, dy, count };
    }
  }
  const window = windowOf(cells, (index) => same(index, best.dx, best.dy));
  return { ...best, window };
}

/** 색 목록에서 가장 흔한 색. */
function mostCommon(values) {
  const counts = new Map();
  for (const value of values) counts.set(value.join(','), (counts.get(value.join(',')) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])[0][0]
    .split(',')
    .map(Number);
}

/** 창 안(window)을 다른 허브의 창 안 그림으로 바꾼다. 아이콘 좌표 = 창 좌표 + (dx, dy). */
function swapWindow(cells, window, iconPixels, dx, dy) {
  const out = Uint8Array.from(cells);
  for (const index of window) {
    const x = (index % SIZE) + dx;
    const y = Math.floor(index / SIZE) + dy;
    const o = (y * SIZE + x) * 4;
    out.set([1, iconPixels[o], iconPixels[o + 1], iconPixels[o + 2]], index * 4);
  }
  return out;
}

/**
 * 튼튼한 쪽 창에 더 튼튼한 쪽 허브 그림을 옮겨 넣는다. 두 창은 모양이 달라 픽셀을 그대로
 * 옮길 수 없다. 창을 창 바탕색으로 비우고, 허브 그림(더 튼튼한 창에서 바탕색이 아닌 픽셀)을
 * 두 창의 가운데를 맞춰 찍는다. 창을 벗어나는 픽셀은 버린다.
 */
function transplantHerb(cells, window, iconPixels, sturdierWindow, dx, dy) {
  const out = Uint8Array.from(cells);
  const background = mostCommon(
    [...window].map((index) => [...cells.subarray(index * 4 + 1, index * 4 + 4)]),
  );
  for (const index of window) out.set([1, ...background], index * 4);

  const iconAt = (index) => {
    const o = ((Math.floor(index / SIZE) + dy) * SIZE + (index % SIZE) + dx) * 4;
    return [iconPixels[o], iconPixels[o + 1], iconPixels[o + 2]];
  };
  const herbBackground = mostCommon([...sturdierWindow].map(iconAt)).join(',');
  const centerOf = (set) => {
    const list = [...set];
    return [
      Math.round(list.reduce((sum, index) => sum + (index % SIZE), 0) / list.length),
      Math.round(list.reduce((sum, index) => sum + Math.floor(index / SIZE), 0) / list.length),
    ];
  };
  const [fromX, fromY] = centerOf(sturdierWindow);
  const [toX, toY] = centerOf(window);
  for (const index of sturdierWindow) {
    const color = iconAt(index);
    if (color.join(',') === herbBackground) continue;
    const target = (Math.floor(index / SIZE) - fromY + toY) * SIZE + (index % SIZE) - fromX + toX;
    if (window.has(target)) out.set([1, ...color], target * 4);
  }
  return out;
}

/** 캡처의 + 표시(왼쪽 아래의 칠하지 않는 픽셀)를 떼어 온다. */
function plusSprite(cells) {
  const sprite = [];
  for (let y = SIZE / 2; y < SIZE; y++) {
    for (let x = 0; x < 20; x++) {
      const index = y * SIZE + x;
      if (cells[index * 4] === 1)
        sprite.push({ x, y, color: [...cells.subarray(index * 4 + 1, index * 4 + 4)] });
    }
  }
  // 2026-09-24 캡처에서 70픽셀 남짓이었다.
  if (sprite.length < 40 || sprite.length > 120)
    throw new Error(`캡처의 + 표시가 ${sprite.length}픽셀로 잡혔습니다.`);
  return sprite;
}

/** 지운 + 자리(plus)의 가운데에 주황 + 를 찍는다. */
function stampPlus(cells, plus, sprite) {
  const out = Uint8Array.from(cells);
  const box = (xs, ys) => [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
  const [toX, toY] = box(
    [...plus].map((i) => i % SIZE),
    [...plus].map((i) => Math.floor(i / SIZE)),
  );
  const [fromX, fromY] = box(
    sprite.map((p) => p.x),
    sprite.map((p) => p.y),
  );
  const dx = Math.round(toX - fromX);
  const dy = Math.round(toY - fromY);
  for (const { x, y, color } of sprite) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) out.set([1, ...color], (ny * SIZE + nx) * 4);
  }
  return out;
}

async function loadCapture(file) {
  const { readFile } = await import('node:fs/promises');
  return decodePng(await readFile(resolve(process.cwd(), file)));
}

const plainCapture = await loadCapture(HERB_CAPTURES.plain.file);
const sturdierCapture = await loadCapture(HERB_CAPTURES.sturdier.file);
const plainSolved = captureCells(plainCapture, HERB_CAPTURES.plain.colors);
const sturdierSolved = captureCells(sturdierCapture, HERB_CAPTURES.sturdier.colors);
const plainBase = plainSolved.cells;
const sturdierBase = sturdierSolved.cells;
const orangePlus = plusSprite(plainBase);

const { byName, noImage } = await collectSamples();
const bags = {};
let failed = false;
for (const [name, samples] of [...byName].sort(([a], [b]) => a.localeCompare(b, 'ko'))) {
  const { parts, cells, worst } = solveBag(samples);
  const plus = findNexonPlus(cells);
  const clean = stampPlus(fillUnderPlus(cells, plus), plus, orangePlus);
  console.log(
    `${name}: 표본 ${samples.length}장, 파트 ${parts}개, 넥슨 그림과 최대 차이 ${worst}, 노란 + ${plus.size}픽셀을 주황 + 로 바꿈`,
  );
  if (worst > MAX_ALLOWED_DIFF) failed = true;
  bags[name] = { parts, cells: Buffer.from(clean).toString('base64') };
}

// 허브 주머니. 먼저 캡처의 허브와 같은 허브 아이콘으로 창 자리를 맞춘다.
const herbIcons = {};
for (const [herb, id] of Object.entries(HERB_ICON_IDS)) {
  herbIcons[herb] = (await fetchIcon(id)).subarray();
  await sleep(200);
}
const aligned = alignIcon(sturdierBase, herbIcons[HERB_CAPTURES.sturdier.herb]);
console.log(
  `더 튼튼한 창: 캡처와 아이콘이 ${aligned.count}픽셀 일치, 창 ${aligned.window.size}픽셀, 어긋남 (${aligned.dx}, ${aligned.dy})`,
);
if (aligned.window.size < 40) {
  console.error(
    '더 튼튼한 쪽 창 안이 클라이언트 아이콘과 맞지 않습니다. 캡처나 아이콘이 바뀌었는지 확인하세요.',
  );
  failed = true;
}
const plainWindow = windowOf(plainBase);
console.log(`튼튼한 창: ${plainWindow.size}픽셀`);

for (const herb of Object.keys(HERB_ICON_IDS)) {
  const icon = herbIcons[herb];
  const sturdier = swapWindow(sturdierBase, aligned.window, icon, aligned.dx, aligned.dy);
  const plain =
    herb === HERB_CAPTURES.plain.herb
      ? plainBase
      : transplantHerb(plainBase, plainWindow, icon, aligned.window, aligned.dx, aligned.dy);
  bags[`더 튼튼한 ${herb}`] = { parts: 3, cells: Buffer.from(sturdier).toString('base64') };
  bags[`튼튼한 ${herb}`] = { parts: 2, cells: Buffer.from(plain).toString('base64') };
}

// 풀이 확인: 캡처의 주머니를 그때 색으로 다시 칠하면 캡처와 같아야 한다.
for (const [key, solved] of [
  ['plain', plainSolved],
  ['sturdier', sturdierSolved],
]) {
  const worst = captureWorst(solved, HERB_CAPTURES[key].colors);
  console.log(`${HERB_CAPTURES[key].herb}(${key}) 캡처와 최대 차이 ${worst}`);
  if (worst > MAX_ALLOWED_DIFF) failed = true;
}

// 넥슨이 그림을 주지 않았는데 지도도 없는 주머니가 생기면(새 허브가 나오면) 알린다.
for (const name of noImage) {
  if (bags[name]) continue;
  console.error(
    `${name}: 넥슨 그림도 클라이언트 아이콘 번호도 없습니다. HERB_ICON_IDS 에 더해 주세요.`,
  );
  failed = true;
}

if (failed) {
  console.error('문제가 있어 파일을 쓰지 않습니다.');
  process.exit(1);
}

await mkdir(resolve(OUT_FILE, '..'), { recursive: true });
await writeFile(
  OUT_FILE,
  `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), size: SIZE, shadeScale: SHADE_SCALE, bags })}\n`,
);
console.log(`${Object.keys(bags).length}종을 ${OUT_FILE} 에 썼습니다.`);
