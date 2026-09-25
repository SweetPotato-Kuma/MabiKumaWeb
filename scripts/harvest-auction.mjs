/**
 * 경매장 아이템 사전 수집기
 *
 * 넥슨 오픈 API 에는 아이템 목록을 주는 엔드포인트가 없다. 그래서 경매장에 올라온
 * 매물을 카테고리별로 전부 훑어 이름을 모은다. 이 결과는 "거래되는 아이템 사전"이지
 * 게임 전체 아이템 DB 가 아니다. 한 번에 다 모이지 않으므로 기존 파일과 합집합을
 * 취하고, 사라진 이름도 지우지 않는다 (경매장에 안 올라온 날이 있을 뿐이다).
 *
 * 키 취급: NEXON_API_KEY 는 CI 안에서만 쓰인다. VITE_ 접두사가 아니므로 번들에
 * 들어가지 않는다. 산출물에는 이름과 카테고리만 남는다.
 *
 * 실행: NEXON_API_KEY=... node scripts/harvest-auction.mjs
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API_ORIGIN = 'https://open.api.nexon.com';
const OUT_DIR = resolve(process.cwd(), 'public/data/items');
/** 전체 자동완성용 이름 인덱스. 카테고리 파일과 달리 category 필드가 없다. */
const NAMES_FILE = 'names.json';
const CONSTANTS_PATH = resolve(process.cwd(), 'src/features/auction/constants.ts');

/** 넥슨 쪽에 부담을 주지 않도록 요청 간 간격을 둔다. */
const REQUEST_DELAY_MS = 250;
/** 한 카테고리에서 도는 최대 페이지. 무한 커서를 만나도 멈추게 하는 안전장치. */
const MAX_PAGES_PER_CATEGORY = 50;
const MAX_RETRIES = 3;

const apiKey = process.env.NEXON_API_KEY;
if (!apiKey) {
  console.error('NEXON_API_KEY 가 없습니다. 환경변수로 넘겨 주세요.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/** 카테고리 이름에서 파일 이름을 만든다. 목록 순서가 바뀌어도 파일이 안 흔들리도록 해시를 쓴다. */
function fileNameFor(category) {
  return `${createHash('sha256').update(category).digest('hex').slice(0, 8)}.json`;
}

/**
 * 화면과 수집기가 같은 카테고리 목록을 보도록 상수 파일에서 읽어 온다.
 * .mjs 에서 .ts 를 import 할 수 없어 배열 리터럴만 뽑아낸다.
 */
async function readCategories() {
  const source = await readFile(CONSTANTS_PATH, 'utf8');
  const block = source.match(/AUCTION_ITEM_CATEGORIES\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error('constants.ts 에서 AUCTION_ITEM_CATEGORIES 를 찾지 못했습니다.');
  return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

async function requestPage(category, cursor) {
  const url = new URL('/mabinogi/v1/auction/list', API_ORIGIN);
  url.searchParams.set('auction_item_category', category);
  if (cursor) url.searchParams.set('cursor', cursor);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'x-nxopen-api-key': apiKey },
    });

    if (response.ok) return response.json();

    // 호출량 초과나 일시적 서버 오류는 기다렸다 다시 시도한다.
    const retryable = response.status === 429 || response.status >= 500;
    const body = await response.text();
    if (!retryable || attempt === MAX_RETRIES) {
      throw new Error(`HTTP ${response.status} ${body.slice(0, 200)}`);
    }
    await sleep(REQUEST_DELAY_MS * 4 * attempt);
  }

  throw new Error('재시도 한도를 넘었습니다.');
}

/** 기존 사전을 읽어 이름 → 레코드 맵으로 만든다. 없으면 빈 맵. */
async function readExisting() {
  const byCategory = new Map();
  let files;
  try {
    files = await readdir(OUT_DIR);
  } catch {
    return byCategory;
  }

  for (const file of files) {
    if (!file.endsWith('.json') || file === 'index.json' || file === NAMES_FILE) continue;
    try {
      const parsed = JSON.parse(await readFile(resolve(OUT_DIR, file), 'utf8'));
      if (!parsed?.category || !Array.isArray(parsed.items)) continue;
      byCategory.set(parsed.category, new Map(parsed.items.map((item) => [item.name, item])));
    } catch (cause) {
      console.warn(`  기존 파일을 읽지 못해 건너뜁니다: ${file} (${cause.message})`);
    }
  }

  return byCategory;
}

