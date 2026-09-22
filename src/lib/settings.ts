import { useCallback, useSyncExternalStore } from 'react';

const API_KEY_STORAGE_KEY = 'mabikuma:apiKey';
const API_BASE_URL_STORAGE_KEY = 'mabikuma:apiBaseUrl';

/**
 * 키 취급 원칙
 *
 * 정적 사이트에는 비밀을 둘 곳이 없다. 번들에 키를 넣으면 개발자도구에서 그대로 보인다.
 * 그래서 두 가지 경로만 쓴다.
 *
 * 1. 프록시 경로 — Cloudflare Worker(`VITE_PROXY_URL`)가 키를 들고 있고,
 *    브라우저는 키 없이 워커를 호출한다. 방문자 기본 경로.
 * 2. 직접 경로 — 사용자가 설정 화면에 자기 키를 넣으면 그 키로 넥슨 API 를 직접 부른다.
 *    키는 그 사람 브라우저의 localStorage 에만 남는다.
 *
 * `VITE_NEXON_API_KEY` 는 로컬 개발 편의용 기본값일 뿐이며 배포 워크플로는 주입하지 않는다.
 */
const ENV_API_KEY = import.meta.env.VITE_NEXON_API_KEY ?? '';

/** 키를 대신 들고 있는 프록시 주소. 비어 있으면 프록시 경로를 쓰지 않는다. */
const PROXY_URL = (import.meta.env.VITE_PROXY_URL ?? '').trim().replace(/\/+$/, '');

/** 키를 직접 들고 호출할 때의 대상. 개발 서버에서는 Vite 프록시를 타 CORS 를 피한다. */
const DIRECT_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '/nexon-api' : 'https://open.api.nexon.com');

type Listener = () => void;

const listeners = new Set<Listener>();

function emit(): void {
  endpointSnapshot = computeEndpoint();
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // 시크릿 모드 등 localStorage 접근이 막힌 환경
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // 저장 실패는 조용히 무시하고 메모리 값만 쓴다.
  }
}

let apiKeyCache = readStorage(API_KEY_STORAGE_KEY) ?? ENV_API_KEY;
let apiBaseUrlCache = readStorage(API_BASE_URL_STORAGE_KEY) ?? '';

export function getApiKey(): string {
  return apiKeyCache;
}

export function setApiKey(value: string): void {
  apiKeyCache = value.trim();
  writeStorage(API_KEY_STORAGE_KEY, apiKeyCache);
  emit();
}

export function getApiBaseUrlOverride(): string {
  return apiBaseUrlCache;
}

export function setApiBaseUrlOverride(value: string): void {
  apiBaseUrlCache = value.trim().replace(/\/+$/, '');
  writeStorage(API_BASE_URL_STORAGE_KEY, apiBaseUrlCache);
  emit();
}

export function getProxyUrl(): string {
  return PROXY_URL;
}

export function getDirectBaseUrl(): string {
  return DIRECT_BASE_URL;
}

/** 이번 요청을 어디로, 어떤 키로 보낼지. */
export interface ResolvedEndpoint {
  baseUrl: string;
  /** 빈 문자열이면 요청에 키를 싣지 않는다. */
  apiKey: string;
  /** 프록시가 키를 대신 붙여 주는 경로인지. */
  viaProxy: boolean;
}

/**
 * 사용자가 자기 키를 넣었으면 그 키로 직접 호출한다(프록시 한도를 쓰지 않도록).
 * 키가 없으면 프록시를 탄다. 둘 다 없으면 키를 요구한다.
 */
function computeEndpoint(): ResolvedEndpoint {
  const key = apiKeyCache;
  const override = apiBaseUrlCache;

  if (key) {
    return { baseUrl: override || DIRECT_BASE_URL, apiKey: key, viaProxy: false };
  }
  if (override) {
    return { baseUrl: override, apiKey: '', viaProxy: true };
  }
  if (PROXY_URL) {
    return { baseUrl: PROXY_URL, apiKey: '', viaProxy: true };
  }
  return { baseUrl: DIRECT_BASE_URL, apiKey: '', viaProxy: false };
}

/**
 * useSyncExternalStore 는 같은 상태면 같은 객체를 돌려받아야 한다.
 * 매번 새로 만들면 무한 렌더에 빠지므로 스냅샷을 들고 emit 때만 갱신한다.
 */
let endpointSnapshot: ResolvedEndpoint = computeEndpoint();

export function resolveEndpoint(): ResolvedEndpoint {
  return endpointSnapshot;
}

/** 키 없이도 조회가 되는 상태인지. 안내 문구 분기에 쓴다. */
export function canQueryWithoutKey(): boolean {
  return Boolean(PROXY_URL) || Boolean(apiBaseUrlCache);
}

/** API 키를 읽고 쓰는 훅. 설정 화면에서 바꾸면 앱 전체가 즉시 반응한다. */
export function useApiKey(): readonly [string, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, getApiKey, getApiKey);
  const setValue = useCallback((next: string) => {
    setApiKey(next);
  }, []);
  return [value, setValue] as const;
}

/** 프록시/베이스 URL 직접 지정값을 읽고 쓰는 훅. */
export function useApiBaseUrlOverride(): readonly [string, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, getApiBaseUrlOverride, getApiBaseUrlOverride);
  const setValue = useCallback((next: string) => {
    setApiBaseUrlOverride(next);
  }, []);
  return [value, setValue] as const;
}

/** 현재 어떤 경로로 나가는지 화면에 보여 주기 위한 훅. */
export function useEndpointMode(): ResolvedEndpoint {
  return useSyncExternalStore(subscribe, resolveEndpoint, resolveEndpoint);
}

/** 지금 조회가 가능한 상태인지 — 내 키가 있거나 프록시가 붙어 있으면 참. */
export function useCanQuery(): boolean {
  const endpoint = useEndpointMode();
  return Boolean(endpoint.apiKey) || endpoint.viaProxy;
}
