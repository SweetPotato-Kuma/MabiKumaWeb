import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RemoteDocument } from './api';
import type * as AccountStore from './store';
import type * as PersonalStorage from '@/lib/personalStorage';

const A = '11111111-1111-1111-1111-111111111111';
const KEY = 'mabikuma:userSettings';
let remote: RemoteDocument;
let fail = false;
let putHook: (() => void) | null = null;
let endpoint = false;
let sessionStatus = 200;
let stop: (() => void) | undefined;
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
    hasAccountEndpoint: () => endpoint,
    accountApi: vi.fn(
      async (
        path: string,
        method = 'GET',
        body?: { revision: number; entries: Record<string, string>; nickname?: string },
      ) => {
        requests.push({ path, method, body });
        if (fail) throw new Error('offline');
        if (path === '/config') return { enabled: true };
        if (path === '/me') {
          if (sessionStatus !== 200) throw new AccountError('session expired', sessionStatus);
          return { id: A, profile: { nickname: '쿠마' } };
        }
        if (path === '/data' && method === 'GET') return structuredClone(remote);
        if (path === '/profile' && method === 'PATCH')
          return { id: A, profile: { nickname: body?.nickname } };
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
  endpoint = false;
  sessionStatus = 200;
  stop = undefined;
  remote = { version: 1, revision: 0, entries: {}, updatedAt: null };
  localStorage.clear();
  storage = await import('@/lib/personalStorage');
  store = await import('./store');
});
afterEach(() => {
  stop?.();
  storage.switchPersonalAccount(null);
  vi.clearAllTimers();
  vi.useRealTimers();
});
const login = () => store.acceptAccount({ id: A, profile: { nickname: '쿠마' } });
describe('계정 동기화', () => {
  it('닉네임 변경 중 미전송 입력을 유지하고 성공한 동기화 시점만 갱신한다', async () => {
    storage.writePersonal(KEY, 'guest');
    const { result } = renderHook(() => store.useAccountState());
    await act(() => login());
    expect(result.current.lastSyncedAt).toBeNull();
    await act(() => store.updateNickname('새쿠마'));
    expect(result.current.account?.profile?.nickname).toBe('새쿠마');
    expect(storage.readPersonal(KEY)).toBe('guest');
    await act(() => store.syncAccount());
    const synced = result.current.lastSyncedAt;
    expect(synced).toBe(Date.now());
    vi.setSystemTime(Date.now() + 1000);
    storage.writePersonal(KEY, 'pending');
    fail = true;
    await act(() => store.syncAccount());
    expect(result.current.lastSyncedAt).toBe(synced);
    expect(storage.readPersonal(KEY)).toBe('pending');
    fail = false;
    await act(() => store.logoutAccount());
    expect(result.current.lastSyncedAt).toBeNull();
  });
  it('기존 비로그인 데이터와 이후 입력을 사용자 조작 없이 계정에 자동 저장한다', async () => {
    storage.writePersonal(KEY, 'guest');
    stop = store.startAccountSync();
    await login();
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries).toEqual({ [KEY]: 'guest' });
    storage.writePersonal(KEY, 'changed');
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries[KEY]).toBe('changed');
    await store.logoutAccount();
    expect(storage.readPersonal(KEY)).toBe('guest');
  });
  it('첫 연결은 계정 값을 우선하고 계정에 없는 로컬 항목만 추가한다', async () => {
    storage.writePersonal(KEY, 'guest');
    storage.writePersonal('mabikuma:coinFx', 'off');
    remote = { ...remote, revision: 5, entries: { [KEY]: 'account' } };
    await login();
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries).toEqual({ [KEY]: 'account', 'mabikuma:coinFx': 'off' });
    expect(storage.guestEntries()[KEY]).toBe('guest');
  });
  it('계정에서 수정·삭제한 값은 재로그인 시 오래된 비로그인 값으로 되살리지 않는다', async () => {
    storage.writePersonal(KEY, 'guest');
    await login();
    await store.syncAccount();
    storage.removePersonal(KEY);
    await store.syncAccount();
    await store.logoutAccount();
    await login();
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries).toEqual({});
    expect(storage.readPersonal(KEY)).toBeNull();
    expect(storage.guestEntries()[KEY]).toBe('guest');
  });
  it('로그아웃 이후 바뀐 로컬 값은 다시 로그인하면 자동 반영한다', async () => {
    storage.writePersonal(KEY, 'guest');
    await login();
    await store.syncAccount();
    await store.logoutAccount();
    storage.writePersonal(KEY, 'guest edited');
    await login();
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries[KEY]).toBe('guest edited');
  });
  it('다른 기기와 비로그인 입력이 동시에 같은 항목을 바꾸면 두 값을 보존해 충돌을 처리한다', async () => {
    storage.writePersonal(KEY, 'guest');
    await login();
    await store.syncAccount();
    await store.logoutAccount();
    storage.writePersonal(KEY, 'guest edited');
    remote = { ...remote, revision: remote.revision + 1, entries: { [KEY]: 'other device' } };
    await login();
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries[KEY]).toBe('other device');
    expect(storage.readPersonal(KEY)).toBe('guest edited');
    store.chooseConflict('local');
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries[KEY]).toBe('guest edited');
  });
  it('새로고침에서는 세션을 자동 확인하고 빈 브라우저로 서버 데이터를 지우지 않는다', async () => {
    endpoint = true;
    remote = { ...remote, revision: 6, entries: { [KEY]: 'account' } };
    stop = store.startAccountSync();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.getPersonalAccount()).toBe(A);
    expect(storage.readPersonal(KEY)).toBe('account');
    expect(requests.some(({ path }) => path === '/me')).toBe(true);
    expect(requests.some(({ path }) => path === '/challenge' || path === '/auth/google')).toBe(
      false,
    );
    expect(requests.some(({ method }) => method === 'PUT')).toBe(false);
    await store.logoutAccount();
    sessionStatus = 401;
    await vi.advanceTimersByTimeAsync(30000);
    expect(storage.getPersonalAccount()).toBeNull();
    expect(requests.filter(({ path }) => path === '/me')).toHaveLength(1);
  });
  it('오프라인으로 세션을 확인하지 못하면 연결 복구 시 자동 로그인과 저장을 재시도한다', async () => {
    endpoint = true;
    fail = true;
    storage.writePersonal(KEY, 'guest');
    stop = store.startAccountSync();
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.getPersonalAccount()).toBeNull();
    fail = false;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.getPersonalAccount()).toBe(A);
    expect(remote.entries[KEY]).toBe('guest');
  });
  it('등록 전에는 로컬 입력을 보내지 않고 등록을 마쳐야 자동 저장한다', async () => {
    storage.writePersonal(KEY, 'guest');
    await store.acceptAccount({ id: A, profile: null });
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.getPersonalAccount()).toBeNull();
    expect(requests.some(({ path }) => path === '/data')).toBe(false);
    await login();
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries[KEY]).toBe('guest');
  });
  it('인증 이후 계정 데이터 로딩이 실패해도 연결 복구 시 자동으로 다시 불러온다', async () => {
    stop = store.startAccountSync();
    storage.writePersonal(KEY, 'guest');
    fail = true;
    await expect(login()).rejects.toThrow('offline');
    expect(storage.getPersonalAccount()).toBeNull();
    fail = false;
    endpoint = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.getPersonalAccount()).toBe(A);
    expect(remote.entries[KEY]).toBe('guest');
  });
  it('탭 간 충돌은 수동 재로그인 없이 서버와 비교해 충돌 선택을 제공한다', async () => {
    stop = store.startAccountSync();
    remote = { ...remote, revision: 1, entries: { [KEY]: 'old' } };
    await login();
    storage.writePersonal(KEY, 'local');
    remote = { ...remote, revision: 2, entries: { [KEY]: 'other tab' } };
    window.dispatchEvent(new Event('mabikuma:personal-storage-conflict'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.readPersonal(KEY)).toBe('local');
    expect(remote.entries[KEY]).toBe('other tab');
    store.chooseConflict('local');
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries[KEY]).toBe('local');
  });
  it('로그아웃 뒤 다른 계정에 로그인해도 이전 계정의 미전송 내용을 보내지 않는다', async () => {
    await login();
    storage.writePersonal(KEY, 'account A pending');
    await store.logoutAccount();
    await store.acceptAccount({
      id: '22222222-2222-2222-2222-222222222222',
      profile: { nickname: '다른 계정' },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries).toEqual({});
    expect(storage.loadPersonalDocument(A).entries[KEY]).toBe('account A pending');
  });
  it('오래된 계정 사본도 읽으며 가져온 입력 표시를 이후 저장에서 유지한다', async () => {
    localStorage.setItem(
      `mabikuma:account-data:${A}`,
      JSON.stringify({
        version: 1,
        revision: 0,
        base: {},
        entries: { [KEY]: 'pending' },
      }),
    );
    storage.writePersonal('mabikuma:coinFx', 'off');
    await login();
    await store.syncAccount();
    expect(remote.entries).toEqual({ [KEY]: 'pending', 'mabikuma:coinFx': 'off' });
    expect(storage.loadPersonalDocument(A).guestBase).toEqual({ 'mabikuma:coinFx': 'off' });
  });
  it('이전 형식의 사본에서 삭제한 항목도 오래된 비로그인 값으로 되살리지 않는다', async () => {
    localStorage.setItem(
      `mabikuma:account-data:${A}`,
      JSON.stringify({
        version: 1,
        revision: 1,
        base: { [KEY]: 'deleted' },
        entries: {},
      }),
    );
    storage.writePersonal(KEY, 'guest');
    remote = { ...remote, revision: 2, entries: {} };
    await login();
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.entries).toEqual({});
    expect(storage.readPersonal(KEY)).toBeNull();
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
