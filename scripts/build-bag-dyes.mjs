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
 * 허브 주머니 10종은 넥슨이 그림 주소를 비워서 준다. 그림이 없으니 풀 수도 없다. 화면은 그
 * 주머니들을 색 칸으로 대신한다.
 *
 * 실행: NEXON_API_KEY=... node scripts/build-bag-dyes.mjs
 * 산출: public/bags/dyes.json
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

const API_ORIGIN = 'https://open.api.nexon.com';
const OUT_FILE = resolve(process.cwd(), 'public/bags/dyes.json');

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
  return { width, pixels };
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
          if (!name.startsWith('튼튼한')) continue;
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

const { byName, noImage } = await collectSamples();
const bags = {};
let failed = false;
for (const [name, samples] of [...byName].sort(([a], [b]) => a.localeCompare(b, 'ko'))) {
  const { parts, cells, worst } = solveBag(samples);
  console.log(`${name}: 표본 ${samples.length}장, 파트 ${parts}개, 넥슨 그림과 최대 차이 ${worst}`);
  if (worst > MAX_ALLOWED_DIFF) failed = true;
  bags[name] = { parts, cells: Buffer.from(cells).toString('base64') };
}
if (noImage.size > 0) console.log(`그림이 없는 주머니: ${[...noImage].sort().join(', ')}`);

if (failed) {
  console.error(`넥슨 그림과 ${MAX_ALLOWED_DIFF} 넘게 다른 주머니가 있어 파일을 쓰지 않습니다.`);
  process.exit(1);
}

await mkdir(resolve(OUT_FILE, '..'), { recursive: true });
await writeFile(
  OUT_FILE,
  `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), size: SIZE, shadeScale: SHADE_SCALE, bags })}\n`,
);
console.log(`${Object.keys(bags).length}종을 ${OUT_FILE} 에 썼습니다.`);
