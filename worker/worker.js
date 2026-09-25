/**
 * 마비노기 오픈 API 프록시 (Cloudflare Worker)
 *
 * 존재 이유: GitHub Pages 는 정적 호스팅이라 API 키를 숨길 곳이 없다.
 * 키를 번들에 넣으면 개발자도구에서 그대로 보인다. 그래서 키는 이 워커의
 * 시크릿으로만 두고, 브라우저는 키 없이 이 워커를 호출한다.
 *
 * 필요한 바인딩
 *   NEXON_API_KEY    (Secret, 필수)  넥슨 오픈 API 키
 *   ALLOWED_ORIGINS  (Variable, 권장) 쉼표로 구분한 허용 origin 목록.
 *                    비워두면 모든 origin 을 허용한다 — 남이 그대로 갖다 쓸 수 있으니 채울 것.
 *   CACHE_SECONDS    (Variable, 선택) 엣지 캐시 초. 기본 60.
 *
 * 이슈 제보(POST /report/issue)도 같은 이유로 여기에 있다. 방문자 대부분은 GitHub
 * 계정이 없으므로 워커가 대신 이슈를 만든다. 토큰 역시 브라우저에 보내지 않는다.
 *   GITHUB_TOKEN     (Secret, 제보 기능에 필수) Issues 쓰기 권한만 가진 토큰
 *   GITHUB_REPO      (Variable, 제보 기능에 필수) "소유자/레포" 형식
 *   ISSUE_RATE_LIMIT (Rate limiting 바인딩, 선택) 있으면 IP 당 제보 수를 제한한다
 *
 * 아이템 카드(아이콘 + 설명)도 여기에 있다. 사이트가 정적 호스팅이라 쓸 곳이 없고,
 * 아무나 쓰게 두면 남이 사전을 채워 넣을 수 있으므로 키를 아는 사람만 쓰게 한다.
 *   ADMIN_KEY        (Secret, 카드 기능에 필수) 운영자만 아는 긴 문자열
 *   ITEM_CARDS       (KV 바인딩, 카드 기능에 필수) 카테고리별 카드 목록
 *   ICONS            (R2 바인딩, 카드 기능에 필수) 아이콘 PNG. 1만 장이 넘어 KV 로는 감당이 안 된다
 *   CARD_RATE_LIMIT  (Rate limiting 바인딩, 선택) 있으면 카드 조회 횟수를 제한한다
 *
 * 장비 정보(GET /item-equip, PUT /item-equip/shard)도 같은 KV 와 같은 운영자 키, 같은 조회
 * 제한을 쓴다. 새로 붙일 바인딩은 없다.
 *
 * 읽기는 공개다. 사전 화면이 모든 방문자에게 아이콘을 보여 주므로 숨길 수가 없다.
 * 잠그는 것은 쓰기뿐이다.
 */

const NEXON_ORIGIN = 'https://open.api.nexon.com';
const ISSUE_PATH = '/report/issue';

/**
 * 아이템 카드 경로.
 *
 * 목록을 통째로 주는 경로는 방문자에게 열지 않는다. 아이콘 파일 이름이 내용 해시라
 * 찍어서 맞힐 수 없으므로, 목록이 곧 아이콘 주소의 색인이다. 색인을 통째로 내주면
 * 누구나 스크립트 한 번으로 전부 받아 갈 수 있다.
 *
 * 대신 화면에 지금 보이는 이름만 묶어 묻는 `/item-card/lookup` 을 쓴다. 사전 한 쪽은
 * 50행이라 한 번에 그만큼만 나간다. 전체를 긁으려면 수백 번 나눠 불러야 하고, 그 호출에는
 * 횟수 제한이 걸린다.
 */
const CARD_PATH = '/item-card';
const CARD_VERIFY_PATH = '/item-card/verify';
const CARD_LOOKUP_PATH = '/item-card/lookup';
/** 일괄 등록용 두 경로. 아이콘과 칸 쓰기를 갈라 둔 이유는 subrequest 한도 때문이다. */
const CARD_ICONS_PATH = '/item-card/icons';
const CARD_SHARD_PATH = '/item-card/shard';
const CARD_MAPS_PATH = '/item-card/maps';
const ICON_PATH_PREFIX = '/item-card/icons/';

/**
 * 장비 정보(기본 능력치, 랜덤 능력치, 개조, 세공, 특별 개조) 경로.
 *
 * 카드와 같은 원칙이다. 방문자는 아이템 하나씩만 물을 수 있고 그 조회에 횟수 제한이 걸린다.
 * 운영자는 카테고리 한 칸을 통째로 갈아 끼운다. 개조와 세공 정의는 여러 아이템이 같이 쓰므로
 * 칸 안에 한 번씩만 두고, 조회할 때 그 아이템에 붙는 것만 골라 싣는다.
 */
const EQUIP_PATH = '/item-equip';
const EQUIP_SHARD_PATH = '/item-equip/shard';
const EQUIP_KEY_PREFIX = 'equip:';

/**
 * 장비 칸 하나의 상한. 가장 큰 칸(천옷)이 2026-09 기준 1MB 남짓이다. 넉넉히 잡되, 실수로
 * 엉뚱한 것을 통째로 밀어 넣는 일은 막는다. 무료 플랜 CPU 10ms 안에서 풀어야 하는 크기이기도 하다.
 */
const EQUIP_SHARD_MAX_BYTES = 4 * 1024 * 1024;

/** 한 번에 물어볼 수 있는 이름 수. 사전 한 쪽(50행)보다 조금 넉넉하게 둔다. */
const LOOKUP_MAX_NAMES = 60;

/**
 * 한 번에 물어볼 수 있는 카테고리 수. 칸 하나를 읽을 때마다 JSON 을 푼다.
 * 가장 큰 칸(천옷)이 536KB 에 풀기 0.8ms 라, 넷이면 무료 플랜 CPU 10ms 안에 넉넉히 든다.
 */
const LOOKUP_MAX_GROUPS = 4;

/**
 * 한 번에 올릴 수 있는 아이콘 수.
 *
 * 무료 플랜 워커는 요청 하나에 R2/KV 호출을 50번까지만 할 수 있다(바인딩 호출도
 * subrequest 로 센다). 여유를 두고 40 으로 잡는다.
 */
const ICON_BATCH_MAX = 40;

/** 카테고리별 카드 칸의 KV 키 앞머리. */
const CARDS_KEY_PREFIX = 'cards:';

/** 운영자가 이 헤더에 키를 싣는다. */
const ADMIN_HEADER = 'x-mabikuma-admin-key';

/** 아이콘 한 장의 상한. 툴팁에서 잘라낸 아이콘은 보통 몇 KB 다. */
const ICON_MAX_BYTES = 512 * 1024;

const CARD_NAME_MAX = 120;
const CARD_TEXT_MAX = 2000;

/** 분류 값과 실제로 붙일 라벨. 화면이 보내는 값은 이 둘 중 하나뿐이다. */
const ISSUE_LABELS = {
  bug: '버그',
  feature: '기능 추가 요청',
};

const TITLE_MIN = 4;
const TITLE_MAX = 120;
const BODY_MIN = 10;
const BODY_MAX = 4000;

