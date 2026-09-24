import { useSyncExternalStore } from 'react';
import { hexToRgb } from './color';

/**
 * 주머니 찾기에서 저장해 둔 색.
 *
 * 흰색, 검정처럼 늘 찾는 색은 기본 색으로 두었지만, 사람마다 모으는 색이 따로 있다. 매번 RGB 를
 * 다시 넣지 않도록 색 고르기 창에서 저장해 두고 눌러 쓰게 한다.
 *
 * 계정이 없는 사이트라 이 브라우저의 localStorage 에만 남는다. 다른 탭에서 바꾸면 storage
 * 이벤트로 따라 바뀐다. 저장소가 막힌 환경(시크릿 모드 등)에서는 이 탭 안에서만 기억한다.
 */
const STORAGE_KEY = 'mabikuma:bagSavedColors';

/** 색 고르기 창 한 칸에 두 줄 남짓. 넘치면 가장 오래 전에 저장한 색부터 빠진다. */
export const SAVED_COLORS_MAX = 20;

type Listener = () => void;
const listeners = new Set<Listener>();

/** "#FFF" 나 틀린 값은 버리고 "#ffffff" 모양으로 맞춘다. 같은 색이 두 번 저장되지 않게. */
function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const rgb = hexToRgb(value);
  if (!rgb) return null;
  return `#${[rgb.r, rgb.g, rgb.b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function clean(values: readonly unknown[]): string[] {
  const colors: string[] = [];
  for (const value of values) {
    const color = normalize(value);
    if (color && !colors.includes(color)) colors.push(color);
  }
  return colors.slice(0, SAVED_COLORS_MAX);
}

function readStorage(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? clean(parsed) : [];
  } catch {
    // 저장소가 막혔거나 값이 깨졌다. 빈 목록에서 다시 시작한다.
    return [];
  }
}

let saved: string[] = typeof window === 'undefined' ? [] : readStorage();

function update(next: string[]): void {
  saved = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패는 조용히 넘기고 이 탭의 메모리 값만 쓴다.
  }
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    saved = readStorage();
    for (const listener of listeners) listener();
  });
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSavedColors(): string[] {
  return saved;
}

export function isSavedColor(color: string): boolean {
  const normalized = normalize(color);
  return normalized !== null && saved.includes(normalized);
}

/** 맨 앞에 넣는다. 이미 있으면 맨 앞으로 옮긴다. */
export function saveColor(color: string): void {
  const normalized = normalize(color);
  if (!normalized) return;
  update(clean([normalized, ...saved]));
}

export function removeSavedColor(color: string): void {
  const normalized = normalize(color);
  if (!normalized) return;
  update(saved.filter((entry) => entry !== normalized));
}

/** 저장한 색 목록. 저장하거나 뺄 때마다 다시 그린다. */
export function useSavedColors(): string[] {
  return useSyncExternalStore(subscribe, getSavedColors, getSavedColors);
}
