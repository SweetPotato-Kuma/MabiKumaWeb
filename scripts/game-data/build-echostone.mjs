#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { defaultBundleRoot, koreaFeatures } from './bundle-items.mjs';

/**
 * 에코스톤 각성 시뮬레이터의 데이터를 게임 클라이언트 데이터에서 만든다.
 *
 * 각성 규칙(EchoStoneAwakening.xml):
 * - 돌 종류마다 각성 능력 목록과 가중치(Rate)가 있다. 가중치에 비례해 능력 하나를 고른다.
 *   Gradefilter 가 붙은 능력은 그 등급 이상인 돌에서만 나온다.
 * - 능력마다 최대 레벨(1, 3, 5, 6, 10, 20)이 있고, 레벨은 그 최대 레벨의 레벨별 가중치(CorrectionByLevel)로 고른다.
 * - 돌 등급(1~30)이 최대 레벨 무리마다 나올 수 있는 가장 높은 레벨을 정한다(CorrectionByGrade).
 * - 각성제가 최대 레벨 무리마다 그 레벨 이하를 빼 준다(CorrectionByItem). 0 이면 빼지 않는다.
 *
 * 능력 이름과 레벨당 수치는 세공 능력 설명표(ItemMetalRealview)에서 찾는다. 같은 능력이 기능에 따라 여러 줄이면
 * 한국 정식 서버에서 켜진 것 중 나중 줄을 쓴다.
 *
 *   node scripts/game-data/build-echostone.mjs
 *
 * 입력: `.cache/client-src/exports/game-data`(다른 곳이면 MABIKUMA_GAME_DATA)의 latest.json 이 가리키는 실행,
 *       기능 판정은 client-bundle 의 최신 실행.
 * 산출: src/features/echostone/data.json
 */

const GAME_DATA_ROOT = resolve(
  process.cwd(),
  process.env.MABIKUMA_GAME_DATA ?? '.cache/client-src/exports/game-data',
);
const OUT = resolve(process.cwd(), 'src/features/echostone/data.json');

/** 돌 번호 순서. 고유 능력(체력, 지력, 솜씨, 의지, 생명력/마나/스태미나)으로 경매장 이름과 맞췄다. */
const STONE_NAMES = [
  '레드 에코스톤',
  '블루 에코스톤',
  '옐로 에코스톤',
  '실버 에코스톤',
  '블랙 에코스톤',
];

const latestRun = (root) =>
  resolve(root, JSON.parse(readFileSync(resolve(root, 'latest.json'), 'utf8')).run);

/** "a&!b" 같은 기능 조건이 한국 정식 서버에서 성립하는지. 비어 있으면 늘 성립한다. */
function featureHolds(expression, enabled) {
  if (!expression) return true;
  return expression.split('&').every((token) => {
    const negated = token.startsWith('!');
    const on = enabled.get(token.replace(/^!/, '')) === true;
    return negated ? !on : on;
  });
}

/** "1:1|3:1|20:2|" 를 { 1: 1, 3: 1, 20: 2 } 로. */
function parsePairs(text) {
  const map = {};
  for (const pair of text.split('|').filter(Boolean)) {
    const [key, value] = pair.split(':').map(Number);
    map[key] = value;
  }
  return map;
}

const attributes = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([A-Za-z_]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
  );

const tags = (xml, name) =>
  [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(([tag]) => attributes(tag));

/** 레벨당 수치 뒤에 붙는 단위 가운데 화면에 그대로 붙여 읽히는 것. */
const UNITS = new Set(['%', 'm', 'cm', '초', '배', '개', '마리', '명', '도', '비율', '도르카']);

/**
 * "실드 마스터리 방패 착용시 방어 보너스 (1레벨 당 1 증가)" 를 이름과 단위로 나눈다. 끝의 괄호(안에 괄호가 더
 * 있을 수 있다)를 떼어 이름으로 쓰고, 괄호 안 "레벨 당" 뒤의 단위를 수치에 붙인다. 괄호가 없으면 수치가 없는
 * 능력이다("돌진 인간 및 엘프일 때 방패 없이 사용 가능").
 */
function splitDescription(desc) {
  const text = desc.trim();
  if (!text.endsWith(')')) return { name: text, unit: null };
  let depth = 0;
  let open = -1;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (text[i] === ')') depth += 1;
    else if (text[i] === '(' && --depth === 0) {
      open = i;
      break;
    }
  }
  if (open <= 0) return { name: text, unit: null };
  const unit = text.slice(open).match(/레벨 당\s*[-\d.]+\s*([^\s,)]*)/)?.[1] ?? '';
  return { name: text.slice(0, open).trim(), unit: UNITS.has(unit) ? unit : '' };
}

