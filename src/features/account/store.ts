import { useSyncExternalStore } from 'react';
import { validateEntries } from '../../../shared/personal-data.js';
import {
  getPersonalAccount,
  getPersonalDocument,
  guestEntries,
  loadPersonalDocument,
  mergePersonal,
  subscribePersonalStorage,
  switchPersonalAccount,
  updatePersonalDocument,
  type PersonalEntries,
} from '@/lib/personalStorage';
import {
  accountApi,
  AccountError,
  expectAccount,
  hasAccountEndpoint,
  type Account,
  type RemoteDocument,
} from './api';

interface AccountState {
  account: Account | null;
  phase: 'local' | 'loading' | 'ready' | 'pending' | 'error' | 'conflict';
  message: string;
  generation: number;
  conflict: RemoteDocument | null;
  lastSyncedAt: number | null;
}
let state: AccountState = {
  account: null,
  phase: 'local',
  message: '',
  generation: 0,
  conflict: null,
  lastSyncedAt: null,
};
const listeners = new Set<() => void>();
const emit = (patch: Partial<AccountState>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};
export function useAccountState(): AccountState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
}
let busy = false;
let epoch = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;
const pending = () =>
  JSON.stringify(getPersonalDocument().entries) !== JSON.stringify(getPersonalDocument().base);