/**
 * 튼튼한 주머니 찾기.
 *
 * 한 채널의 주머니를 보려면 NPC 17명을 모두 불러야 한다. 브라우저가 직접 부르면 류트 한
 * 서버만 748번(17명 × 44채널), 응답이 NPC 하나에 75~125KB 라 60MB 가 넘는다. 그래서
 * 브라우저는 "서버, 채널" 로 한 번만 묻고, 워커가 17명을 한꺼번에 불러 튼튼한 주머니 줄만
 * 추려 돌려준다. 채널 하나가 30KB 안팎이 되고 류트 전체가 44번으로 끝난다.
 *
 * 저장은 하지 않는다. 상점은 에린 하루(현실 36분)마다 바뀌므로, 같은 채널을 다음 갱신
 * 시각까지만 이 워커 인스턴스 메모리에 들고 있다가 버린다. workers.dev 에서는 Cache API 가
 * 동작하지 않아 메모리를 쓴다.
 */
const BAG_PATH = '/npcshop/bags';
/** 튼튼한 주머니와 더 튼튼한 주머니. 더 튼튼한 쪽은 지금 허브 주머니 10종만 상점에 나온다. */
const BAG_NAME = /^(더 )?튼튼한 /;

/** 튼튼한 주머니를 파는 NPC. 2026-09-23 넥슨 API 로 21명을 모두 불러 확인했다. */
const BAG_SELLERS = [
  '상인 라누', '상인 피루', '모락', '상인 아루', '리나', '상인 누누', '상인 메루', '켄', '귀넥',
  '얼리', '데위', '테일로', '상인 세누', '상인 베루', '상인 에루', '상인 네루', '카디',
];

/** 서버별 채널 수. 화면(src/features/servers/constants.ts)과 같은 값이다. 통행증 찾기도 같이 쓴다. */
const SERVER_CHANNELS = { 류트: 44, 만돌린: 16, 하프: 25, 울프: 16 };

/** 모든 NPC 가 답하지 못했을 때는 오래 들고 있지 않는다. 잠깐 뒤 다시 물어볼 수 있게. */
const BAG_PARTIAL_TTL_MS = 30 * 1000;
/** 다음 갱신 시각을 모를 때의 상한. 에린 하루. */
const BAG_MAX_TTL_MS = 36 * 60 * 1000;

const bagCache = new Map();

/** "187,148,199" → "bb94c7". 줄 수가 많아 짧게 보낸다. */
function rgbToHex(value) {
  const parts = String(value ?? '')
    .split(',')
    .map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.map((part) => part.toString(16).padStart(2, '0')).join('');
}

/** 상점 응답에서 튼튼한 주머니와 더 튼튼한 주머니만 남긴다. 색은 파트 순서대로, 가격은 첫 번째 것. */
function extractBags(shop) {
  const bags = [];
  for (const tab of shop?.shop ?? []) {
    for (const item of tab.item ?? []) {
      const name = item.item_display_name ?? '';
      if (!BAG_NAME.test(name)) continue;

      const colors = (item.item_option ?? [])
        .filter((option) => option.option_type === '아이템 색상')
        .sort((a, b) => String(a.option_sub_type).localeCompare(String(b.option_sub_type)))
        .map((option) => rgbToHex(option.option_value))
        .filter(Boolean);
      const price = item.price?.[0];

      bags.push({ n: name, c: colors, p: price?.price_value ?? null, t: price?.price_type ?? null });
    }
  }
  return bags;
}

async function findBags(url, env, cors) {
  const server = url.searchParams.get('server') ?? '';
  const channel = Number(url.searchParams.get('channel'));
  const maxChannel = SERVER_CHANNELS[server];
  if (!maxChannel || !Number.isInteger(channel) || channel < 1 || channel > maxChannel) {
    return errorResponse('BAG_INVALID_QUERY', '서버와 채널을 다시 골라 주세요.', 400, cors);
  }

  const headers = {
    ...cors,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };

  const key = `${server}|${channel}`;
  const cached = bagCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return new Response(cached.body, { status: 200, headers: { ...headers, 'x-bag-cache': 'hit' } });
  }

  const npcs = await Promise.all(
    BAG_SELLERS.map(async (npc) => {
      const upstream = new URL('/mabinogi/v1/npcshop/list', NEXON_ORIGIN);
      upstream.searchParams.set('npc_name', npc);
      upstream.searchParams.set('server_name', server);
      upstream.searchParams.set('channel', String(channel));
      try {
        const response = await fetch(upstream.toString(), {
          headers: { accept: 'application/json', 'x-nxopen-api-key': env.NEXON_API_KEY },
        });
        if (!response.ok) return { npc, error: response.status };
        const shop = await response.json();
        return { npc, nextUpdate: shop.date_shop_next_update ?? null, bags: extractBags(shop) };
      } catch {
        return { npc, error: 0 };
      }
    }),
  );

  // 다음 갱신 시각은 NPC 마다 같지만, 가장 이른 것을 믿는다.
  const nextTimes = npcs
    .map((entry) => Date.parse(entry.nextUpdate ?? ''))
    .filter((time) => Number.isFinite(time));
  const nextUpdate = nextTimes.length > 0 ? Math.min(...nextTimes) : null;
  const complete = npcs.every((entry) => !entry.error);

  const body = JSON.stringify({
    server,
    channel,
    nextUpdate: nextUpdate ? new Date(nextUpdate).toISOString() : null,
    npcs,
  });

  const now = Date.now();
  const ttl = complete
    ? Math.min(Math.max((nextUpdate ?? 0) - now, 0), BAG_MAX_TTL_MS)
    : BAG_PARTIAL_TTL_MS;
  if (ttl > 0) bagCache.set(key, { body, expiresAt: now + ttl });

  // 오래된 칸은 조회할 때 조금씩 치운다. 인스턴스가 오래 살아도 메모리가 불어나지 않게.
  if (bagCache.size > 200) {
    for (const [cachedKey, entry] of bagCache) {
      if (entry.expiresAt <= now) bagCache.delete(cachedKey);
    }
  }

  return new Response(body, { status: 200, headers: { ...headers, 'x-bag-cache': 'miss' } });
}

/**
 * 마그 멜 미션 통행증 찾기.
 *
 * 통행증은 피오나트 한 명만 팔고, 가격이 채널마다 다르다(2026-09-24 에 10만에서 50만 골드까지
 * 봤다). 싼 채널을 찾으려면 네 서버 101채널을 모두 봐야 한다. 브라우저는 서버마다 한 번만
 * 묻고, 워커가 그 서버의 모든 채널을 한꺼번에 불러 통행증 줄만 돌려준다.
 *
 * 채널이 가장 많은 류트가 44번이라 무료 플랜의 요청당 외부 호출 50번 안에 든다. 피오나트
 * 응답은 11KB 안팎이라 44개를 풀어도 CPU 가 1ms 남짓이다. 넥슨이 류트 채널을 50개 넘게
 * 늘리면 이 방식은 한도에 걸린다.
 *
 * 저장하지 않는 것, 다음 상점 갱신 시각까지만 메모리에 드는 것은 주머니 찾기와 같다.
 */
const PASS_PATH = '/npcshop/magmell-pass';
const PASS_SELLER = '피오나트';

const passCache = new Map();

/** "마그 멜 미션 통행증 - 사계의 숲(어려움)". 앞말만 보고 던전 이름은 가리지 않는다. */
function isMagmellPass(name) {
  return name.startsWith('마그 멜') && name.includes('통행증');
}

