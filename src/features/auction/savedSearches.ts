import { readPersonal, writePersonal, subscribePersonalStorage } from '@/lib/personalStorage';
import { useCallback, useSyncExternalStore } from 'react';
import { categoryLabel } from './categoryTree';
import { parseFilter, serializeFilter } from './filterUrl';
import { summarizeCondition } from './optionFilter';

/**
 * 경매장 검색 즐겨찾기. 검색어, 카테고리, 상세 검색 조건을 이름과 설명을 붙여 이 브라우저의 localStorage 에 저장한다.
 *
 * 저장하는 것은 검색 주소의 조건 글자(keyword, category, f)다. 상세 검색 조건(f)은 주소에 담는 글자(filterUrl)를 그대로
 * 쓴다. 그래서 즐겨찾기를 고르면 주소로 옮겨 가기만 하면 되고, 저장한 글자도 주소와 같은 검증을 거쳐 읽는다.
 * 정렬, 쪽, 탭은 검색 조건이 아니라 보는 방식이라 저장하지 않는다.
 */
export interface SavedSearchQuery {
  keyword: string;
  category: string;
  /** 상세 검색 조건의 주소 글자(serializeFilter). 없으면 빈 글자. */
  filterKey: string;
}

export interface SavedSearch extends SavedSearchQuery {
  id: string;
  name: string;
  description: string;
}

export const NAME_MAX = 30;
export const DESCRIPTION_MAX = 100;
/** 저장할 수 있는 개수. 이보다 많이 두는 사람은 목록에서 고르기 어려워진다. */
export const SAVED_MAX = 50;

const STORAGE_KEY = 'mabikuma:savedSearches';

