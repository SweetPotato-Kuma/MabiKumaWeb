import { getProxyUrl } from '@/lib/settings';

export const ACCOUNT_CONSENT_VERSION = '2026-10-10';
export interface Account {
  id: string;
  profile: { nickname: string } | null;
}
export interface RemoteDocument {
  version: 1;
  revision: number;
  entries: Record<string, string>;
  updatedAt: number | null;
}
const BASE = (import.meta.env.VITE_ACCOUNT_API_URL?.trim() || getProxyUrl()).replace(/\/+$/, '');
let expectedAccount: string | null = null;
export function expectAccount(id: string | null): void {
  expectedAccount = id;
}
export const hasAccountEndpoint = () => Boolean(BASE);
export class AccountError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function accountApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!BASE) throw new AccountError('계정 저장 기능을 준비 중입니다.', 503);
  const response = await fetch(`${BASE}/account${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(expectedAccount &&
      path !== '/me' &&
      !path.startsWith('/auth/') &&
      path !== '/challenge' &&
      path !== '/config'
        ? { 'x-mabikuma-account': expectedAccount }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AccountError(
      '계정 서버의 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      response.status || 502,
    );
  }
  if (!response.ok)
    throw new AccountError(payload.error?.message ?? '계정 요청에 실패했습니다.', response.status);
  return payload as T;
}
