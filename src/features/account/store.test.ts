import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteDocument } from './api';
import type * as AccountStore from './store';
import type * as PersonalStorage from '@/lib/personalStorage';

const A = '11111111-1111-1111-1111-111111111111';
const KEY = 'mabikuma:userSettings';
let remote: RemoteDocument;
let fail = false;
let putHook: (() => void) | null = null;
const requests: { path: string; method: string; body: unknown }[] = [];
vi.mock('./api', () => {
  class AccountError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    AccountError,
    expectAccount: vi.fn(),
    hasAccountEndpoint: () => false,
    accountApi: vi.fn(
      async (
        path: string,
        method = 'GET',
        body?: { revision: number; entries: Record<string, string> },
      ) => {
        requests.push({ path, method, body });
        if (fail) throw new Error('offline');
        if (path === '/data' && method === 'GET') return structuredClone(remote);
        if (path === '/data' && method === 'PUT') {
          if (body?.revision !== remote.revision) throw new AccountError('conflict', 409);
          putHook?.();
          putHook = null;
          remote = {
            ...remote,
            revision: remote.revision + 1,
            entries: structuredClone(body.entries),
          };
          return { revision: remote.revision };
        }
        if (path === '/logout') return { ok: true };
        throw new Error(`Unexpected ${path}`);
      },
    ),
  };
});
let store: typeof AccountStore;
let storage: typeof PersonalStorage;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  requests.length = 0;
  fail = false;
  putHook = null;
  remote = { version: 1, revision: 0, entries: {}, updatedAt: null };
  localStorage.clear();
  storage = await import('@/lib/personalStorage');
  store = await import('./store');
});
afterEach(() => {
  storage.switchPersonalAccount(null);
  vi.clearAllTimers();
  vi.useRealTimers();
});
const login = () => store.acceptAccount({ id: A, profile: { nickname: '쿠마' } });
describe('계정 동기화', () => {
  it('기존 비로그인 데이터를 자동 업로드하지 않으며 명시적으로 가져올 때만 저장한다', async () => {
    storage.writePersonal(KEY, 'guest');
    await login();
    await store.syncAccount();
    expect(remote.entries).toEqual({});
    store.importEntries(storage.guestEntries());
    await store.syncAccount();
    expect(remote.entries).toEqual({ [KEY]: 'guest' });
    await store.logoutAccount();
    expect(storage.readPersonal(KEY)).toBe('guest');
  });
  it('서버 저장 중 새로 입력한 변경은 확인되지 않은 상태로 남겨 다음 저장에 보낸다', async () => {
    await login();
    storage.writePersonal(KEY, 'first');
    putHook = () => storage.writePersonal(KEY, 'second');
    await store.syncAccount();
    expect(remote.entries[KEY]).toBe('first');
    expect(storage.getPersonalDocument().base[KEY]).toBe('first');
    expect(storage.readPersonal(KEY)).toBe('second');
    await store.syncAccount();
    expect(remote.entries[KEY]).toBe('second');
  });
  it('서로 다른 항목의 원격 수정은 반영하고 동일 항목 충돌은 자동 덮어쓰지 않는다', async () => {
    remote = { ...remote, revision: 1, entries: { [KEY]: 'old', 'mabikuma:themeMode': 'light' } };
    await login();
    storage.writePersonal(KEY, 'local');
    remote = { ...remote, revision: 2, entries: { [KEY]: 'old', 'mabikuma:themeMode': 'dark' } };
    await store.syncAccount();
    expect(remote.entries).toEqual({ [KEY]: 'local', 'mabikuma:themeMode': 'dark' });
    storage.writePersonal(KEY, 'local2');
    remote = { ...remote, revision: 4, entries: { ...remote.entries, [KEY]: 'remote2' } };
    await store.syncAccount();
    expect(remote.entries[KEY]).toBe('remote2');
    expect(storage.readPersonal(KEY)).toBe('local2');
    store.chooseConflict('remote');
    expect(storage.readPersonal(KEY)).toBe('remote2');
  });
  it('통신 실패로 입력을 지우거나 다른 계정·비로그인 데이터로 전송하지 않는다', async () => {
    await login();
    storage.writePersonal(KEY, 'pending');
    fail = true;
    await store.syncAccount();
    expect(storage.readPersonal(KEY)).toBe('pending');
    expect(storage.getPersonalDocument().base).toEqual({});
    fail = false;
    await store.syncAccount();
    expect(remote.entries[KEY]).toBe('pending');
  });
  it('충돌 항목을 선택해도 충돌하지 않는 양쪽의 변경을 보존한다', async () => {
    remote = { ...remote, revision: 1, entries: { [KEY]: 'old', 'mabikuma:themeMode': 'light' } };
    await login();
    storage.writePersonal(KEY, 'local');
    storage.writePersonal('mabikuma:coinFx', 'off');
    remote = { ...remote, revision: 2, entries: { [KEY]: 'remote', 'mabikuma:themeMode': 'dark' } };
    await store.syncAccount();
    store.chooseConflict('local');
    await store.syncAccount();
    expect(remote.entries).toEqual({
      [KEY]: 'local',
      'mabikuma:themeMode': 'dark',
      'mabikuma:coinFx': 'off',
    });
  });
});
