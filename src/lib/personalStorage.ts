import { isPersonalKey, validateEntries } from '../../shared/personal-data.js';

export type PersonalEntries = Record<string, string>;
export interface PersonalDocument {
  version: 1;
  revision: number;
  base: PersonalEntries;
  entries: PersonalEntries;
}
type Change = { key: string | null; external: boolean };
const listeners = new Set<(event: Change) => void>();
let accountId: string | null = null;
let document: PersonalDocument = { version: 1, revision: 0, base: {}, entries: {} };
const documentKey = (id: string) => `mabikuma:account-data:${id}`;
const emit = (event: Change) => {
  for (const listener of listeners) listener(event);
};

export function subscribePersonalStorage(listener: (event: Change) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function getPersonalAccount(): string | null {
  return accountId;
}
export function getPersonalDocument(): PersonalDocument {
  return document;
}
export function readPersonal(key: string): string | null {
  if (!isPersonalKey(key)) throw new Error('개인 저장 대상이 아닙니다.');
  return accountId ? (document.entries[key] ?? null) : window.localStorage.getItem(key);
}
export function guestEntries(): PersonalEntries {
  const entries: PersonalEntries = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && isPersonalKey(key)) {
      const value = window.localStorage.getItem(key);
      if (value !== null) entries[key] = value;
    }
  }
  return entries;
}
/** 파일 복원은 비로그인 저장에만 적용한다. 키와 캐시는 건드리지 않는다. */
export function replaceGuestEntries(entries: PersonalEntries): void {
  if (accountId || !validateEntries(entries))
    throw new Error('비로그인 데이터의 형식이나 저장 상태를 확인해 주세요.');
  const before = guestEntries();
  try {
    for (const key of Object.keys(entries)) window.localStorage.setItem(key, entries[key]);
    for (const key of Object.keys(before))
      if (!(key in entries)) window.localStorage.removeItem(key);
  } catch (error) {
    // 일부 항목만 교체된 상태를 최대한 되돌린다.
    try {
      for (const key of Object.keys(entries))
        if (!(key in before)) window.localStorage.removeItem(key);
      for (const key of Object.keys(before)) window.localStorage.setItem(key, before[key]);
    } catch {
      /* 저장 자체가 차단되면 복원할 수 없다. */
    }
    window.dispatchEvent(new Event('mabikuma:personal-storage-failed'));
    throw error;
  }
  emit({ key: null, external: true });
}
export function loadPersonalDocument(id: string): PersonalDocument {
  const raw = window.localStorage.getItem(documentKey(id));
  if (!raw) return { version: 1, revision: 0, base: {}, entries: {} };
  const parsed = JSON.parse(raw) as PersonalDocument;
  if (
    parsed.version !== 1 ||
    !Number.isSafeInteger(parsed.revision) ||
    parsed.revision < 0 ||
    !validateEntries(parsed.base) ||
    !validateEntries(parsed.entries)
  )
    throw new Error('저장된 계정 데이터가 손상되었습니다.');
  return parsed;
}
function persistDocument(next: PersonalDocument): void {
  document = next;
  if (accountId) {
    try {
      window.localStorage.setItem(documentKey(accountId), JSON.stringify(next));
    } catch {
      window.dispatchEvent(new Event('mabikuma:personal-storage-failed'));
    }
  }
}
export function switchPersonalAccount(id: string | null, next?: PersonalDocument): void {
  if (id && !/^[a-f0-9-]{36}$/.test(id)) throw new Error('계정 번호가 올바르지 않습니다.');
  accountId = id;
  persistDocument(next ?? { version: 1, revision: 0, base: {}, entries: {} });
  emit({ key: null, external: true });
}
export function updatePersonalDocument(next: PersonalDocument): void {
  if (!validateEntries(next.entries) || !validateEntries(next.base))
    throw new Error('저장 가능한 용량을 초과했습니다.');
  const changed = JSON.stringify(next.entries) !== JSON.stringify(document.entries);
  persistDocument(next);
  if (changed) emit({ key: null, external: true });
}
function changePersonal(key: string, value: string | null): void {
  if (!isPersonalKey(key)) throw new Error('개인 저장 대상이 아닙니다.');
  if (!accountId) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (error) {
      window.dispatchEvent(new Event('mabikuma:personal-storage-failed'));
      throw error;
    }
  } else {
    const entries = { ...document.entries };
    if (value === null) delete entries[key];
    else entries[key] = value;
    if (!validateEntries(entries)) {
      window.dispatchEvent(new Event('mabikuma:personal-storage-failed'));
      throw new Error('계정 저장 용량을 초과했습니다.');
    }
    persistDocument({ ...document, entries });
  }
  emit({ key, external: false });
}
export const writePersonal = (key: string, value: string): void => changePersonal(key, value);
export const removePersonal = (key: string): void => changePersonal(key, null);

/** 서로 다른 항목은 합치되, 같은 항목을 양쪽에서 바꿨다면 사람이 고르게 한다. */
export function mergePersonal(
  base: PersonalEntries,
  local: PersonalEntries,
  remote: PersonalEntries,
): { entries: PersonalEntries; conflicts: string[] } {
  const entries = { ...remote };
  const conflicts: string[] = [];
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const changed = local[key] !== base[key];
    if (!changed) continue;
    if (remote[key] !== base[key] && remote[key] !== local[key]) {
      conflicts.push(key);
      continue;
    }
    if (local[key] === undefined) delete entries[key];
    else entries[key] = local[key];
  }
  return { entries, conflicts };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (accountId) {
      if (event.key === documentKey(accountId) || event.key === null) {
        try {
          const next = loadPersonalDocument(accountId);
          const merged = mergePersonal(document.base, document.entries, next.entries);
          if (merged.conflicts.length) {
            window.dispatchEvent(new Event('mabikuma:personal-storage-conflict'));
            return;
          }
          document = { ...next, entries: merged.entries };
          emit({ key: null, external: true });
        } catch {
          window.dispatchEvent(new Event('mabikuma:personal-storage-failed'));
        }
      }
    } else if (event.key === null || isPersonalKey(event.key))
      emit({ key: event.key, external: true });
  });
}
