import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * 장인 개조 확률. 클라이언트에는 장인 개조가 몇 번 확률표를 쓰는지(ItemUpgradeDB 의 luckyupgrade(번호))만 있고
 * 확률은 없다. 넥슨 공식 홈페이지의 확률 공개 페이지에서 읽는다.
 *
 *   목록  https://mabinogi.nexon.com/itemshop/prob2.asp          번호(data)와 이름(data-depth2)
 *   상세  prob2_detail.asp?setid=<번호>&setname=<이름>            옵션 개수 확률표, 옵션 확률표
 *
 * 공식 페이지의 번호는 luckyupgrade 번호와 같다. 이름은 페이지가 쓰는 cp949 바이트 그대로 퍼센트 인코딩해야
 * 상세가 나온다. 목록의 바이트를 그대로 옮기므로 문자 변환표가 필요 없다.
 *
 * 받은 페이지는 .cache/equipment/artisan-odds 에 남겨 두고 다시 묻지 않는다. 처음 보는 번호만 받는다.
 * 사이에 1초씩 쉰다. refresh 로 모두 다시 받는다.
 */

const BASE = 'https://mabinogi.nexon.com/itemshop';
const PAUSE_MS = 1000;
const LIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const decoder = new TextDecoder('euc-kr');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (mabikuma data build)' },
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** 목록: 번호 -> 이름의 퍼센트 인코딩(cp949 바이트). */
export function parseOddsList(bytes) {
  const latin = bytes.toString('latin1');
  const sets = new Map();
  for (const [, name, id] of latin.matchAll(/data-depth2="([^"]*)"[^>]*\sdata="(\d+)"/g)) {
    if (sets.has(Number(id))) continue;
    const encoded = [...Buffer.from(name, 'latin1')]
      .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
      .join('');
    sets.set(Number(id), encoded);
  }
  return sets;
}

const cellText = (html) =>
  html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 상세: { counts: [[개수, %]], options: [[문장, %]] }. 표마다 앞의 제목("옵션 개수 출현 확률", "옵션 선택
 * 확률")으로 가른다.
 */
export function parseOddsDetail(bytes) {
  return parseOddsHtml(decoder.decode(bytes));
}

/** 이미 글자로 푼 상세 페이지. */
export function parseOddsHtml(html) {
  const out = { counts: [], options: [] };
  let section = '';
  for (const [block] of html.matchAll(
    /<h4[\s\S]*?<\/h4>|<table class="prod_table">[\s\S]*?<\/table>/g,
  )) {
    if (block.startsWith('<h4')) {
      section = cellText(block);
      continue;
    }
    const rows = [...block.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
      [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => cellText(cell)),
    );
    const pct = (text) => Number(String(text).replace('%', ''));
    if (/개수/.test(section)) out.counts = rows.map(([count, rate]) => [Number(count), pct(rate)]);
    // 옵션 표 끝에 확률 대신 "고정 효과" 라고 적힌 줄은 늘 붙는 효과다. 개조 효과(modify)와 같아서 뺀다.
    else if (/옵션/.test(section))
      out.options = rows
        .map(([text, rate]) => [text, pct(rate)])
        .filter(([, rate]) => Number.isFinite(rate));
  }
  return out;
}

/**
 * @param ids 필요한 장인 개조 번호
 * @returns 번호 -> { counts, options }. 공식 페이지에 없는 번호는 빠진다.
 */
export async function loadArtisanOdds(
  ids,
  {
    cacheDir = resolve(process.cwd(), '.cache/equipment/artisan-odds'),
    refresh = false,
    log = () => {},
  } = {},
) {
  await mkdir(cacheDir, { recursive: true });
  const cached = async (file) =>
    refresh ? null : readFile(resolve(cacheDir, file)).catch(() => null);
  const wanted = [...new Set(ids)].sort((a, b) => a - b);
  const odds = new Map();
  const missing = [];
  for (const id of wanted) {
    const bytes = await cached(`${id}.html`);
    if (bytes) odds.set(id, parseOddsDetail(bytes));
    else missing.push(id);
  }
  if (!missing.length) return odds;

  let list = await cached('list.html');
  let names = list ? parseOddsList(list) : new Map();
  // 목록에 없는 번호가 있으면 목록이 낡았을 수 있다. 하루 지난 목록이면 한 번 다시 받는다. 공식 페이지에 없는
  // 번호(아직 공개 전인 것)도 있어서 매번 받지는 않는다.
  const listAge = await stat(resolve(cacheDir, 'list.html'))
    .then((info) => Date.now() - info.mtimeMs)
    .catch(() => Infinity);
  if (!list || (missing.some((id) => !names.has(id)) && listAge > LIST_MAX_AGE_MS)) {
    list = await fetchBytes(`${BASE}/prob2.asp`);
    await writeFile(resolve(cacheDir, 'list.html'), list);
    names = parseOddsList(list);
    await sleep(PAUSE_MS);
  }
  let fetched = 0;
  for (const id of missing) {
    const name = names.get(id);
    if (!name) continue;
    const bytes = await fetchBytes(`${BASE}/prob2_detail.asp?setid=${id}&setname=${name}`);
    const detail = parseOddsDetail(bytes);
    // 표가 비면 남기지 않는다. 다음에 다시 받는다.
    if (detail.counts.length || detail.options.length) {
      await writeFile(resolve(cacheDir, `${id}.html`), bytes);
      odds.set(id, detail);
    }
    fetched++;
    await sleep(PAUSE_MS);
  }
  log(
    `장인 개조 확률 ${fetched}개 새로 받음, 공식 페이지에 없는 번호 ${missing.filter((id) => !names.has(id)).length}개`,
  );
  return odds;
}