function scheduleSync() {
  if (timer) clearTimeout(timer);
  if (
    !state.account?.profile ||
    getPersonalAccount() !== state.account.id ||
    state.phase === 'conflict'
  )
    return;
  if (pending()) emit({ phase: 'pending', message: '계정 저장 대기 중' });
  timer = setTimeout(() => {
    timer = undefined;
    void syncAccount();
  }, 1000);
}
function checkRemote(value: RemoteDocument): RemoteDocument {
  if (
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !validateEntries(value.entries)
  )
    throw new Error('계정 데이터의 형식을 확인하지 못했습니다.');
  return value;
}
function notifyOtherTabs() {
  try {
    window.localStorage.setItem('mabikuma:account-session-change', crypto.randomUUID());
  } catch {
    /* 입력 데이터는 건드리지 않는다. */
  }
}
async function activate(account: Account): Promise<void> {
  const activation = ++epoch;
  if (timer) clearTimeout(timer);
  expectAccount(account.id);
  // 새 세션으로 전환하는 동안 이전 계정의 입력이나 전송 큐를 사용하지 않는다.
  switchPersonalAccount(null);
  emit({
    account,
    phase: 'loading',
    lastSyncedAt: null,
    message: '계정 데이터를 불러오는 중',
    generation: state.generation + 1,
  });
  if (!account.profile) {
    switchPersonalAccount(null);
    emit({
      account,
      phase: 'local',
      generation: state.generation + 1,
      conflict: null,
      message: '',
    });
    return;
  }
  const remote = checkRemote(await accountApi<RemoteDocument>('/data'));
  if (activation !== epoch) return;
  const cached = loadPersonalDocument(account.id);
  const guest = guestEntries();
  if (!validateEntries(guest)) throw new Error('기존 저장 내용의 형식이나 용량을 확인해 주세요.');
  const local = { ...cached.entries };
  for (const [key, value] of Object.entries(guest)) {
    if (cached.guestBase === undefined) {
      // 처음 연결하는 브라우저에서는 계정의 기존 값이 우선이다.
      if (
        local[key] === undefined &&
        cached.base[key] === undefined &&
        remote.entries[key] === undefined
      )
        local[key] = value;
    } else if (value !== cached.guestBase[key] && local[key] === cached.base[key]) {
      // 로그아웃 후 바뀐 입력만 반영한다. 미전송 계정 입력은 별도로 보존한다.
      local[key] = value;
    }
  }
  const merged = mergePersonal(cached.base, local, remote.entries);
  const entries = merged.conflicts.length ? local : merged.entries;
  if (!validateEntries(entries))
    throw new Error('로컬 내용과 계정 내용을 합치면 저장 가능한 용량을 초과합니다.');
  switchPersonalAccount(account.id, {
    version: 1,
    revision: merged.conflicts.length ? cached.revision : remote.revision,
    base: merged.conflicts.length ? cached.base : remote.entries,
    entries,
    guestBase: guest,
  });
  emit({
    account,
    phase: merged.conflicts.length ? 'conflict' : pending() ? 'pending' : 'ready',
    generation: state.generation + 1,
    conflict: merged.conflicts.length ? remote : null,
    lastSyncedAt: !merged.conflicts.length && !pending() ? Date.now() : null,
    message: merged.conflicts.length
      ? '이 기기와 계정의 수정 내용이 겹칩니다. 사용할 내용을 선택해 주세요.'
      : '',
  });
  if (!merged.conflicts.length) scheduleSync();
}
export async function acceptAccount(account: Account): Promise<void> {
  try {
    await activate(account);
    notifyOtherTabs();
  } catch (error) {
    emit({
      phase: 'error',
      message: error instanceof Error ? error.message : '계정 데이터를 확인하지 못했습니다.',
    });
    throw error;
  }
}
export async function updateNickname(nickname: string): Promise<void> {
  const id = state.account?.id;
  if (!id || !state.account?.profile) throw new Error('먼저 프로필을 등록해 주세요.');
  const operation = epoch;
  const account = await accountApi<Account>('/profile', 'PATCH', { nickname });
  if (operation !== epoch) return;
  if (account.id !== id || !account.profile) throw new Error('프로필 변경을 확인하지 못했습니다.');
  // 프로필 수정은 입력 사본이나 전송 대기열을 다시 초기화하지 않는다.
  emit({ account });
  notifyOtherTabs();
}
export async function syncAccount(): Promise<void> {
  const id = state.account?.id;
  if (
    busy ||
    !id ||
    !state.account?.profile ||
    getPersonalAccount() !== id ||
    state.phase === 'conflict'
  )
    return;
  busy = true;
  const operation = epoch;
  try {
    const remote = checkRemote(await accountApi<RemoteDocument>('/data'));
    if (operation !== epoch) return;
    const current = getPersonalDocument();
    const merged = mergePersonal(current.base, current.entries, remote.entries);
    if (merged.conflicts.length) {
      emit({
        phase: 'conflict',
        conflict: remote,
        message: '다른 탭이나 기기와 수정 내용이 겹칩니다. 사용할 내용을 선택해 주세요.',
      });
      return;
    }
    const refreshed = JSON.stringify(current.entries) !== JSON.stringify(merged.entries);
    updatePersonalDocument({
      ...current,
      revision: remote.revision,
      base: remote.entries,
      entries: merged.entries,
    });
    if (refreshed) emit({ generation: state.generation + 1 });
    if (!pending()) {
      emit({ phase: 'ready', message: '', lastSyncedAt: Date.now() });
      return;
    }
    const sent = getPersonalDocument();
    const saved = await accountApi<{ revision: number }>('/data', 'PUT', {
      version: 1,
      revision: sent.revision,
      entries: sent.entries,
    });
    if (operation !== epoch) return;
    if (!Number.isSafeInteger(saved.revision) || saved.revision !== sent.revision + 1)
      throw new Error('서버의 저장 확인을 읽지 못했습니다.');
    // 저장 요청 도중 입력한 값은 보존하고, 서버가 확인한 내용만 base로 기록한다.
    updatePersonalDocument({
      ...getPersonalDocument(),
      revision: saved.revision,
      base: sent.entries,
    });
    emit({
      phase: pending() ? 'pending' : 'ready',
      message: pending() ? '계정 저장 대기 중' : '',
      lastSyncedAt: pending() ? state.lastSyncedAt : Date.now(),
    });
  } catch (error) {
    if (operation !== epoch) return;
    if (error instanceof AccountError && error.status === 409) {
      emit({ phase: 'pending', message: '다른 기기의 수정 내용을 다시 확인합니다.' });
      timer = setTimeout(() => {
        timer = undefined;
        void syncAccount();
      }, 1000);
    } else {
      emit({
        phase: 'error',
        message:
          error instanceof AccountError && error.status === 401
            ? '로그인이 만료되었습니다. 다시 로그인하면 이 기기의 저장 대기 내용을 확인합니다.'
            : '계정 저장을 확인하지 못했습니다. 이 기기의 데이터는 유지되며 다시 연결되면 재시도합니다.',
      });
    }
  } finally {
    busy = false;
    if (operation === epoch && state.phase === 'pending' && !timer) scheduleSync();
  }
}
export function chooseConflict(source: 'local' | 'remote'): void {
  const remote = state.conflict;
  if (!remote) return;
  const current = getPersonalDocument();
  const merged = mergePersonal(current.base, current.entries, remote.entries);
  const entries = { ...merged.entries };
  if (source === 'local') {
    for (const key of merged.conflicts) {
      if (current.entries[key] === undefined) delete entries[key];
      else entries[key] = current.entries[key];
    }
  }
  updatePersonalDocument({
    ...current,
    revision: remote.revision,
    base: remote.entries,
    entries,
  });
  emit({
    phase: pending() ? 'pending' : 'ready',
    conflict: null,
    message: '',
    generation: state.generation + 1,
  });
  scheduleSync();
}
export function importEntries(entries: PersonalEntries): void {
  if (!state.account?.profile || state.phase === 'loading' || state.phase === 'conflict')
    throw new Error('먼저 계정 데이터를 확인해 주세요.');
  if (!validateEntries(entries)) throw new Error('가져올 데이터의 형식이나 크기를 확인해 주세요.');
  updatePersonalDocument({ ...getPersonalDocument(), entries });
  emit({ generation: state.generation + 1 });
  scheduleSync();
}
export async function logoutAccount(): Promise<void> {
  // 전송 중인 저장은 끝난 뒤 로그아웃한다. 미전송 값은 해당 계정의 로컬 사본에 보존한다.
  if (busy) throw new Error('저장 확인 중입니다. 잠시 후 로그아웃해 주세요.');
  const operation = epoch;
  await accountApi('/logout', 'POST');
  if (operation !== epoch) return;
  ++epoch;
  if (timer) clearTimeout(timer);
  switchPersonalAccount(null);
  expectAccount(null);
  emit({
    account: null,
    phase: 'local',
    lastSyncedAt: null,
    message: '',
    conflict: null,
    generation: state.generation + 1,
  });
  notifyOtherTabs();
}
export async function deleteAccount(): Promise<void> {
  if (busy) throw new Error('저장 확인 중입니다. 잠시 후 다시 시도해 주세요.');
  const id = state.account?.id;
  const operation = epoch;
  await accountApi('', 'DELETE');
  if (operation !== epoch) return;
  ++epoch;
  if (timer) clearTimeout(timer);
  switchPersonalAccount(null);
  expectAccount(null);
  if (id) window.localStorage.removeItem(`mabikuma:account-data:${id}`);
  emit({
    account: null,
    phase: 'local',
    lastSyncedAt: null,
    message: '',
    conflict: null,
    generation: state.generation + 1,
  });
  notifyOtherTabs();
}
export function startAccountSync(): () => void {
  if (started) return () => {};
  started = true;
  let retryRestore = false;
  const restore = async () => {
    if (!hasAccountEndpoint()) return;
    let operation = epoch;
    try {
      const config = await accountApi<{ enabled: boolean }>('/config');
      if (!config.enabled) {
        retryRestore = false;
        return;
      }
      const account = await accountApi<Account>('/me');
      if (operation !== epoch || !started) return;
      operation = epoch + 1;
      await activate(account);
      retryRestore = false;
    } catch (error) {
      if (operation !== epoch || !started) return;
      if (error instanceof AccountError && error.status === 401) {
        retryRestore = false;
        ++epoch;
        switchPersonalAccount(null);
        expectAccount(null);
        emit({
          account: null,
          phase: 'local',
          lastSyncedAt: null,
          message: '',
          conflict: null,
          generation: state.generation + 1,
        });
      } else {
        retryRestore = true;
        if (state.account)
          emit({
            phase: 'error',
            message: '계정 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          });
      }
    }
  };
  void restore();
  const unsubscribe = subscribePersonalStorage(() => {
    scheduleSync();
  });
  const storage = (event: StorageEvent) => {
    if (event.key === 'mabikuma:account-session-change') void restore();
  };
  const online = () => {
    if (retryRestore || (state.account?.profile && getPersonalAccount() !== state.account.id))
      void restore();
    else void syncAccount();
  };
  const visibility = () => {
    if (document.visibilityState === 'visible') online();
  };
  const failed = () =>
    emit({
      message:
        '브라우저 저장에 실패했습니다. 저장 공간과 브라우저 설정을 확인해 주세요. 저장이 끝나기 전에는 화면을 닫지 마세요.',
    });
  const conflict = () => {
    // 탭 사이 충돌도 서버 확인본과 비교한 뒤 사용할 내용을 선택하게 한다.
    void syncAccount();
  };
  window.addEventListener('storage', storage);
  window.addEventListener('online', online);
  window.addEventListener('mabikuma:personal-storage-failed', failed);
  window.addEventListener('mabikuma:personal-storage-conflict', conflict);
  document.addEventListener('visibilitychange', visibility);
  const interval = setInterval(online, 30000);
  return () => {
    started = false;
    unsubscribe();
    clearInterval(interval);
    if (timer) clearTimeout(timer);
    window.removeEventListener('storage', storage);
    window.removeEventListener('online', online);
    window.removeEventListener('mabikuma:personal-storage-failed', failed);
    window.removeEventListener('mabikuma:personal-storage-conflict', conflict);
    document.removeEventListener('visibilitychange', visibility);
  };
}
