import { useCallback, useSyncExternalStore } from 'react';
import { SERVER_NAMES, type ServerName } from '@/features/servers/constants';

/**
 * 방문자가 한 번 고르면 모든 화면이 따르는 설정. 로그인이 없으므로 이 브라우저의 localStorage 에만 남는다.
 *
 * - server: 서버를 고르는 모든 화면의 처음 값. 화면에서 서버를 바꾸면 이 값도 따라 바뀐다.
 * - priceStyle: 가격을 `1,149,000,000 G`(number) 로 쓸지 `11억 4,900만 G`(korean) 로 쓸지.
 * - omitSmall: 한글 표기에서 1만 미만 끝자리를 뺀다(`11억 4,900만 1,234 G` → `11억 4,900만 G`).
 * - hideSymbols: 경매장 결과에서 이름에 심볼, 도면, 옷본이 든 매물을 기본으로 숨긴다.
 */
export type PriceStyle = 'number' | 'korean';

export interface UserSettings {
  server: ServerName;
  priceStyle: PriceStyle;
  omitSmall: boolean;
  hideSymbols: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  server: SERVER_NAMES[0],
  priceStyle: 'number',
  omitSmall: false,
  hideSymbols: false,
};

const STORAGE_KEY = 'mabikuma:userSettings';

/** 저장된 값을 믿지 않는다. 손으로 고쳤거나 옛 형식이면 그 항목만 기본값으로 돌린다. */
export function parseSettings(raw: unknown): UserSettings {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    server: SERVER_NAMES.find((name) => name === value.server) ?? DEFAULT_SETTINGS.server,
    priceStyle: value.priceStyle === 'korean' ? 'korean' : DEFAULT_SETTINGS.priceStyle,
    omitSmall: value.omitSmall === true,
    hideSymbols: value.hideSymbols === true,
  };
}

function readStorage(): UserSettings {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    return parseSettings(text ? JSON.parse(text) : null);
  } catch {
    // 시크릿 모드 등 localStorage 를 못 쓰거나 글자가 깨졌다. 기본값으로 시작한다.
    return DEFAULT_SETTINGS;
  }
}

function writeStorage(settings: UserSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 저장하지 못해도 이 탭 안에서는 바꾼 값을 쓴다.
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** useSyncExternalStore 는 같은 상태면 같은 객체를 받아야 한다. 바뀔 때만 새로 만든다. */
let snapshot: UserSettings = typeof window === 'undefined' ? DEFAULT_SETTINGS : readStorage();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: UserSettings): void {
  const same = (Object.keys(next) as (keyof UserSettings)[]).every((key) => next[key] === snapshot[key]);
  if (same) return;
  snapshot = next;
  writeStorage(next);
  for (const listener of listeners) listener();
}

export function getSettings(): UserSettings {
  return snapshot;
}

export function updateSettings(changes: Partial<UserSettings>): void {
  commit(parseSettings({ ...snapshot, ...changes }));
}

// 다른 탭에서 바꾸면 이 탭도 따라 바뀐다.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    snapshot = readStorage();
    for (const listener of listeners) listener();
  });
}

/** 설정을 읽고 고치는 훅. 어디서 바꿔도 이 훅을 쓰는 모든 화면이 바로 다시 그려진다. */
export function useUserSettings(): readonly [UserSettings, (changes: Partial<UserSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, getSettings, getSettings);
  const update = useCallback((changes: Partial<UserSettings>) => updateSettings(changes), []);
  return [settings, update] as const;
}

/** 시험에서 저장소를 비우고 처음 상태로 돌린다. */
export function resetSettingsForTest(): void {
  snapshot = DEFAULT_SETTINGS;
  for (const listener of listeners) listener();
}