async function main() {
  const categories = await readCategories();
  const known = new Set(categories);
  const dictionary = await readExisting();
  const before = [...dictionary.values()].reduce((sum, items) => sum + items.size, 0);

  console.log(`카테고리 ${categories.length}개, 기존 사전 ${before}개로 시작합니다.`);

  const failures = [];
  const unlisted = new Set();
  let requests = 0;
  let listings = 0;

  for (const [index, category] of categories.entries()) {
    let cursor = '';
    let pages = 0;
    let added = 0;

    try {
      do {
        const page = await requestPage(category, cursor);
        requests += 1;
        pages += 1;

        for (const item of page.auction_item ?? []) {
          listings += 1;

          // 카테고리는 질의값이 아니라 응답값을 믿는다. 키워드 검색으로 넓힐 때도 같은 규칙이 선다.
          const bucket = item.auction_item_category || category;
          if (!known.has(bucket)) unlisted.add(bucket);

          // item_name 이 원형이다. item_display_name 에는 인챈트 접두가 붙어 개체마다 달라진다.
          const name = (item.item_name ?? '').replace(/^@/, '').trim();
          if (!name) continue;

          let items = dictionary.get(bucket);
          if (!items) {
            items = new Map();
            dictionary.set(bucket, items);
          }

          const existing = items.get(name);
          if (existing) existing.last = today;
          else {
            items.set(name, { name, first: today, last: today });
            added += 1;
          }
        }

        cursor = page.next_cursor || '';
        if (cursor) await sleep(REQUEST_DELAY_MS);
      } while (cursor && pages < MAX_PAGES_PER_CATEGORY);

      console.log(
        `[${String(index + 1).padStart(2)}/${categories.length}] ${category} — ${pages}페이지, 신규 ${added}개`,
      );
    } catch (cause) {
      failures.push({ category, message: cause.message });
      console.warn(`[${String(index + 1).padStart(2)}/${categories.length}] ${category} — 실패: ${cause.message}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  if (dictionary.size === 0) {
    console.error('한 건도 수집하지 못했습니다. 키와 네트워크를 확인해 주세요.');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const index = [];
  // 전체 자동완성용. [이름, 카테고리 번호] 만 담아 한 파일로 둔다.
  const nameRows = [];
  for (const [category, items] of [...dictionary].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
    const sorted = [...items.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const file = fileNameFor(category);
    await writeFile(
      resolve(OUT_DIR, file),
      `${JSON.stringify({ category, updated: today, count: sorted.length, items: sorted }, null, 2)}\n`,
    );
    for (const item of sorted) nameRows.push([item.name, index.length]);
    index.push({ name: category, file, count: sorted.length, ...(known.has(category) ? {} : { unlisted: true }) });
  }

  const total = index.reduce((sum, entry) => sum + entry.count, 0);
  await writeFile(
    resolve(OUT_DIR, 'index.json'),
    `${JSON.stringify({ updated: today, total, categories: index }, null, 2)}\n`,
  );

  /**
   * 전체 카테고리 자동완성은 이 파일 하나로 한다. 카테고리 파일 79개를 다 받을 수는 없다.
   * 첫/마지막 관측일은 빼고 이름과 카테고리 번호만 남겨 들여쓰기 없이 쓴다.
   * 15,000개 기준 원본 650KB, gzip 120KB 남짓이다.
   */
  await writeFile(
    resolve(OUT_DIR, NAMES_FILE),
    `${JSON.stringify({ updated: today, categories: index.map((entry) => entry.name), items: nameRows })}\n`,
  );

  console.log(`\n요청 ${requests}회, 매물 ${listings}건을 훑어 사전 ${before} → ${total}개가 되었습니다.`);
  if (unlisted.size > 0) {
    console.warn(`목록에 없는 카테고리: ${[...unlisted].join(', ')} — constants.ts 를 갱신해 주세요.`);
  }
  if (failures.length > 0) {
    console.warn(`실패한 카테고리 ${failures.length}개: ${failures.map((item) => item.category).join(', ')}`);
  }
}

await main();
