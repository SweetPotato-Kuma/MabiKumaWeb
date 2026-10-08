/**
 * 키트(확률형 상품) 확률표 모으기
 *
 * 공식 홈페이지의 확률 정보 화면은 지금 팔고 있는 키트만 보여 주고, 판매가 끝나면 목록에서 빠진다.
 * 그래서 주기적으로 돌며 보이는 키트를 public/data/kits.json 에 더해 쌓는다. 한 번 담은 키트는 지우지 않는다.
 *
 * - 확률: 확률 정보 화면(prob.asp?seq=<번호>)에 탭으로 나뉜 줄이 숨겨져 있다.
 *   [등급, 등급 확률, 아이템, 아이템 확률, ...]. 등급이 없는 키트는 등급 칸이 "없음" 이다.
 *   아이템 확률은 키트 전체에 대한 확률이라 모두 더하면 100% 다.
 * - 판매 가격과 기간: 같은 이름의 공지 본문에서 읽는다. 공지를 못 찾으면 비워 둔다.
 * - 그림: 키트 이름과 보상 이름 -> 그림 파일 이름 표(icons). 같은 보상이 여러 키트에 되풀이되므로 키트마다
 *   적지 않고 이름으로 한 번만 둔다. 클라이언트 내보내기와 그림을 올린 기록이 있는 PC 에서만 만들 수 있어
 *   `--icons-only` 로 따로 적는다(scripts/game-data/sync-all.mjs 가 부른다). 주기적으로 돌 때는 표를 건드리지 않는다.
 *
 * 화면은 기록 전체(수 MB)를 받지 않는다. 목록(public/data/kits/index.json)과 키트마다 한 파일
 * (public/data/kits/<id>.json, 그 키트 보상의 그림 이름 포함)로 나눠 내보내고, 고른 키트만 받는다.
 *
 * 실행: node scripts/build-kits.mjs
 *       node scripts/build-kits.mjs --icons-only   다시 모으지 않고 그림 파일 이름만 새로 적는다
 * 산출: public/data/kits.json(기록 원본), public/data/kits/
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { latestBundleRun, loadBundleItems } from './game-data/bundle-items.mjs';
import { buildKitNameIndex, kitIconIds } from './game-data/kit-names.mjs';

const ORIGIN = 'https://mabinogi.nexon.com';
const OUT = resolve('public/data/kits.json');
const SPLIT_DIR = resolve('public/data/kits');
/** 이름이 같은 공지를 찾을 때 훑는 공지 목록 쪽 수. 키트 공지는 판매 시작 무렵에 올라온다. */
const NOTICE_PAGES = 6;

const decoder = new TextDecoder('euc-kr');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function get(path) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(ORIGIN + path, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return decoder.decode(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 3) throw new Error(`${path}: ${error.message}`);
      await sleep(2000 * attempt);
    }
  }
}

const decodeEntities = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');

const plainText = (html) =>
  decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/** 띄어쓰기와 기호를 지운 비교용 이름. */
const squash = (text) => text.replace(/[\s()[\]·.,:/-]/g, '').toLowerCase();

/** 확률 정보 화면의 "확률형 이벤트 상품" 목록. [{ seq, name }] */
export function parseKitList(html) {
  return [...html.matchAll(/showEw2\((\d+)\)"[^>]*>([^<]+)</g)].map(([, seq, name]) => ({
    seq,
    name: decodeEntities(name).trim(),
  }));
}

/** "0.1457%" -> 0.001457. 숫자가 아니면 null. */
function parsePercent(text) {
  const value = Number(String(text ?? '').replace(/[%\s,]/g, ''));
  return Number.isFinite(value) && String(text ?? '').trim() !== '' ? value / 100 : null;
}

