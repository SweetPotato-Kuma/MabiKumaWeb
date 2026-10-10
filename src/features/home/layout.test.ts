import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultLayout, HOME_LAYOUT_KEY, parseLayout, saveLayout, useHomeLayout } from './layout';
import {
  getPersonalDocument,
  switchPersonalAccount,
  updatePersonalDocument,
} from '@/lib/personalStorage';
import { validateEntries } from '../../../shared/personal-data.js';

beforeEach(() => {
  localStorage.clear();
  switchPersonalAccount(null);
});
afterEach(() => {
  cleanup();
  switchPersonalAccount(null);
});
describe('홈 위젯 개인 설정', () => {
  it('중복·알 수 없는 위젯·잘못된 크기를 정리하고 새 위젯을 보충한다', () => {
    const result = parseLayout([
      { id: 'memo', width: 2, visible: false },
      { id: 'memo' },
      { id: '__proto__' },
      { id: 'banner', width: 9 },
    ]);
    expect(result[0]).toEqual({ id: 'memo', width: 2, visible: false });
    expect(result.find(({ id }) => id === 'banner')?.width).toBe(5);
    expect(new Set(result.map(({ id }) => id)).size).toBe(defaultLayout().length);
  });
  it('방문만으로 저장하지 않고 변경은 계정별로 분리하며 로그아웃하면 비로그인 배치를 복원한다', () => {
    const hook = renderHook(useHomeLayout);
    expect(localStorage.getItem(HOME_LAYOUT_KEY)).toBeNull();
    const guest = defaultLayout().reverse();
    act(() => saveLayout(guest));
    expect(validateEntries({ [HOME_LAYOUT_KEY]: JSON.stringify(guest) })).toBe(true);
    act(() => switchPersonalAccount('11111111-1111-1111-1111-111111111111'));
    expect(hook.result.current).toEqual(defaultLayout());
    const account = defaultLayout().map((widget) => ({ ...widget, visible: false }));
    act(() => saveLayout(account));
    expect(getPersonalDocument().entries[HOME_LAYOUT_KEY]).toBe(JSON.stringify(account));
    expect(JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY)!)).toEqual(guest);
    act(() => switchPersonalAccount(null));
    expect(hook.result.current).toEqual(guest);
  });
  it('원격 동기화와 다른 탭의 변경을 즉시 반영한다', () => {
    const hook = renderHook(useHomeLayout);
    const remote = defaultLayout().reverse();
    act(() => {
      switchPersonalAccount('11111111-1111-1111-1111-111111111111');
      updatePersonalDocument({
        version: 1,
        revision: 2,
        base: {},
        entries: { [HOME_LAYOUT_KEY]: JSON.stringify(remote) },
      });
    });
    expect(hook.result.current).toEqual(remote);
    act(() => {
      switchPersonalAccount(null);
      localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(remote));
      window.dispatchEvent(new StorageEvent('storage', { key: HOME_LAYOUT_KEY }));
    });
    expect(hook.result.current).toEqual(remote);
  });
});
