/**
 * NPC 상점 이미지 수집기
 *
 * 넥슨 오픈 API 에서 아이템 이미지를 주는 곳은 NPC 상점 응답 하나뿐이다. 경매장
 * 계열(list / history / keyword-search)에는 이미지 필드가 아예 없다.
 *
 * 그래서 여기서 모을 수 있는 것은 NPC 가 파는 물건에 한정된다. 실측으로 21명 전체가
 * 242개였고 경매장 사전 15,000여 개와는 142개만 겹쳤다. 적지만 공식 경로로 얻는
 * 유일한 이미지이고, 상점 재고가 주기적으로 도니(date_shop_next_update) 돌릴수록
 * 조금씩 늘어난다. 그래서 사전과 같은 규칙으로 합집합만 취하고 지우지 않는다.
 *
 * 이미지 URL 의 ?q= 는 그 개체의 색상까지 반영한 렌더다. 사전에는 기본 이미지가
 * 맞으므로 떼고 저장한다. q 없이도 200 으로 서빙된다.
 *
 * 실행: NEXON_API_KEY=... node scripts/harvest-npcshop.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API_ORIGIN = 'https://open.api.nexon.com';
const OUT_DIR = resolve(process.cwd(), 'public/items');
const OUT_FILE = resolve(OUT_DIR, 'images.json');
const CONSTANTS_PATH = resolve(process.cwd(), 'src/features/npcshop/constants.ts');

const REQUEST_DELAY_MS = 250;
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

/** 화면과 수집기가 같은 목록을 보도록 상수 파일에서 읽어 온다. */
async function readConstants() {
  const source = await readFile(CONSTANTS_PATH, 'utf8');

  const pick = (name) => {
    const block = source.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
    if (!block) throw new Error(`constants.ts 에서 ${name} 을 찾지 못했습니다.`);
    return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  };

  return { npcs: pick('NPC_NAMES'), servers: pick('SERVER_NAMES') };
}

async function requestShop(npcName, serverName, channel) {
  const url = new URL('/mabinogi/v1/npcshop/list', API_ORIGIN);
  url.searchParams.set('npc_name', npcName);
  url.searchParams.set('server_name', serverName);
  url.searchParams.set('channel', String(channel));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'x-nxopen-api-key': apiKey },
    });

    if (response.ok) return response.json();

    const retryable = response.status === 429 || response.status >= 500;
    const body = await response.text();
    if (!retryable || attempt === MAX_RETRIES) {
      throw new Error(`HTTP ${response.status} ${body.slice(0, 160)}`);
    }
    await sleep(REQUEST_DELAY_MS * 4 * attempt);
  }

  throw new Error('재시도 한도를 넘었습니다.');
}

/** 색상까지 반영된 렌더 대신 기본 이미지를 쓴다. */
function baseImageUrl(imageUrl) {
  const [base] = String(imageUrl).split('?');
  return base;
}

async function readExisting() {
  try {
    const parsed = JSON.parse(await readFile(OUT_FILE, 'utf8'));
    return new Map(Object.entries(parsed.images ?? {}));
  } catch {
    return new Map();
  }
}

async function main() {
  const { npcs, servers } = await readConstants();
  const channels = Array.from({ length: 12 }, (_, index) => index + 1);
  const images = await readExisting();
  const before = images.size;

  console.log(
    `NPC ${npcs.length}명 × 서버 ${servers.length}개 × 채널 ${channels.length}개, 기존 이미지 ${before}개로 시작합니다.`,
  );

  const failures = [];
  let requests = 0;
  let added = 0;

  for (const npcName of npcs) {
    let npcAdded = 0;

    for (const serverName of servers) {
      for (const channel of channels) {
        try {
          const shop = await requestShop(npcName, serverName, channel);
          requests += 1;

          for (const tab of shop.shop ?? []) {
            for (const item of tab.item ?? []) {
              const name = (item.item_display_name ?? '').trim();
              if (!name || !item.image_url) continue;

              const url = baseImageUrl(item.image_url);
              const existing = images.get(name);
              if (existing) existing.last = today;
              else {
                images.set(name, { url, first: today, last: today });
                npcAdded += 1;
                added += 1;
              }
            }
          }
        } catch (cause) {
          failures.push({ npcName, serverName, channel, message: cause.message });
        }

        await sleep(REQUEST_DELAY_MS);
      }
    }

    console.log(`${npcName} — 신규 ${npcAdded}개`);
  }

  await mkdir(OUT_DIR, { recursive: true });

  // 이름순으로 정렬해 두면 수집할 때마다 diff 에 바뀐 것만 뜬다.
  const sorted = [...images.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  await writeFile(
    OUT_FILE,
    `${JSON.stringify(
      { updated: today, count: sorted.length, images: Object.fromEntries(sorted) },
      null,
      2,
    )}\n`,
  );

  console.log(`\n요청 ${requests}회로 이미지 ${before} → ${images.size}개가 되었습니다 (신규 ${added}개).`);
  if (failures.length > 0) {
    console.warn(`실패 ${failures.length}건. 예: ${failures[0].npcName} ${failures[0].message}`);
  }
}

await main();