function main() {
  const run = latestRun(GAME_DATA_ROOT);
  const enabled = koreaFeatures(latestRun(defaultBundleRoot()));

  const xml = readFileSync(
    resolve(run, 'raw/db_00000/data/db/EchoStone/EchoStoneAwakening.xml'),
  ).toString('utf16le');

  const realview = new Map();
  const realviewRows = gunzipSync(
    readFileSync(resolve(run, 'tables/db_00001/data/db/ItemMetalRealview.xml.jsonl.gz')),
  )
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  for (const row of realviewRows) {
    const code = row.attributes?.ability?.replace(/\s/g, '');
    if (!code || !row.localized?.desc || !featureHolds(row.attributes.feature, enabled)) continue;
    realview.set(code, row);
  }

  const abilities = [];
  const indexById = new Map();
  for (const set of tags(xml.slice(xml.indexOf('<AbilityList>')), 'Set')) {
    if (!set.AbilityId || !featureHolds(set.__feature, enabled)) continue;
    const code = set.ability.replace(/\s/g, '');
    const row = realview.get(code);
    if (!row) throw new Error(`능력 ${set.AbilityId} (${code}) 의 이름이 없습니다.`);
    const { name, unit } = splitDescription(row.localized.desc);
    indexById.set(set.AbilityId, abilities.length);
    abilities.push({
      id: Number(set.AbilityId),
      name,
      maxLevel: Number(set.levmax),
      // 수치가 없는 능력("방패 없이 사용 가능")은 레벨만 보인다.
      value:
        unit === null
          ? null
          : { min: Number(row.attributes.min), gap: Number(row.attributes.gap), unit },
    });
  }

  const randomTable = xml.slice(xml.indexOf('<RandomTable>'), xml.indexOf('</RandomTable>'));
  const stones = randomTable
    .split('<Stone ')
    .slice(1)
    .map((block) => {
      const stoneId = Number(attributes(block.slice(0, block.indexOf('>'))).StoneId);
      const pool = tags(block, 'RandomSet')
        .filter((entry) => featureHolds(entry.__feature, enabled) && indexById.has(entry.AbilityId))
        .map((entry) => {
          const row = [indexById.get(entry.AbilityId), Number(entry.Rate)];
          return entry.Gradefilter ? [...row, Number(entry.Gradefilter)] : row;
        });
      return { id: stoneId, name: STONE_NAMES[stoneId - 1], pool };
    });

  const gradeCaps = Object.fromEntries(
    tags(xml, 'Grade').map((grade) => [grade.StoneGrade, parsePairs(grade.levelMaxByGrade)]),
  );
  const levelWeights = Object.fromEntries(
    tags(xml, 'MaxLevel').map((entry) => {
      const weights = parsePairs(entry.levelMaxByLevel);
      return [
        entry.levelmax,
        Array.from({ length: Number(entry.levelmax) }, (_, i) => weights[i + 1] ?? 0),
      ];
    }),
  );

  const itemNames = new Map(
    readFileSync(resolve(latestRun(defaultBundleRoot()), 'assets/items.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((item) => [item.id, item.name]),
  );
  // 같은 이름의 각성제가 번호만 달리 둘 있다(최고급). 이름이 같으면 효과도 같아 하나만 둔다.
  const boosters = [];
  for (const item of tags(xml, 'Item')) {
    const name = itemNames.get(item.itemid);
    if (!name || boosters.some((each) => each.name === name)) continue;
    boosters.push({ name, floor: parsePairs(item.levelMinByItem) });
  }

  return { stones, abilities, gradeCaps, levelWeights, boosters };
}

const data = main();
await writeFile(OUT, `${JSON.stringify(data, null, 1)}\n`);
console.log(
  `에코스톤 ${data.stones.length}종, 각성 능력 ${data.abilities.length}개, 각성제 ${data.boosters.length}종 -> ${OUT}`,
);
