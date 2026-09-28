/**
 * 세공 도구 확률표 모으기
 *
 * 세공 시뮬레이터는 도구, 아이템 타입, 종족마다 "붙을 수 있는 옵션과 그 레벨 폭" 을 알아야 한다.
 * 게임 클라이언트 데이터에는 옵션 목록과 레벨 상한 기준값만 있고 도구마다의 레벨 폭은 없다.
 * 공개된 세공 도구 확률표에는 그것이 다 있다.
 *
 * 확률표가 말하는 규칙(세공 도구 가이드):
 * - 옵션은 줄마다 남은 옵션 중에서 똑같은 확률로 하나씩, 겹치지 않게 뽑힌다.
 * - 한계 돌파가 되는 옵션이 뽑히면 도구별 확률로 한계 돌파 구간에 들어간다. 들어가면 그 구간의
 *   레벨 중 하나가, 아니면 일반 구간의 레벨 중 하나가 똑같은 확률로 정해진다.
 * 확률표는 랭크를 고르게 되어 있지만 세공은 늘 1랭크 세 줄로 붙는다. 1랭크 표만 쓴다.
 *
 * 레벨별 확률은 옵션마다 따로 묻는 표라 요청이 많다. 같은 도구에서 같은 옵션이 같은 레벨 폭으로
 * 나오면 구간이 같으므로 한 번만 묻는다. 받은 응답은 .cache/reforge 에 두고 다시 돌릴 때 쓴다.
 *
 * 실행: node scripts/build-reforge.mjs
 * 산출: public/data/reforge.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ORIGIN = 'https://mabinogi.nexon.com/itemshop/';
const OUT = resolve('public/data/reforge.json');
const CACHE_DIR = resolve('.cache/reforge');

/** 확률표의 도구 번호. randomset 의 첫 자리가 도구마다 다르다. */
const TOOLS = [
  { id: 'fine', code: '5050005_1', prefix: '1', name: '정교한 세공 도구' },
  { id: 'radiant', code: '5050013', prefix: '4', name: '영롱한 세공 도구' },
  { id: 'brilliant', code: '5050020', prefix: '6', name: '찬란한 세공 도구' },
];

/** 확률표의 종족 번호 순서 그대로. */
const RACES = ['공용', '인간/엘프', '인간/자이언트', '인간', '엘프', '자이언트'];

/** 1랭크. 확률표가 랭크 칸에 쓰는 값이다. */
const RANK = '3';

const decoder = new TextDecoder('euc-kr');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function post(path, fields) {
  const body = new URLSearchParams(fields).toString();
  const key = createHash('sha1').update(`${path}?${body}`).digest('hex').slice(0, 16);
  const cached = resolve(CACHE_DIR, `${key}.html`);
  try {
    return await readFile(cached, 'utf8');
  } catch {
    // 처음 묻는 것
  }
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(ORIGIN + path, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          referer: `${ORIGIN}metalware_new.asp`,
          'user-agent': 'Mozilla/5.0',
        },
        body,
      });
      if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`);
      const text = decoder.decode(await response.arrayBuffer());
      await writeFile(cached, text);
      await sleep(120);
      return text;
    } catch (error) {
      if (attempt >= 4) throw error;
      await sleep(1000 * attempt);
    }
  }
}

async function get(path) {
  const response = await fetch(ORIGIN + path, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`);
  return decoder.decode(await response.arrayBuffer());
}

const decodeEntities = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const stripTags = (html) =>
  decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/** 도구 첫 화면: 가장 최근 표의 날짜와 한계 돌파 구간 진입 확률. */
async function readLanding(tool) {
  const html = await get(`metalware_new.asp?tooltype=${tool.code}`);
  const date = html.match(/name="datenum" value="(\d{8})"/)?.[1];
  const text = stripTags(html.slice(html.indexOf('<body')));
  const rate = text.match(/한계 돌파 구간 진입 확률 확률 ([\d.]+)%/)?.[1];
  if (!date || !rate) throw new Error(`${tool.name}: 표 날짜나 한계 돌파 확률을 찾지 못했습니다.`);
  return { date, limitBreakRate: Number(rate) / 100 };
}

async function readTypes(tool, date) {
  const html = await post('metalware_json.asp', {
    depth1: RANK,
    tooltype: tool.code,
    datenum: date,
  });
  const types = [...html.matchAll(/data-depth2="([^"]*)" num-depth2="(\d+)"/g)].map((match) => ({
    id: Number(match[2]),
    name: decodeEntities(match[1]).trim(),
  }));
  if (types.length < 30) throw new Error(`${tool.name}: 아이템 타입이 ${types.length}개뿐입니다.`);
  return types;
}

