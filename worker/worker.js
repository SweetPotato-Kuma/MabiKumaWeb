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
 */

const NEXON_ORIGIN = 'https://open.api.nexon.com';

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'accept',
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

    if (request.method !== 'GET') {
      return errorResponse('PROXY_METHOD_NOT_ALLOWED', 'GET 요청만 중계합니다.', 405, cors);
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

    if (!env.NEXON_API_KEY) {
      return errorResponse(
        'PROXY_NOT_CONFIGURED',
        '워커에 NEXON_API_KEY 시크릿이 설정되지 않았습니다.',
        500,
        cors,
      );
    }

    const url = new URL(request.url);
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