/** 피오나트 상점에서 통행증 줄만 남긴다. 가격은 첫 번째 것. */
function extractPasses(shop) {
  const passes = [];
  for (const tab of shop?.shop ?? []) {
    for (const item of tab.item ?? []) {
      const name = item.item_display_name ?? '';
      if (!isMagmellPass(name)) continue;
      const price = item.price?.[0];
      passes.push({ n: name, p: price?.price_value ?? null, t: price?.price_type ?? null });
    }
  }
  return passes;
}

async function findPasses(url, env, cors) {
  const server = url.searchParams.get('server') ?? '';
  const channelCount = SERVER_CHANNELS[server];
  if (!channelCount) {
    return errorResponse('PASS_INVALID_QUERY', '서버를 다시 골라 주세요.', 400, cors);
  }

  const headers = {
    ...cors,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };

  const cached = passCache.get(server);
  if (cached && cached.expiresAt > Date.now()) {
    return new Response(cached.body, {
      status: 200,
      headers: { ...headers, 'x-pass-cache': 'hit' },
    });
  }

  const channels = await Promise.all(
    Array.from({ length: channelCount }, async (_, index) => {
      const channel = index + 1;
      const upstream = new URL('/mabinogi/v1/npcshop/list', NEXON_ORIGIN);
      upstream.searchParams.set('npc_name', PASS_SELLER);
      upstream.searchParams.set('server_name', server);
      upstream.searchParams.set('channel', String(channel));
      try {
        const response = await fetch(upstream.toString(), {
          headers: { accept: 'application/json', 'x-nxopen-api-key': env.NEXON_API_KEY },
        });
        if (!response.ok) return { channel, error: response.status };
        const shop = await response.json();
        return {
          channel,
          nextUpdate: shop.date_shop_next_update ?? null,
          passes: extractPasses(shop),
        };
      } catch {
        return { channel, error: 0 };
      }
    }),
  );

  const nextTimes = channels
    .map((entry) => Date.parse(entry.nextUpdate ?? ''))
    .filter((time) => Number.isFinite(time));
  const nextUpdate = nextTimes.length > 0 ? Math.min(...nextTimes) : null;
  const complete = channels.every((entry) => !entry.error);

  const body = JSON.stringify({
    server,
    nextUpdate: nextUpdate ? new Date(nextUpdate).toISOString() : null,
    channels,
  });

  const now = Date.now();
  const ttl = complete
    ? Math.min(Math.max((nextUpdate ?? 0) - now, 0), BAG_MAX_TTL_MS)
    : BAG_PARTIAL_TTL_MS;
  // 서버가 넷뿐이라 칸이 불어날 일이 없다. 치우지 않고 덮어쓴다.
  if (ttl > 0) passCache.set(server, { body, expiresAt: now + ttl });

  return new Response(body, { status: 200, headers: { ...headers, 'x-pass-cache': 'miss' } });
}

/** 이 워커가 중계해 주는 경로만 허용한다. 열린 프록시가 되지 않도록. */
const ALLOWED_PATHS = [
  /^\/mabinogi\/v1\/auction\/list$/,
  /^\/mabinogi\/v1\/auction\/history$/,
  /^\/mabinogi\/v1\/auction\/keyword-search$/,
  /^\/mabinogi\/v1\/npcshop\/list$/,
];

const DEFAULT_CACHE_SECONDS = 60;