/** 아이템 이름 뒤에 붙은 "■color:FFF549" 를 떼어 색 목록으로. 8자리 코드의 앞 00 은 화면처럼 뗀다. */
function splitColors(raw) {
  const colors = [...raw.matchAll(/■color:([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})/g)].map(([, code]) =>
    (code.length === 8 && code.startsWith('00') ? code.slice(2) : code).toUpperCase(),
  );
  return {
    name: raw
      .replace(/■color:[0-9A-Fa-f]{6,8}/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    colors,
  };
}

/** 키트 한 개의 확률표. 등급은 나온 순서대로, 아이템은 등급 번호를 가리킨다. */
export function parseKitTable(html, seq) {
  const match = html.match(new RegExp(`id="ew_page_html_${seq}"[^>]*value="([^"]*)"`));
  if (!match) return null;
  const grades = [];
  const items = [];
  for (const line of decodeEntities(match[1]).split(/\r?\n/)) {
    const [gradeName = '', gradeChance = '', rawName = '', itemChance = ''] = line.split('\t');
    const chance = parsePercent(itemChance);
    if (!rawName.trim() || chance === null) continue;
    let grade = null;
    const gradeLabel = gradeName.trim();
    if (gradeLabel && gradeLabel !== '없음') {
      grade = grades.findIndex((each) => each.name === gradeLabel);
      if (grade < 0) {
        grade = grades.length;
        grades.push({ name: gradeLabel, chance: parsePercent(gradeChance) });
      }
    }
    const { name, colors } = splitColors(rawName);
    items.push({
      name,
      chance,
      ...(grade === null ? {} : { grade }),
      ...(colors.length ? { colors } : {}),
    });
  }
  return items.length ? { grades, items } : null;
}

/** "2026. 10. 1(목)" -> "2026-10-01". */
function parseKoreanDate(text) {
  const match = text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
}

/** 공지 본문의 판매 가격(캐시)과 기간. */
export function parseNotice(html) {
  // 판매 정보가 그림에만 있고 그림 설명(alt)으로 적힌 공지도 있다.
  const alts = [...html.matchAll(/alt="([^"]*)"/g)].map(([, alt]) => alt).join(' ');
  const text = `${plainText(html)} ${decodeEntities(alts)}`;
  const price = text.match(/판매\s*가격\s*:?\s*([\d,]+)\s*캐시/);
  const period = text.match(/판매\s*기간\s*:?\s*([^~]+)~\s*(\d{4}\.\s*\d{1,2}\.\s*\d{1,2})/);
  return {
    price: price ? Number(price[1].replace(/,/g, '')) : null,
    start: period ? parseKoreanDate(period[1]) : null,
    end: period ? parseKoreanDate(period[2]) : null,
  };
}

/** 공지 목록에서 [{ id, title }]. */
function parseNoticeList(html) {
  return [...html.matchAll(/notice_view\.asp\?id=(\d+)">([^<]+)</g)].map(([, id, title]) => ({
    id: Number(id),
    title: decodeEntities(title).trim(),
  }));
}

/**
 * 화면용 파일을 쓴다. 목록에는 키트마다 고르는 데 필요한 것만, 키트 파일에는 확률표와 그 키트에 나오는 이름의
 * 그림만 둔다. 내용이 같으면 다시 쓰지 않고, 기록에 없는 키트 파일은 지운다.
 */
export async function writeKitFiles(archive, dir = SPLIT_DIR) {
  const icons = archive.icons ?? {};
  await mkdir(dir, { recursive: true });
  const files = new Map();
  files.set('index.json', {
    updated: archive.updated,
    current: archive.current ?? [],
    kits: archive.kits.map(({ id, name, start, end, price, firstSeen, items }) => ({
      id,
      name,
      start,
      end,
      price,
      ...(firstSeen ? { firstSeen } : {}),
      ...(icons[name] ? { icon: icons[name] } : {}),
      count: items.length,
    })),
  });
  for (const kit of archive.kits) {
    const own = {};
    for (const name of [kit.name, ...kit.items.map((item) => item.name)])
      if (icons[name]) own[name] = icons[name];
    files.set(`${kit.id}.json`, { ...kit, icons: own });
  }
  let written = 0;
  for (const [file, body] of files) {
    const text = `${JSON.stringify(body)}\n`;
    const path = resolve(dir, file);
    const previous = await readFile(path, 'utf8').catch(() => null);
    if (previous === text) continue;
    await writeFile(path, text);
    written += 1;
  }
  let removed = 0;
  for (const file of await readdir(dir))
    if (file.endsWith('.json') && !files.has(file)) {
      await rm(resolve(dir, file));
      removed += 1;
    }
  console.log(`화면용 키트 파일 ${files.size}개 (새로 씀 ${written}, 지움 ${removed})`);
}

const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

async function readArchive() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return { updated: null, current: [], kits: [] };
  }
}

