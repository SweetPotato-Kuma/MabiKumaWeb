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
 */

const NEXON_ORIGIN = 'https://open.api.nexon.com';
const ISSUE_PATH = '/report/issue';

/** 분류 값과 실제로 붙일 라벨. 화면이 보내는 값은 이 둘 중 하나뿐이다. */
const ISSUE_LABELS = {
  bug: '버그',
  feature: '기능 추가 요청',
};

const TITLE_MIN = 4;
const TITLE_MAX = 120;
const BODY_MIN = 10;
const BODY_MAX = 4000;

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'accept, content-type',
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

    const url = new URL(request.url);

    // 이슈 제보만 POST 다. 넥슨 중계와 섞이지 않게 여기서 갈라 둔다.
    if (url.pathname === ISSUE_PATH) {
      if (request.method !== 'POST') {
        return errorResponse('REPORT_METHOD_NOT_ALLOWED', 'POST 로 보내 주세요.', 405, cors);
      }
      return createIssue(request, env, cors);
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