function corsHeaders(origin, allowList) {
  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': `accept, content-type, ${ADMIN_HEADER}`,
    'Access-Control-Max-Age': '86400',
  };
  if (allowList.length === 0) headers['Access-Control-Allow-Origin'] = '*';
  else if (origin && allowList.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function errorResponse(name, message, status, headers) {
  return new Response(JSON.stringify({ error: { name, message } }), {
    status,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * 이슈 본문에 붙이는 꼬리표. 어느 화면에서 왔고 어떤 환경인지가 있어야 재현이 된다.
 * 제보자가 쓴 글과 섞이지 않도록 구분선을 둔다.
 */
function issueFooter(page, userAgent) {
  const lines = [
    '',
    '---',
    '사이트의 이슈 제보 버튼으로 접수된 글입니다.',
    `접수 시각: ${new Date().toISOString()}`,
  ];
  if (page) lines.push(`화면: ${page.slice(0, 200)}`);
  if (userAgent) lines.push(`브라우저: ${userAgent.slice(0, 300)}`);
  return lines.join('\n');
}

/**
 * 방문자가 쓴 이슈를 GitHub 에 대신 올린다.
 *
 * 토큰이 하나뿐이라 모든 제보가 같은 계정 이름으로 올라간다. 누가 썼는지 구분할 수
 * 없으므로 길이 제한과 호출 제한으로 막는다. 제보자에게 GitHub 계정을 요구하지
 * 않는 대신 치르는 비용이다.
 */
async function createIssue(request, env, cors) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return errorResponse('REPORT_NOT_CONFIGURED', '제보 기능이 아직 설정되지 않았습니다.', 503, cors);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('REPORT_INVALID_BODY', '제보 내용을 읽지 못했습니다.', 400, cors);
  }

  // 사람이 채울 일이 없는 칸. 값이 들어 있으면 자동 제출로 본다.
  if (typeof payload.website === 'string' && payload.website.length > 0) {
    return errorResponse('REPORT_REJECTED', '제보를 받지 못했습니다.', 400, cors);
  }

  const category = String(payload.category ?? '');
  const label = ISSUE_LABELS[category];
  if (!label) {
    return errorResponse('REPORT_INVALID_CATEGORY', '분류를 다시 골라 주세요.', 400, cors);
  }

  const title = String(payload.title ?? '').trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    return errorResponse(
      'REPORT_TITLE_LENGTH',
      `제목은 ${TITLE_MIN}자 이상 ${TITLE_MAX}자 이하로 써 주세요.`,
      400,
      cors,
    );
  }

  const body = String(payload.body ?? '').trim();
  if (body.length < BODY_MIN || body.length > BODY_MAX) {
    return errorResponse(
      'REPORT_BODY_LENGTH',
      `내용은 ${BODY_MIN}자 이상 ${BODY_MAX}자 이하로 써 주세요.`,
      400,
      cors,
    );
  }

  if (env.ISSUE_RATE_LIMIT) {
    const key = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.ISSUE_RATE_LIMIT.limit({ key });
    if (!success) {
      return errorResponse('REPORT_RATE_LIMITED', '잠시 후 다시 제보해 주세요.', 429, cors);
    }
  }

  const page = typeof payload.page === 'string' ? payload.page : '';
  const userAgent = request.headers.get('User-Agent') || '';

  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'content-type': 'application/json',
        'user-agent': 'mabikuma-issue-reporter',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({ title, body: `${body}\n${issueFooter(page, userAgent)}`, labels: [label] }),
    });
  } catch {
    return errorResponse('REPORT_UPSTREAM_UNREACHABLE', 'GitHub 에 연결하지 못했습니다.', 502, cors);
  }

  if (!response.ok) {
    // GitHub 의 응답 본문은 그대로 돌려주지 않는다. 토큰 상태 같은 것이 새어 나갈 수 있다.
    console.error('GitHub issue 생성 실패', response.status, await response.text());
    return errorResponse('REPORT_UPSTREAM_FAILED', '제보를 올리지 못했습니다.', 502, cors);
  }

  const created = await response.json();

  return new Response(JSON.stringify({ number: created.number, url: created.html_url }), {
    status: 201,
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * 키 비교는 길이와 내용 어느 쪽에서도 시간이 새지 않게 한다.
 * 개인 도구라 공격받을 일이 드물지만, 비교 한 줄 더 쓰는 값이면 쓰는 게 맞다.
 */
function keyMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  if (given.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function adminProblem(request, env, cors) {
  if (!env.ADMIN_KEY || !env.ITEM_CARDS) {
    return errorResponse('CARD_NOT_CONFIGURED', '카드 기능이 아직 설정되지 않았습니다.', 503, cors);
  }
  if (!keyMatches(request.headers.get(ADMIN_HEADER), env.ADMIN_KEY)) {
    return errorResponse('CARD_UNAUTHORIZED', '운영자 키가 맞지 않습니다.', 401, cors);
  }
  return null;
}

async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 카테고리별 KV 키.
 *
 * 카드를 한 덩어리로 두면 안 되는 이유는 크기다. 사전을 다 채우면 15,000장이 넘고 JSON 이
 * 2.9MB 가 된다. 무료 플랜 워커는 요청당 CPU 10ms 라 그걸 매 조회마다 파싱할 수 없다.
 * 카테고리로 쪼개면 가장 큰 것(천옷)이 536KB, 푸는 데 0.8ms 라 여유 있게 들어간다.
 *
 * 사전 화면이 카테고리를 먼저 고르게 되어 있어서, 조회 한 번에 칸 하나만 읽으면 된다.
 * `public/data/items/` 의 이름 사전이 이미 같은 방식으로 나뉘어 있다.
 */
async function shardKey(category) {
  return `${CARDS_KEY_PREFIX}${(await sha256Hex(category)).slice(0, 8)}`;
}

/**
 * 워커 인스턴스 안에 방금 푼 칸을 잠깐 들고 있는다.
 *
 * 워커는 요청이 끝나도 같은 인스턴스가 다음 요청을 받는 일이 많고, 그 사이 모듈 바깥 값은
 * 남아 있다. 인기 있는 카테고리는 몇 초 간격으로 계속 조회되는데, 매번 KV 에서 읽어 JSON 을
 * 새로 풀 이유가 없다. KV 읽기도 무료 플랜 하루 10만 건이 한도이고, 푸는 데 드는 CPU 도
 * 요청당 10ms 한도 안에서 쓴다.
 *
 * 1분만 믿는다. KV 자체가 저장 후 다른 지역에 퍼지는 데 최대 60초가 걸리므로 그보다 더
 * 낡지는 않는다. 가장 큰 칸이 풀면 수 MB 라 8개까지만 든다(워커 메모리 한도 128MB).
 */
const SHARD_CACHE_MS = 60_000;
const SHARD_CACHE_MAX = 8;

/**
 * KV 를 읽을 때 그 지역 엣지에 남겨 두는 시간(초).
 *
 * 위의 메모리 캐시는 같은 인스턴스에서만 먹는다. 방문이 드문 시간에는 요청마다 인스턴스가
 * 달라 거의 매번 KV 까지 가고, 처음 읽는 칸은 중앙 저장소까지 다녀오느라 한국에서 수백 ms 가
 * 든다. 표의 그림은 이 조회가 끝나야 받기 시작하므로 그만큼 늦게 뜬다.
 *
 * 엣지에 한 시간 남겨 두면 같은 지역의 다음 방문자는 가까운 곳에서 바로 읽는다. 대신 새로 올린
 * 카드가 다른 지역에 보이기까지 최대 한 시간이 걸린다. 화면이 "없더라" 를 한 시간 믿는 것과
 * 같은 폭이다(src/features/itemcard/cards.ts 의 MISSING_TTL_MS).
 */
const KV_EDGE_CACHE_SECONDS = 3600;

/**
 * KV 바인딩마다 따로 든다. 바인딩은 인스턴스가 사는 동안 같은 객체라 운영에서는 하나를 계속
 * 쓰고, 테스트는 매번 새 가짜 KV 를 넘기므로 저절로 섞이지 않는다.
 */
const shardCaches = new WeakMap();

function shardCacheOf(env) {
  let cache = shardCaches.get(env.ITEM_CARDS);
  if (!cache) {
    cache = new Map();
    shardCaches.set(env.ITEM_CARDS, cache);
  }
  return cache;
}

/** 카드 칸과 장비 칸이 같이 쓴다. KV 키 앞머리가 달라 섞이지 않는다. */
function rememberShard(env, key, value) {
  const cache = shardCacheOf(env);
  cache.delete(key);
  cache.set(key, { at: Date.now(), value });
  while (cache.size > SHARD_CACHE_MAX) cache.delete(cache.keys().next().value);
}

/**
 * KV 값 하나를 메모리를 거쳐 읽는다. `pick` 은 저장된 JSON 에서 들고 있을 부분만 고른다.
 * `fromMemory` 는 KV 까지 가지 않았는지. 응답 머리에 실어 운영에서 확인한다.
 */
async function readCachedKv(env, key, pick) {
  const cache = shardCacheOf(env);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < SHARD_CACHE_MS) {
    // 최근에 쓴 것을 뒤로 보낸다. 넘칠 때 오래 안 쓴 칸부터 버리려는 것이다.
    cache.delete(key);
    cache.set(key, hit);
    return { value: hit.value, fromMemory: true };
  }

  const value = pick(await env.ITEM_CARDS.get(key, { type: 'json', cacheTtl: KV_EDGE_CACHE_SECONDS }));
  rememberShard(env, key, value);
  return { value, fromMemory: false };
}

/** 카드 칸 하나. */
async function readShardWithSource(env, category) {
  const { value, fromMemory } = await readCachedKv(env, await shardKey(category), (stored) =>
    Array.isArray(stored?.cards) ? stored.cards : [],
  );
  return { cards: value, fromMemory };
}

async function readShard(env, category) {
  return (await readShardWithSource(env, category)).cards;
}

async function writeShard(env, category, cards) {
  const sorted = [...cards].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const key = await shardKey(category);
  await env.ITEM_CARDS.put(
    key,
    JSON.stringify({
      category,
      updated: new Date().toISOString().slice(0, 10),
      count: sorted.length,
      cards: sorted,
    }),
  );
  // 이 인스턴스가 들고 있던 옛 칸도 바로 바꾼다. 방금 저장한 사람이 옛 것을 보지 않게.
  rememberShard(env, key, sorted);
  await writeIconMap(env, category, sorted);
  return sorted.length;
}

/**
 * 카테고리별 그림 목록. `이름 -> [그림 파일, 부제]` 만 담아 R2 에 둔다.
 *
 * 표의 그림은 원래 워커에 카드를 묻고, 그 답에 든 파일 이름으로 그림을 받았다. 처음 보는
 * 아이템은 이 조회를 한 번 기다려야 해서 그림이 늦게 떴다. 이 목록은 그림 도메인
 * (ICON_BASE_URL)의 CDN 에서 바로 나가므로 화면은 워커를 거치지 않고 가까운 곳에서 받는다.
 * 목록에 없는 이름은 카드가 없다는 뜻이라 따로 묻지 않아도 된다.
 *
 * 칸을 쓸 때마다 같이 다시 쓴다. R2 쓰기 한 번이라 subrequest 한도에 부담이 없다.
 *
 * 내용은 JSON 인데 확장자는 `.js` 다. Cloudflare CDN 은 확장자를 보고 캐시할지 정하고, `.json` 은
 * 그 목록에 없어 매번 R2 원본까지 갔다(2026-09 실측, 캐시 없이 한 번에 0.3~0.9초).
 * `.js` 는 기본으로 캐시된다. 이름을 `.json` 으로 되돌리면 그림이 다시 늦어진다.
 *
 * CDN 과 브라우저는 한 시간 붙잡고, 그 뒤 하루까지는 옛 것을 내주면서 새로 받아 둔다.
 * 새로 올린 카드가 표에 보이기까지 길어야 한 시간 남짓이다. KV 엣지 캐시(KV_EDGE_CACHE_SECONDS)와
 * 같은 폭이다. 교차 출처 읽기는 버킷의 CORS 설정(모든 출처에 GET)이 연다.
 */
const ICON_MAP_PREFIX = 'maps/';
const ICON_MAP_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';

async function iconMapKey(category) {
  return `${ICON_MAP_PREFIX}${(await sha256Hex(category)).slice(0, 8)}.js`;
}

async function writeIconMap(env, category, cards) {
  if (!env.ICONS) return;
  const items = {};
  for (const card of cards) items[card.name] = card.subtitle ? [card.icon, card.subtitle] : [card.icon];
  await env.ICONS.put(await iconMapKey(category), JSON.stringify({ category, items }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: ICON_MAP_CACHE },
  });
}

/**
 * 그림 목록을 칸에서 다시 만든다. 목록이 생기기 전에 올린 칸을 채우는 운영자 경로다.
 * 카테고리 하나씩 받는다. KV 읽기와 R2 쓰기가 한 번씩이라 한도 안에서 넉넉하다.
 */
async function rebuildIconMap(url, env, cors) {
  if (!env.ICONS) {
    return errorResponse('CARD_ICONS_NOT_CONFIGURED', '아이콘 저장소가 없습니다.', 503, cors);
  }
  const category = cleanText(url.searchParams.get('category'), CARD_NAME_MAX);
  if (!category) return errorResponse('CARD_CATEGORY_REQUIRED', '카테고리가 없습니다.', 400, cors);

  const cards = await readShard(env, category);
  await writeIconMap(env, category, cards);

  return new Response(JSON.stringify({ category, count: cards.length }), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 아이콘 파일 이름은 **그림 내용**의 해시다.
 *
 * 아이템 이름으로 지으면 같은 아이템의 아이콘을 다시 저장했을 때 이름이 그대로라, 영구
 * 캐시를 걸어 둔 브라우저가 옛 그림을 계속 보여 준다. 내용이 바뀌면 이름도 바뀌게 해 두면
 * 캐시를 마음 놓고 걸 수 있고, 같은 그림을 두 번 올려도 파일이 늘지 않는다.
 */
async function iconFileName(bytes) {
  return `${(await sha256Hex(bytes)).slice(0, 16)}.png`;
}

/** base64 로 온 아이콘을 풀고 파일 이름을 정한다. 아직 쓰지는 않는다. */
async function prepareIcon(base64) {
  const bytes = decodeBase64(base64);
  if (bytes.byteLength > ICON_MAX_BYTES) throw new Error('아이콘이 너무 큽니다.');
  return { bytes, file: await iconFileName(bytes) };
}

async function writeIcon(env, file, bytes) {
  // 캐시 표시를 파일에 같이 적어 둔다. 워커를 거치지 않고 R2 에서 바로 나갈 때도 CDN 과
  // 브라우저가 이걸 보고 오래 붙잡는다. 이름이 내용 해시라 1년을 걸어도 틀릴 일이 없다.
  await env.ICONS.put(file, bytes, {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
  });
}

/** 아이콘 한 장을 R2 에 넣고 파일 이름을 돌려준다. */
async function putIcon(env, base64) {
  const { bytes, file } = await prepareIcon(base64);
  await writeIcon(env, file, bytes);
  return file;
}

/**
 * 아이콘은 공개 이미지다. 이름이 내용 해시라 캐시를 길게 걸어도 틀릴 일이 없다.
 *
 * 15,000장이 넘어가므로 KV 가 아니라 R2 에 둔다. KV 무료 플랜은 하루 쓰기가 1,000건이라
 * 한 번 채우는 데만 보름이 걸린다. R2 는 작은 파일을 많이 두라고 있는 물건이다.
 */
async function serveIcon(url, env) {
  if (!env.ICONS) return new Response('아이콘 저장소가 설정되지 않았습니다.', { status: 503 });

  const file = url.pathname.slice(ICON_PATH_PREFIX.length);
  if (!/^[0-9a-f]{16}\.png$/.test(file)) return new Response('없는 아이콘입니다.', { status: 404 });

  const object = await env.ICONS.get(file);
  if (!object) return new Response('없는 아이콘입니다.', { status: 404 });

  return new Response(object.body, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: object.httpEtag,
      // img 태그로 불리므로 CORS 는 필요 없지만, 캔버스로 다시 읽을 때를 위해 열어 둔다.
      'access-control-allow-origin': '*',
    },
  });
}

/**
 * 화면에 보이는 이름만 묶어 묻는 조회. 방문자가 쓰는 유일한 읽기 경로다.
 *
 * 카테고리를 같이 받는 이유는 칸 하나만 읽으면 되기 때문이다. 사전 화면은 카테고리를
 * 고른 뒤에만 목록을 보여 주므로 화면이 늘 알고 있는 값이다.
 */
async function lookupCards(request, env, cors) {
  // 저장소를 아직 안 붙인 상태에서도 사전 화면이 깨지면 안 된다. 빈 결과가 정답이다.
  if (!env.ITEM_CARDS) {
    return new Response(JSON.stringify({ cards: [] }), {
      headers: {
        ...cors,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('CARD_INVALID_BODY', '보낸 내용을 읽지 못했습니다.', 400, cors);
  }

  /**
   * 한 칸짜리 `{ category, names }` 와 여러 칸짜리 `{ groups: [...] }` 를 다 받는다.
   *
   * 사전은 늘 한 카테고리만 보여 주지만 경매장은 키워드로 찾으면 여러 카테고리가 섞인다.
   * 그때 카테고리마다 따로 부르면 한 번 검색에 요청이 너댓 번 나가 횟수 제한에 먼저 걸린다.
   * 이름 수 상한은 칸 수와 상관없이 합쳐서 60 개 그대로다. 긁어 가기 어렵게 해 둔 수준은
   * 그대로 두고 요청 수만 줄인다.
   */
  const rawGroups = Array.isArray(payload.groups)
    ? payload.groups
    : [{ category: payload.category, names: payload.names }];

  if (rawGroups.length === 0 || rawGroups.length > LOOKUP_MAX_GROUPS) {
    return errorResponse(
      'CARD_TOO_MANY_GROUPS',
      `한 번에 카테고리 ${LOOKUP_MAX_GROUPS}개까지만 물어볼 수 있습니다.`,
      400,
      cors,
    );
  }

  const wantedByCategory = new Map();
  let total = 0;
  for (const group of rawGroups) {
    const category = cleanText(group?.category, CARD_NAME_MAX);
    if (!category)
      return errorResponse('CARD_CATEGORY_REQUIRED', '카테고리가 없습니다.', 400, cors);
    if (!Array.isArray(group?.names)) {
      return errorResponse('CARD_NAMES_REQUIRED', '찾을 이름이 없습니다.', 400, cors);
    }

    const wanted = wantedByCategory.get(category) ?? new Set();
    for (const name of group.names) if (typeof name === 'string') wanted.add(name);
    wantedByCategory.set(category, wanted);
    total += group.names.length;
  }

  if (total > LOOKUP_MAX_NAMES) {
    return errorResponse(
      'CARD_TOO_MANY_NAMES',
      `한 번에 ${LOOKUP_MAX_NAMES}개까지만 물어볼 수 있습니다.`,
      400,
      cors,
    );
  }

  if (env.CARD_RATE_LIMIT) {
    const key = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.CARD_RATE_LIMIT.limit({ key });
    if (!success) {
      return errorResponse('CARD_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
    }
  }

  const cards = [];
  let fromMemory = 0;
  for (const [category, wanted] of wantedByCategory) {
    const shard = await readShardWithSource(env, category);
    if (shard.fromMemory) fromMemory++;
    for (const card of shard.cards) {
      if (wanted.has(card.name)) cards.push(withIconUrl(card, env));
    }
  }

  return new Response(JSON.stringify({ cards }), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      // 방금 저장한 카드가 바로 보여야 한다. 엣지에 눌러 두지 않는다.
      'cache-control': 'no-store',
      // 칸 몇 개를 KV 까지 가지 않고 메모리에서 꺼냈는지. 캐시가 실제로 먹는지 운영에서 본다.
      'x-card-shards': `${fromMemory}/${wantedByCategory.size}`,
    },
  });
}

/**
 * 카드에 그림 주소를 붙인다.
 *
 * `ICON_BASE_URL` 이 있으면 R2 자체 도메인에서 바로 내보낸다. 그림 한 장이 워커 요청 한 번이라
 * 워커를 거치게 두면 경매장 검색 세 번에 요청이 수백 번 나가고, 그게 경매장 중계와 같은
 * 하루 한도(무료 플랜 10만)를 깎는다. 주소를 여기서 정해 주면 도메인을 바꿔도 사이트를
 * 다시 배포하지 않아도 된다. 비어 있으면 붙이지 않고, 화면은 워커 경로로 받는다.
 */
function withIconUrl(card, env) {
  const base = String(env.ICON_BASE_URL ?? '').replace(/\/+$/, '');
  if (!base || !card.icon) return card;
  return { ...card, iconUrl: `${base}/${card.icon}` };
}

function cleanText(value, limit) {
  return String(value ?? '')
    .trim()
    .slice(0, limit);
}

/** 카드 한 장을 넣거나 덮어쓴다. 툴팁 화면이 쓰는 경로다. */
async function saveCard(request, env, cors) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('CARD_INVALID_BODY', '보낸 내용을 읽지 못했습니다.', 400, cors);
  }

  const name = cleanText(payload.card?.name, CARD_NAME_MAX);
  const category = cleanText(payload.card?.category, CARD_NAME_MAX);
  if (!name) return errorResponse('CARD_NAME_REQUIRED', '아이템 이름이 비어 있습니다.', 400, cors);
  if (!category) {
    return errorResponse('CARD_CATEGORY_REQUIRED', '카테고리를 고르지 않았습니다.', 400, cors);
  }

  const cards = await readShard(env, category);
  const previous = cards.find((item) => item.name === name);

  let icon = previous?.icon ?? '';
  if (typeof payload.iconBase64 === 'string' && payload.iconBase64.length > 0) {
    if (!env.ICONS) {
      return errorResponse('CARD_ICONS_NOT_CONFIGURED', '아이콘 저장소가 없습니다.', 503, cors);
    }
    try {
      icon = await putIcon(env, payload.iconBase64);
    } catch (error) {
      return errorResponse('CARD_ICON_INVALID', error.message, 400, cors);
    }
  }

  const card = {
    name,
    subtitle: cleanText(payload.card?.subtitle, CARD_NAME_MAX),
    description: cleanText(payload.card?.description, CARD_TEXT_MAX),
    category,
    icon,
    updated: new Date().toISOString().slice(0, 10),
  };

  const count = await writeShard(env, category, [
    ...cards.filter((item) => item.name !== name),
    card,
  ]);

  return new Response(JSON.stringify({ card: withIconUrl(card, env), count }), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * 아이콘만 여러 장 올린다. 운영자가 한꺼번에 등록할 때 쓰는 경로다.
 *
 * 카드 쓰기와 갈라 둔 이유는 subrequest 한도 때문이다. 무료 플랜 워커는 요청 하나에
 * R2/KV 호출을 50번까지만 할 수 있다. 아이콘 저장과 칸 쓰기를 한 요청에 섞으면 한 번에
 * 넣을 수 있는 양이 확 줄어든다.
 */
async function putIcons(request, env, cors) {
  if (!env.ICONS) {
    return errorResponse('CARD_ICONS_NOT_CONFIGURED', '아이콘 저장소가 없습니다.', 503, cors);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('CARD_INVALID_BODY', '보낸 내용을 읽지 못했습니다.', 400, cors);
  }

  const icons = Array.isArray(payload.icons) ? payload.icons : null;
  if (!icons) return errorResponse('CARD_ICONS_REQUIRED', '올릴 아이콘이 없습니다.', 400, cors);
  if (icons.length > ICON_BATCH_MAX) {
    return errorResponse(
      'CARD_TOO_MANY_ICONS',
      `한 번에 ${ICON_BATCH_MAX}장까지만 올릴 수 있습니다.`,
      400,
      cors,
    );
  }

  /**
   * 한꺼번에 쓴다. 한 장씩 차례로 기다리면 R2 쓰기 한 번에 1초 가까이 걸려(2026-09 실측,
   * 40장에 41초) 1만 5천 장을 채우는 데 네 시간이 넘는다. 동시에 몇 개를 쓰든 subrequest
   * 한도는 전체 횟수로 세므로 ICON_BATCH_MAX(40) 안이면 문제없다.
   */
  const prepared = await Promise.all(
    icons.map(async (entry) => {
      if (typeof entry?.key !== 'string' || typeof entry?.base64 !== 'string') return null;
      try {
        return { key: entry.key, ...(await prepareIcon(entry.base64)) };
      } catch {
        // 한 장이 상했다고 나머지를 버리지 않는다. 빠진 키는 스크립트가 보고 다시 시도한다.
        return null;
      }
    }),
  );

  /**
   * 같은 그림은 한 번만 쓴다. 염색이나 성별만 다른 아이템은 그림이 같고, 그림이 같으면 파일
   * 이름도 같다. 같은 파일을 동시에 두 번 쓰면 R2 가 하나를 거절한다(2026-09, 이것 때문에
   * 1,128장이 빠졌다).
   */
  const unique = new Map();
  for (const item of prepared) if (item && !unique.has(item.file)) unique.set(item.file, item.bytes);

  const written = new Set();
  await Promise.all(
    [...unique].map(async ([file, bytes]) => {
      try {
        await writeIcon(env, file, bytes);
        written.add(file);
      } catch {
        // 못 쓴 그림은 돌려주지 않는다. 스크립트가 빠진 것을 보고 다음에 다시 보낸다.
      }
    }),
  );

  const files = {};
  for (const item of prepared) if (item && written.has(item.file)) files[item.key] = item.file;

  return new Response(JSON.stringify({ files }), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * 카테고리 한 칸을 통째로 갈아 끼운다. 운영자가 한꺼번에 등록할 때 쓰는 경로다.
 *
 * KV 쓰기 한 번으로 끝나므로 무료 플랜의 하루 1,000건 안에 넉넉히 들어간다
 * (카테고리는 79개뿐이다). 아이콘은 앞서 `/item-card/icons` 로 올려 두고
 * 여기에는 파일 이름만 싣는다.
 */
async function putShard(request, env, cors) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('CARD_INVALID_BODY', '보낸 내용을 읽지 못했습니다.', 400, cors);
  }

  const category = cleanText(payload.category, CARD_NAME_MAX);
  if (!category) return errorResponse('CARD_CATEGORY_REQUIRED', '카테고리가 없습니다.', 400, cors);
  if (!Array.isArray(payload.cards)) {
    return errorResponse('CARD_LIST_REQUIRED', '카드 목록이 없습니다.', 400, cors);
  }

  const cards = [];
  for (const entry of payload.cards) {
    const name = cleanText(entry?.name, CARD_NAME_MAX);
    if (!name) continue;
    cards.push({
      name,
      subtitle: cleanText(entry?.subtitle, CARD_NAME_MAX),
      description: cleanText(entry?.description, CARD_TEXT_MAX),
      category,
      icon: /^[0-9a-f]{16}\.png$/.test(entry?.icon ?? '') ? entry.icon : '',
      updated: new Date().toISOString().slice(0, 10),
    });
  }

  const count = await writeShard(env, category, cards);

  return new Response(JSON.stringify({ category, count }), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** 잘못 저장한 카드를 지운다. 손으로 채우는 사전이라 지울 일이 반드시 생긴다. */
async function deleteCard(url, env, cors) {
  const name = cleanText(url.searchParams.get('name'), CARD_NAME_MAX);
  const category = cleanText(url.searchParams.get('category'), CARD_NAME_MAX);
  if (!name) return errorResponse('CARD_NAME_REQUIRED', '지울 아이템 이름이 없습니다.', 400, cors);
  if (!category) {
    return errorResponse(
      'CARD_CATEGORY_REQUIRED',
      '어느 카테고리인지 같이 보내 주세요.',
      400,
      cors,
    );
  }

  const cards = await readShard(env, category);
  const target = cards.find((item) => item.name === name);
  if (!target) return errorResponse('CARD_NOT_FOUND', '그 이름의 카드가 없습니다.', 404, cors);

  /**
   * 아이콘은 지우지 않는다. 파일 이름이 내용 해시라 다른 아이템이 같은 그림을 쓰고 있을 수
   * 있고, 그걸 확인하려면 칸을 전부 읽어야 한다. 1.5KB 짜리를 남겨 두는 값이 더 싸다.
   */
  const count = await writeShard(
    env,
    category,
    cards.filter((item) => item.name !== name),
  );

  return new Response(JSON.stringify({ count }), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function equipKey(category) {
  return `${EQUIP_KEY_PREFIX}${(await sha256Hex(category)).slice(0, 8)}`;
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** 세공 옵션이 이 장비에 붙는지. 장비 종류가 맞고, 종족이 하나라도 겹쳐야 한다. */
function abilityFits(ability, reforge) {
  if (!Array.isArray(ability?.types) || !ability.types.includes(reforge.type)) return false;
  const races = String(ability.races ?? '');
  return [...String(reforge.races ?? '')].some((race) => races.includes(race));
}

/**
 * 장비 한 개. 방문자가 쓰는 읽기 경로다.
 *
 * 칸에는 개조와 세공 정의가 카테고리 전체 몫으로 들어 있다. 그대로 내주면 한 번 조회로
 * 카테고리를 통째로 가져가는 셈이라, 이 아이템에 붙는 것만 골라 싣는다.
 */
async function lookupEquipment(request, url, env, cors) {
  const jsonHeaders = {
    ...cors,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (!env.ITEM_CARDS)
    return new Response(JSON.stringify({ item: null }), { headers: jsonHeaders });

  const category = cleanText(url.searchParams.get('category'), CARD_NAME_MAX);
  const name = cleanText(url.searchParams.get('name'), CARD_NAME_MAX);
  if (!category) return errorResponse('EQUIP_CATEGORY_REQUIRED', '카테고리가 없습니다.', 400, cors);
  if (!name) return errorResponse('EQUIP_NAME_REQUIRED', '아이템 이름이 없습니다.', 400, cors);

  if (env.CARD_RATE_LIMIT) {
    const key = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.CARD_RATE_LIMIT.limit({ key });
    if (!success)
      return errorResponse('EQUIP_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }

  const { value: shard, fromMemory } = await readCachedKv(
    env,
    await equipKey(category),
    (stored) => (isPlainObject(stored?.items) ? stored : null),
  );
  const record = shard?.items?.[name];
  if (!isPlainObject(record)) {
    return new Response(JSON.stringify({ item: null }), { headers: jsonHeaders });
  }

  const upgrades = {};
  for (const id of record.upgrade?.ids ?? []) {
    const def = shard.upgrades?.[id];
    if (def) upgrades[id] = def;
  }

  const abilities = [];
  if (record.reforge) {
    for (const [id, ability] of Object.entries(shard.abilities ?? {})) {
      if (abilityFits(ability, record.reforge)) abilities.push({ id: Number(id), ...ability });
    }
  }

  // 인챈트는 같은 목록을 쓰는 아이템끼리 묶음 번호 하나로 가리킨다. 여기서 풀어 싣는다.
  const enchants = [];
  const group = record.enchants === undefined ? null : shard.enchantGroups?.[record.enchants];
  for (const id of Array.isArray(group) ? group : []) {
    const def = shard.enchants?.[id];
    if (def) enchants.push({ id: Number(id), ...def });
  }

  const body = {
    item: { ...record, name, category },
    upgrades,
    abilities,
    enchants,
    levels: record.reforge ? (shard.levels ?? []) : [],
    updated: shard.updated ?? '',
  };

  return new Response(JSON.stringify(body), {
    headers: { ...jsonHeaders, 'x-equip-shard': fromMemory ? 'memory' : 'kv' },
  });
}

/** 장비 칸 하나를 통째로 갈아 끼운다. 운영자가 한꺼번에 등록할 때 쓰는 경로다. */
async function putEquipShard(request, env, cors) {
  const raw = await request.text();
  if (raw.length > EQUIP_SHARD_MAX_BYTES) {
    return errorResponse('EQUIP_TOO_LARGE', '장비 칸이 너무 큽니다.', 413, cors);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return errorResponse('EQUIP_INVALID_BODY', '보낸 내용을 읽지 못했습니다.', 400, cors);
  }

  const category = cleanText(payload?.category, CARD_NAME_MAX);
  if (!category) return errorResponse('EQUIP_CATEGORY_REQUIRED', '카테고리가 없습니다.', 400, cors);
  if (!isPlainObject(payload.items)) {
    return errorResponse('EQUIP_ITEMS_REQUIRED', '아이템 목록이 없습니다.', 400, cors);
  }

  const count = Object.keys(payload.items).length;
  await env.ITEM_CARDS.put(
    await equipKey(category),
    JSON.stringify({
      category,
      updated: new Date().toISOString().slice(0, 10),
      count,
      items: payload.items,
      upgrades: isPlainObject(payload.upgrades) ? payload.upgrades : {},
      abilities: isPlainObject(payload.abilities) ? payload.abilities : {},
      levels: Array.isArray(payload.levels) ? payload.levels : [],
      enchants: isPlainObject(payload.enchants) ? payload.enchants : {},
      enchantGroups: isPlainObject(payload.enchantGroups) ? payload.enchantGroups : {},
    }),
  );
  // 이 인스턴스가 들고 있던 옛 칸은 버린다. 방금 올린 사람이 옛 것을 보지 않게.
  shardCacheOf(env).delete(await equipKey(category));

  return new Response(JSON.stringify({ category, count }), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowList = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const cors = corsHeaders(origin, allowList);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    /**
     * 아이콘은 출처 검사보다 앞에 둔다.
     *
     * <img src> 로 불리는 요청에는 Origin 헤더가 없다. 아래 허용 목록 검사는 Origin 이
     * 없는 요청을 막도록 되어 있으므로, 여기서 갈라 두지 않으면 사전 화면의 아이콘이
     * 전부 403 으로 깨진다. 어차피 공개 이미지라 막을 것도 없다.
     */
    if (request.method === 'GET' && url.pathname.startsWith(ICON_PATH_PREFIX)) {
      return serveIcon(url, env);
    }

    // origin 허용 목록을 지정했다면 그 밖의 호출은 거절한다.
    // (브라우저가 아닌 클라이언트는 Origin 을 안 보내므로 함께 막힌다.)
    if (allowList.length > 0 && !allowList.includes(origin)) {
      return errorResponse(
        'PROXY_ORIGIN_DENIED',
        '허용되지 않은 출처입니다.',
        403,
        corsHeaders('', allowList),
      );
    }

    // 이슈 제보만 POST 다. 넥슨 중계와 섞이지 않게 여기서 갈라 둔다.
    if (url.pathname === ISSUE_PATH) {
      if (request.method !== 'POST') {
        return errorResponse('REPORT_METHOD_NOT_ALLOWED', 'POST 로 보내 주세요.', 405, cors);
      }
      return createIssue(request, env, cors);
    }

    // 방문자가 쓰는 읽기 경로. 화면에 보이는 이름만 받아 그만큼만 돌려준다.
    if (url.pathname === CARD_LOOKUP_PATH) {
      if (request.method !== 'POST') {
        return errorResponse('CARD_METHOD_NOT_ALLOWED', 'POST 로 보내 주세요.', 405, cors);
      }
      return lookupCards(request, env, cors);
    }

    // 장비 정보 읽기. 아이템 하나씩만 돌려준다.
    if (url.pathname === EQUIP_PATH) {
      if (request.method !== 'GET') {
        return errorResponse('EQUIP_METHOD_NOT_ALLOWED', 'GET 으로 보내 주세요.', 405, cors);
      }
      return lookupEquipment(request, url, env, cors);
    }

    // 장비 칸 쓰기는 운영자만.
    if (url.pathname === EQUIP_SHARD_PATH) {
      const problem = adminProblem(request, env, cors);
      if (problem) return problem;
      if (request.method !== 'PUT') {
        return errorResponse('EQUIP_METHOD_NOT_ALLOWED', 'PUT 으로 보내 주세요.', 405, cors);
      }
      return putEquipShard(request, env, cors);
    }

    // 여기부터는 운영자만. 키가 맞지 않으면 아래로 내려가지 않는다.
    if (
      url.pathname === CARD_VERIFY_PATH ||
      url.pathname === CARD_PATH ||
      url.pathname === CARD_ICONS_PATH ||
      url.pathname === CARD_SHARD_PATH ||
      url.pathname === CARD_MAPS_PATH
    ) {
      const problem = adminProblem(request, env, cors);
      if (problem) return problem;

      if (url.pathname === CARD_VERIFY_PATH) {
        if (request.method !== 'POST') {
          return errorResponse('CARD_METHOD_NOT_ALLOWED', 'POST 로 보내 주세요.', 405, cors);
        }
        return new Response(null, {
          status: 204,
          headers: { ...cors, 'cache-control': 'no-store' },
        });
      }

      if (url.pathname === CARD_ICONS_PATH) {
        if (request.method !== 'POST') {
          return errorResponse('CARD_METHOD_NOT_ALLOWED', 'POST 로 보내 주세요.', 405, cors);
        }
        return putIcons(request, env, cors);
      }

      if (url.pathname === CARD_SHARD_PATH) {
        if (request.method !== 'PUT') {
          return errorResponse('CARD_METHOD_NOT_ALLOWED', 'PUT 으로 보내 주세요.', 405, cors);
        }
        return putShard(request, env, cors);
      }

      if (url.pathname === CARD_MAPS_PATH) {
        if (request.method !== 'POST') {
          return errorResponse('CARD_METHOD_NOT_ALLOWED', 'POST 로 보내 주세요.', 405, cors);
        }
        return rebuildIconMap(url, env, cors);
      }

      if (request.method === 'POST') return saveCard(request, env, cors);
      if (request.method === 'DELETE') return deleteCard(url, env, cors);
      return errorResponse('CARD_METHOD_NOT_ALLOWED', 'POST 나 DELETE 로 보내 주세요.', 405, cors);
    }

    if (request.method !== 'GET') {
      return errorResponse('PROXY_METHOD_NOT_ALLOWED', 'GET 요청만 중계합니다.', 405, cors);
    }

    if (!env.NEXON_API_KEY) {
      return errorResponse(
        'PROXY_NOT_CONFIGURED',
        '워커에 NEXON_API_KEY 시크릿이 설정되지 않았습니다.',
        500,
        cors,
      );
    }

    // 튼튼한 주머니 찾기. 한 채널의 NPC 17명을 한 번에 불러 주머니 줄만 돌려준다.
    if (url.pathname === BAG_PATH) return findBags(url, env, cors);
    // 마그 멜 통행증 찾기. 한 서버의 모든 채널에서 피오나트를 불러 통행증 줄만 돌려준다.
    if (url.pathname === PASS_PATH) return findPasses(url, env, cors);

    if (!ALLOWED_PATHS.some((pattern) => pattern.test(url.pathname))) {
      return errorResponse(
        'PROXY_PATH_DENIED',
        '이 프록시가 중계하지 않는 경로입니다.',
        403,
        cors,
      );
    }

    const cacheSeconds = Number(env.CACHE_SECONDS ?? DEFAULT_CACHE_SECONDS) || 0;
    const upstream = new URL(NEXON_ORIGIN + url.pathname + url.search);

    let response;
    try {
      response = await fetch(upstream.toString(), {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-nxopen-api-key': env.NEXON_API_KEY,
        },
        // 같은 질의가 몰릴 때 넥슨 쪽 호출량을 줄인다.
        cf: cacheSeconds > 0 ? { cacheTtl: cacheSeconds, cacheEverything: true } : undefined,
      });
    } catch {
      return errorResponse('PROXY_UPSTREAM_UNREACHABLE', '넥슨 API 에 연결하지 못했습니다.', 502, cors);
    }

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        ...cors,
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
      },
    });
  },
};