async function main() {
  const archive = await readArchive();
  const list = parseKitList(await get('/ItemShop/prob.asp'));
  console.log(`판매 중인 키트 ${list.length}개: ${list.map((kit) => kit.name).join(', ')}`);

  const notices = [];
  for (let page = 1; page <= NOTICE_PAGES; page += 1) {
    notices.push(...parseNoticeList(await get(`/page/news/notice_list.asp?page=${page}`)));
    await sleep(500);
  }

  const date = today();
  let changed = false;
  for (const { seq, name } of list) {
    await sleep(500);
    const table = parseKitTable(await get(`/ItemShop/prob.asp?seq=${seq}`), seq);
    if (!table) {
      console.warn(`${name}: 확률표를 읽지 못했습니다.`);
      continue;
    }
    const id = `official-${seq}`;
    let kit = archive.kits.find((each) => each.id === id);
    if (!kit) {
      kit = { id, name, start: null, end: null, price: null, firstSeen: date };
      archive.kits.push(kit);
      changed = true;
      console.log(`새 키트: ${name}`);
    }
    if (JSON.stringify([kit.grades, kit.items]) !== JSON.stringify([table.grades, table.items])) {
      kit.grades = table.grades;
      kit.items = table.items;
      changed = true;
    }
    kit.name = name;

    if (kit.price === null || kit.start === null) {
      const notice = notices.find((each) => squash(each.title) === squash(name));
      if (notice) {
        await sleep(500);
        const info = parseNotice(await get(`/page/news/notice_view.asp?id=${notice.id}`));
        for (const key of ['price', 'start', 'end'])
          if (kit[key] === null && info[key] !== null) {
            kit[key] = info[key];
            changed = true;
          }
      }
    }
  }

  // 지금 파는 키트. 목록이 바뀔 때만 고친다. 날마다 고치면 바뀐 것 없이 날마다 커밋이 생긴다.
  const current = list
    .map(({ seq }) => `official-${seq}`)
    .filter((id) => archive.kits.some((kit) => kit.id === id));
  if (JSON.stringify(archive.current ?? []) !== JSON.stringify(current)) {
    archive.current = current;
    changed = true;
  }

  if (!changed) {
    console.log('바뀐 키트가 없습니다.');
    await writeKitFiles(archive);
    return;
  }
  // 최근에 판매를 시작한 것부터. 시작일을 모르면 처음 본 날로 줄 세운다.
  archive.kits.sort((a, b) =>
    (b.start ?? b.firstSeen ?? '').localeCompare(a.start ?? a.firstSeen ?? ''),
  );
  archive.updated = date;
  await writeFile(OUT, `${JSON.stringify(archive)}\n`);
  console.log(`키트 ${archive.kits.length}개 -> ${OUT}`);
  await writeKitFiles(archive);
}

/**
 * 다시 모으지 않고 그림 표(icons)만 새로 만든다. 키트 이름과 보상 이름을 아이템 번호로 잇고(kit-names.mjs),
 * 그 번호로 올린 그림(.cache/item-cards/uploaded.json, collect-item-cards.mjs --kit-icons)을 찾는다.
 */
async function iconsOnly() {
  const archive = await readArchive();
  const uploaded = JSON.parse(await readFile(resolve('.cache/item-cards/uploaded.json'), 'utf8'));
  const run = latestBundleRun();
  const images = JSON.parse(await readFile(resolve(run, 'images/item-images.json'), 'utf8'));
  const index = buildKitNameIndex(loadBundleItems(run), (id) => Boolean(images[String(id)]));
  const { boxOf, itemOf } = kitIconIds(archive.kits, index);
  const icons = {};
  for (const [name, id] of [...boxOf, ...itemOf]) if (uploaded[id]) icons[name] = uploaded[id];
  const sorted = Object.fromEntries(
    Object.entries(icons).sort(([a], [b]) => a.localeCompare(b, 'ko')),
  );
  const boxes = archive.kits.filter((kit) => sorted[kit.name]).length;
  console.log(
    `그림을 붙인 키트 ${boxes}/${archive.kits.length}, 이름 ${Object.keys(sorted).length}개`,
  );
  if (JSON.stringify(archive.icons ?? {}) === JSON.stringify(sorted)) {
    console.log('바뀐 그림이 없습니다.');
    await writeKitFiles(archive);
    return;
  }
  const { updated, current, kits } = archive;
  await writeFile(
    OUT,
    `${JSON.stringify({ updated, current, icons: sorted, kits })}
`,
  );
  await writeKitFiles({ ...archive, icons: sorted });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await (process.argv.includes('--icons-only') ? iconsOnly() : main());
}
