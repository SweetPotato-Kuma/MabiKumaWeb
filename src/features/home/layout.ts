import { useSyncExternalStore } from 'react';
import { readPersonal, writePersonal, subscribePersonalStorage } from '@/lib/personalStorage';

export const HOME_LAYOUT_KEY = 'mabikuma:homeLayout:v1';
export const WIDGETS = {
  banner: { title: '이벤트 배너', width: 5 },
  news: { title: '공지사항 · 새소식', width: 3 },
  kits: { title: '판매 중인 키트', width: 2 },
  dev: { title: '개발자 노트', width: 2 },
  favorites: { title: '즐겨찾기 경매장 매물', width: 2 },
  horn: { title: '뿔피리', width: 2 },
  memo: { title: '목표 아이템 메모', width: 5 },
} as const;
export type WidgetId = keyof typeof WIDGETS;
export interface WidgetLayout {
  id: WidgetId;
  width: number;
  visible: boolean;
}
export const defaultLayout = (): WidgetLayout[] =>
  Object.entries(WIDGETS).map(([id, widget]) => ({
    id: id as WidgetId,
    width: widget.width,
    visible: true,
  }));

export function parseLayout(raw: unknown): WidgetLayout[] {
  const defaults = defaultLayout();
  if (!Array.isArray(raw)) return defaults;
  const result: WidgetLayout[] = [];
  for (const entry of raw.slice(0, 30)) {
    if (!entry || typeof entry !== 'object') continue;
    const fallback = defaults.find((widget) => widget.id === entry.id);
    if (!fallback || result.some((widget) => widget.id === entry.id)) continue;
    result.push({
      ...fallback,
      width:
        Number.isInteger(entry.width) && entry.width >= 1 && entry.width <= 5
          ? entry.width
          : fallback.width,
      visible: typeof entry.visible === 'boolean' ? entry.visible : fallback.visible,
    });
  }
  return [...result, ...defaults.filter((widget) => !result.some(({ id }) => widget.id === id))];
}
function read(): WidgetLayout[] {
  try {
    return parseLayout(JSON.parse(readPersonal(HOME_LAYOUT_KEY) ?? 'null'));
  } catch {
    return defaultLayout();
  }
}
let snapshot = read();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
subscribePersonalStorage(({ key }) => {
  if (key === null || key === HOME_LAYOUT_KEY) {
    snapshot = read();
    notify();
  }
});
export function saveLayout(layout: WidgetLayout[]): void {
  writePersonal(HOME_LAYOUT_KEY, JSON.stringify(parseLayout(layout)));
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useHomeLayout(): WidgetLayout[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