/** 검색 조건이 하나라도 있는지. 비어 있으면 저장할 이유가 없다. */
export function hasSearchCondition(query: SavedSearchQuery): boolean {
  return query.keyword.trim() !== '' || query.category.trim() !== '' || query.filterKey !== '';
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** 저장된 값을 믿지 않는다. 항목마다 검증하고 읽을 수 없는 것은 버린다. */
export function parseSaved(raw: unknown): SavedSearch[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: SavedSearch[] = [];
  for (const entry of raw.slice(0, SAVED_MAX)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const value = entry as Record<string, unknown>;
    const id = text(value.id, 40);
    const name = text(value.name, NAME_MAX).trim();
    if (!id || !name || seen.has(id)) continue;
    // 상세 조건 글자는 주소와 같은 검증을 거쳐 다시 만든다. 깨진 조건은 그 부분만 빠진다.
    const query: SavedSearchQuery = {
      keyword: text(value.keyword, 200),
      category: text(value.category, 200),
      filterKey: serializeParsed(text(value.filterKey, 4000)),
    };
    if (!hasSearchCondition(query)) continue;
    if (items.some((item) => sameQuery(item, query))) continue;
    seen.add(id);
    items.push({ id, name, description: text(value.description, DESCRIPTION_MAX), ...query });
  }
  return items;
}

const sameQuery = (a: SavedSearchQuery, b: SavedSearchQuery) =>
  a.keyword.trim() === b.keyword.trim() && a.category === b.category && a.filterKey === b.filterKey;

function serializeParsed(filterKey: string): string {
  return filterKey === '' ? '' : serializeFilter(parseFilter(filterKey));
}

function readStorage(): SavedSearch[] {
  try {
    const raw = readPersonal(STORAGE_KEY);
    return raw ? parseSaved(JSON.parse(raw)) : [];
  } catch {
    // 시크릿 모드 등 localStorage 를 못 쓰거나 글자가 깨졌다. 빈 목록으로 시작한다.
    return [];
  }
}

function writeStorage(items: readonly SavedSearch[]): void {
  try {
    writePersonal(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // 저장하지 못해도 이 탭 안에서는 바꾼 목록을 쓴다.
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** useSyncExternalStore 는 같은 상태면 같은 배열을 받아야 한다. 바뀔 때만 새로 만든다. */
let snapshot: readonly SavedSearch[] = typeof window === 'undefined' ? [] : readStorage();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: readonly SavedSearch[]): void {
  snapshot = next;
  writeStorage(next);
  for (const listener of listeners) listener();
}

export function getSavedSearches(): readonly SavedSearch[] {
  return snapshot;
}

export type SaveResult =
  | { ok: true; item: SavedSearch }
  | { ok: false; reason: 'empty' | 'name' | 'full' }
  | { ok: false; reason: 'duplicate'; existing: SavedSearch };

/** 같은 검색 조건으로 이미 저장한 것. 이름과 설명이 달라도 조건이 같으면 같은 검색이다. */
export function findSavedSearch(query: SavedSearchQuery): SavedSearch | undefined {
  return snapshot.find((item) => sameQuery(item, query));
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** 새로 저장한다. 조건이 없거나, 이름이 비었거나, 가득 찼거나, 같은 조건이 이미 있으면 저장하지 않고 까닭을 돌려준다. */
export function addSavedSearch(
  input: SavedSearchQuery & { name: string; description?: string },
): SaveResult {
  const query: SavedSearchQuery = {
    keyword: input.keyword.trim(),
    category: input.category,
    filterKey: input.filterKey,
  };
  if (!hasSearchCondition(query)) return { ok: false, reason: 'empty' };
  const existing = findSavedSearch(query);
  if (existing) return { ok: false, reason: 'duplicate', existing };
  const name = input.name.trim().slice(0, NAME_MAX);
  if (!name) return { ok: false, reason: 'name' };
  if (snapshot.length >= SAVED_MAX) return { ok: false, reason: 'full' };
  const item: SavedSearch = {
    id: newId(),
    name,
    description: (input.description ?? '').trim().slice(0, DESCRIPTION_MAX),
    ...query,
  };
  commit([item, ...snapshot]);
  return { ok: true, item };
}

/** 이름과 설명을 고친다. 검색 조건은 그대로다. 이름이 비면 고치지 않는다. */
export function updateSavedSearch(
  id: string,
  changes: { name: string; description: string },
): boolean {
  const name = changes.name.trim().slice(0, NAME_MAX);
  if (!name || !snapshot.some((item) => item.id === id)) return false;
  commit(
    snapshot.map((item) =>
      item.id === id
        ? { ...item, name, description: changes.description.trim().slice(0, DESCRIPTION_MAX) }
        : item,
    ),
  );
  return true;
}

export function removeSavedSearch(id: string): void {
  if (!snapshot.some((item) => item.id === id)) return;
  commit(snapshot.filter((item) => item.id !== id));
}

// 다른 탭에서 바꾸면 이 탭도 따라 바뀐다.
if (typeof window !== 'undefined') {
  subscribePersonalStorage(({ key, external }) => {
    if (!external || (key !== null && key !== STORAGE_KEY)) return;
    snapshot = readStorage();
    for (const listener of listeners) listener();
  });
}

/** 시험에서 목록을 비운다. */
export function resetSavedSearchesForTest(): void {
  snapshot = [];
  for (const listener of listeners) listener();
}

/** 즐겨찾기 목록. 어디서 고쳐도 이 훅을 쓰는 화면이 바로 다시 그려진다. */
export function useSavedSearches(): readonly SavedSearch[] {
  return useSyncExternalStore(subscribe, getSavedSearches, getSavedSearches);
}

export function useSavedSearchActions() {
  return {
    add: useCallback(addSavedSearch, []),
    update: useCallback(updateSavedSearch, []),
    remove: useCallback(removeSavedSearch, []),
  };
}

/** 목록에 보일 한 줄 요약: 카테고리, 검색어, 상세 조건. */
export function describeSavedSearch(query: SavedSearchQuery): string[] {
  return [
    categoryLabel(query.category),
    query.keyword.trim() ? `"${query.keyword.trim()}"` : '',
    ...parseFilter(query.filterKey).conditions.map(summarizeCondition),
  ].filter(Boolean);
}
