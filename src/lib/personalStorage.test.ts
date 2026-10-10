import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isPersonalKey, validateEntries } from '../../shared/personal-data.js';
import {
  getPersonalDocument,
  guestEntries,
  mergePersonal,
  readPersonal,
  removePersonal,
  switchPersonalAccount,
  writePersonal,
} from './personalStorage';
import { addGoal, useMemoState, resetMemoCache } from '@/features/materialMemo/store';
import { renderHook, act } from '@testing-library/react';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const KEY = 'mabikuma:materialMemo:v2';
beforeEach(() => {
  switchPersonalAccount(null);
  localStorage.clear();
  resetMemoCache();
});
afterEach(() => {
  switchPersonalAccount(null);
});
describe('개인 저장 분리', () => {
  it('비로그인은 기존 키를 사용하고 계정 저장은 비로그인 데이터를 보존한다', () => {
    writePersonal(KEY, 'guest');
    switchPersonalAccount(A);
    expect(readPersonal(KEY)).toBeNull();
    writePersonal(KEY, 'account A');
    const saved = getPersonalDocument();
    switchPersonalAccount(B);
    expect(readPersonal(KEY)).toBeNull();
    writePersonal(KEY, 'account B');
    switchPersonalAccount(A, saved);
    expect(readPersonal(KEY)).toBe('account A');
    removePersonal(KEY);
    expect(readPersonal(KEY)).toBeNull();
    switchPersonalAccount(null);
    expect(readPersonal(KEY)).toBe('guest');
  });
  it('계정 전환 시 기존 재료 메모의 메모리 캐시도 갱신한다', () => {
    const hook = renderHook(useMemoState);
    act(() => {
      addGoal('로컬 목표', 3);
    });
    expect(hook.result.current.goals).toHaveLength(1);
    act(() => {
      switchPersonalAccount(A);
    });
    expect(hook.result.current.goals).toHaveLength(0);
    act(() => {
      addGoal('계정 목표', 7);
    });
    expect(hook.result.current.goals[0].name).toBe('계정 목표');
    act(() => {
      switchPersonalAccount(null);
    });
    expect(hook.result.current.goals[0].name).toBe('로컬 목표');
    hook.unmount();
  });
  it('키·캐시는 수집하지 않고 제한되지 않은 임의 키를 거부한다', () => {
    for (const key of ['mabikuma:adminKey', 'mabikuma:apiKey', 'mabikuma:itemCards:v3'])
      localStorage.setItem(key, 'secret');
    writePersonal('mabikuma:calc:auction', 'coupon=10');
    expect(guestEntries()).toEqual({ 'mabikuma:calc:auction': 'coupon=10' });
    expect(isPersonalKey('mabikuma:calc:../../key')).toBe(false);
    expect(validateEntries({ 'mabikuma:apiKey': 'secret' })).toBe(false);
    expect(() => writePersonal('mabikuma:adminKey', 'secret')).toThrow();
  });
});
describe('버전 비교', () => {
  it('서로 다른 항목의 변경과 삭제를 함께 반영한다', () => {
    expect(
      mergePersonal(
        { a: 'old', b: 'old', c: 'delete' },
        { a: 'new', b: 'old' },
        { a: 'old', b: 'remote', c: 'delete' },
      ),
    ).toEqual({ entries: { a: 'new', b: 'remote' }, conflicts: [] });
  });
  it('동일 항목의 충돌과 수정 대 삭제를 묵살하지 않는다', () => {
    expect(mergePersonal({ a: 'old' }, { a: 'local' }, { a: 'remote' }).conflicts).toEqual(['a']);
    expect(mergePersonal({ a: 'old' }, {}, { a: 'remote' }).conflicts).toEqual(['a']);
  });
  it('빈 초기 상태로 기존 서버 데이터를 지우지 않는다', () => {
    expect(mergePersonal({}, {}, { a: 'saved' })).toEqual({
      entries: { a: 'saved' },
      conflicts: [],
    });
  });
});