/** 옵션 표 한 장. 없는 조합이면 null. */
async function readTable(tool, typeId, race, date) {
  const randomset = `${tool.prefix}${RANK}${String(typeId).padStart(3, '0')}0${race}1`;
  const html = await post('metalware_detail_new.asp', {
    tooltype: tool.code,
    randomset,
    depth1: '1',
    depth2: '',
    depth3: '',
    datenum: date,
    event: '',
  });
  if (html.includes('존재하지 않는 조합')) return null;
  const rows = [];
  const pattern =
    /<tr class="option" onclick="detailclick[\s\S]*?data-optionname="([^"]*)" data-rate="([\d.]+)">([\s\S]*?)<\/tr>/g;
  for (const match of html.matchAll(pattern)) {
    const cells = [...match[3].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
    const range = stripTags(cells[2] ?? '').match(/^(\d+)\s*-\s*(\d+)$/);
    if (!range) throw new Error(`${randomset}: 레벨 칸을 읽지 못했습니다. ${cells[2]}`);
    rows.push({
      name: decodeEntities(match[1]).trim(),
      rate: Number(match[2]),
      min: Number(range[1]),
      max: Number(range[2]),
      limitBreak: match[3].includes('metalware_d_icon'),
    });
  }
  if (rows.length === 0) throw new Error(`${randomset}: 옵션 줄이 없습니다.`);
  // 가이드대로라면 첫 줄 확률은 모두 같다. 아니면 이 시뮬레이터의 전제가 무너진 것이다.
  const expected = 100 / rows.length;
  const odd = rows.filter((row) => Math.abs(row.rate - expected) > 0.001);
  if (odd.length)
    throw new Error(`${randomset}: 옵션 확률이 고르지 않습니다. ${odd[0].name} ${odd[0].rate}%`);
  return { randomset, rows };
}

/** 한계 돌파가 되는 옵션의 레벨별 확률. 일반 구간과 한계 돌파 구간을 가른다. */
async function readSplit(randomset, row, date, limitBreakRate) {
  const html = await post('depth4_new.asp', {
    randomset,
    ability: escape(row.name),
    datenum: date,
  });
  const levels = [...html.matchAll(/<td>(\d+)<\/td>\s*<td>([\d.]+)%<\/td>/g)].map((match) => ({
    level: Number(match[1]),
    rate: Number(match[2]) / 100,
  }));
  if (levels.length !== row.max - row.min + 1) {
    throw new Error(`${randomset} ${row.name}: 레벨이 ${levels.length}줄입니다.`);
  }
  const top = Math.max(...levels.map((entry) => entry.rate));
  const normal = levels.filter((entry) => entry.rate > top / 2);
  const broken = levels.filter((entry) => entry.rate <= top / 2);
  const split = {
    max: Math.max(...normal.map((entry) => entry.level)),
    lbMin: broken.length ? Math.min(...broken.map((entry) => entry.level)) : 0,
  };
  // 표의 확률이 "고르게 + 도구별 진입 확률" 로 설명되는지 본다. 표기는 넷째 자리에서 끊긴다.
  for (const entry of levels) {
    const expected =
      entry.level <= split.max
        ? (broken.length ? 1 - limitBreakRate : 1) / normal.length
        : limitBreakRate / broken.length;
    if (Math.abs(entry.rate - expected) > 0.00002) {
      throw new Error(
        `${randomset} ${row.name} ${entry.level}레벨: ${entry.rate} (예상 ${expected})`,
      );
    }
  }
  return split;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  const optionIndex = new Map();
  const optionOf = (name) => {
    if (!optionIndex.has(name)) optionIndex.set(name, optionIndex.size);
    return optionIndex.get(name);
  };
  const typeNames = new Map();
  const poolIndex = new Map();
  const pools = [];
  const tables = {};
  const tools = [];

  for (const tool of TOOLS) {
    const { date, limitBreakRate } = await readLanding(tool);
    const types = await readTypes(tool, date);
    const splits = new Map();
    let count = 0;

    for (const type of types) {
      typeNames.set(type.id, type.name);
      for (let race = 0; race < RACES.length; race += 1) {
        const table = await readTable(tool, type.id, race, date);
        if (!table) continue;
        const pool = [];
        for (const row of table.rows) {
          if (!row.limitBreak) {
            pool.push([optionOf(row.name), row.min, row.max]);
            continue;
          }
          const key = `${row.name}|${row.min}|${row.max}`;
          if (!splits.has(key))
            splits.set(key, await readSplit(table.randomset, row, date, limitBreakRate));
          const split = splits.get(key);
          pool.push(
            split.lbMin
              ? [optionOf(row.name), row.min, split.max, split.lbMin, row.max]
              : [optionOf(row.name), row.min, row.max],
          );
        }
        pool.sort((a, b) => a[0] - b[0]);
        const poolKey = JSON.stringify(pool);
        if (!poolIndex.has(poolKey)) {
          poolIndex.set(poolKey, pools.length);
          pools.push(pool);
        }
        tables[`${tool.id}|${type.id}|${race}`] = poolIndex.get(poolKey);
        count += 1;
      }
      process.stdout.write(`\r[reforge] ${tool.name} ${type.name} ...          `);
    }
    tools.push({ id: tool.id, name: tool.name, date, limitBreakRate });
    console.log(
      `\n[reforge] ${tool.name}: 표 ${count}장, 한계 돌파 구간 ${splits.size}종 (${date})`,
    );
  }

  const types = [...typeNames].map(([id, name]) => ({ id, name })).sort((a, b) => a.id - b.id);
  // 한 줄에 하나씩 적어 다음 수집 때 무엇이 바뀌었는지 diff 로 보이게 한다.
  const body = [
    '{',
    `"tools":${JSON.stringify(tools)},`,
    `"races":${JSON.stringify(RACES)},`,
    `"types":${JSON.stringify(types)},`,
    '"options":[',
    [...optionIndex.keys()].map((name) => JSON.stringify(name)).join(',\n'),
    '],',
    '"pools":[',
    pools.map((pool) => JSON.stringify(pool)).join(',\n'),
    '],',
    `"tables":${JSON.stringify(tables)}`,
    '}',
    '',
  ].join('\n');
  await writeFile(OUT, body);
  console.log(
    `[reforge] 옵션 ${optionIndex.size}종, 서로 다른 옵션 묶음 ${pools.length}개, 표 ${Object.keys(tables).length}장 -> ${OUT}`,
  );
}

await main();
