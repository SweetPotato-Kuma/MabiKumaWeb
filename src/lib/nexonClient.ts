import { resolveEndpoint } from './settings';

/** 넥슨 오픈 API 가 돌려주는 에러 본문 형태. */
interface NexonErrorBody {
  error?: {
    name?: string;
    message?: string;
  };
}

/** API 호출 실패를 한 가지 타입으로 모아 화면에서 분기하기 쉽게 만든다. */
export class NexonApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = 'UNKNOWN') {
    super(message);
    this.name = 'NexonApiError';
    this.status = status;
    this.code = code;
  }

  /** API 키가 없거나 잘못된 경우 — 설정 화면으로 보내면 된다. */
  get isApiKeyProblem(): boolean {
    return this.code === 'MISSING_API_KEY' || this.code === 'OPENAPI00005';
  }
}

export type QueryParams = Record<string, string | number | undefined | null>;

const MESSAGE_BY_CODE: Record<string, string> = {
  OPENAPI00001: '서버 내부 오류입니다. 잠시 후 다시 시도해 주세요.',
  OPENAPI00002: '권한이 없는 API 입니다.',
  OPENAPI00003: '유효하지 않은 식별자입니다.',
  OPENAPI00004: '요청 파라미터가 잘못되었습니다.',
  OPENAPI00005: '유효하지 않은 API 키입니다. 설정에서 키를 다시 확인해 주세요.',
  OPENAPI00006: '유효하지 않은 API 경로입니다.',
  OPENAPI00007: 'API 호출량을 초과했습니다. 잠시 후 다시 시도해 주세요.',
  OPENAPI00009: '데이터 준비 중입니다. 잠시 후 다시 시도해 주세요.',
  OPENAPI00010: '현재 API 점검 중입니다.',
  OPENAPI00011: 'API 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
  PROXY_ORIGIN_DENIED: '이 사이트에서 프록시를 쓸 수 없습니다. 프록시의 허용 출처 설정을 확인해 주세요.',
  PROXY_PATH_DENIED: '프록시가 중계하지 않는 경로입니다.',
  PROXY_NOT_CONFIGURED: '프록시에 API 키가 설정되지 않았습니다.',
  PROXY_UPSTREAM_UNREACHABLE: '프록시가 넥슨 API 에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  PROXY_METHOD_NOT_ALLOWED: '프록시가 허용하지 않는 요청 방식입니다.',
};

function buildUrl(baseUrl: string, path: string, params: QueryParams): string {
  const base = baseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}${path}`, window.location.origin);

  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null || raw === '') continue;
    url.searchParams.set(key, String(raw));
  }

  return url.toString();
}

async function toApiError(response: Response): Promise<NexonApiError> {
  let code = `HTTP_${response.status}`;
  let message = `API 요청이 실패했습니다. (HTTP ${response.status})`;

  try {
    const body = (await response.json()) as NexonErrorBody;
    if (body.error?.name) {
      code = body.error.name;
      message = MESSAGE_BY_CODE[code] ?? body.error.message ?? message;
    }
  } catch {
    // JSON 이 아닌 응답은 위의 기본 메시지를 그대로 쓴다.
  }

  return new NexonApiError(message, response.status, code);
}

/**
 * 넥슨 오픈 API GET 호출 공통 진입점.
 * 인증 헤더(x-nxopen-api-key)와 에러 변환을 여기서만 처리한다.
 */
export async function nexonFetch<T>(
  path: string,
  params: QueryParams = {},
  signal?: AbortSignal,
): Promise<T> {
  const endpoint = resolveEndpoint();

  // 프록시가 키를 대신 붙여 주는 경우에는 브라우저가 키를 갖고 있을 필요가 없다.
  if (!endpoint.viaProxy && !endpoint.apiKey) {
    throw new NexonApiError(
      'API 키가 없습니다. 설정 화면에서 넥슨 오픈 API 키를 입력해 주세요.',
      0,
      'MISSING_API_KEY',
    );
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (endpoint.apiKey) headers['x-nxopen-api-key'] = endpoint.apiKey;

  let response: Response;
  try {
    response = await fetch(buildUrl(endpoint.baseUrl, path, params), {
      method: 'GET',
      headers,
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new NexonApiError(
      '네트워크 요청이 차단되었습니다. 브라우저 CORS 정책 때문일 수 있습니다. 설정에서 프록시 주소를 지정해 보세요.',
      0,
      'NETWORK',
    );
  }

  if (!response.ok) throw await toApiError(response);

  return (await response.json()) as T;
}
