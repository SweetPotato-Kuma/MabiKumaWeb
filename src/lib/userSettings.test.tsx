import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGoldFormatter } from './useGoldFormatter';
import {
  DEFAULT_SETTINGS,
  getSettings,
  parseSettings,
  resetSettingsForTest,
  updateSettings,
  useUserSettings,
} from './userSettings';

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsForTest();
});

afterEach(() => {
  window.localStorage.clear();
  resetSettingsForTest();
});

describe('parseSettings', () => {
  it('저장된 것이 없으면 기본값이다', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('글자')).toEqual(DEFAULT_SETTINGS);
  });

  it('낯선 값은 그 항목만 기본으로 돌리고 나머지는 살린다', () => {
    expect(
      parseSettings({ server: '없는서버', priceStyle: 'korean', omitSmall: 'yes', hideSymbols: true }),
    ).toEqual({ server: '류트', priceStyle: 'korean', omitSmall: false, hideSymbols: true });
  });

  it('알려진 값은 그대로 받는다', () => {
    expect(parseSettings({ server: '하프', priceStyle: 'number', omitSmall: true, hideSymbols: false })).toEqual({
      server: '하프',
      priceStyle: 'number',
      omitSmall: true,
      hideSymbols: false,
    });
  });
});

describe('설정 저장소', () => {
  it('바꾸면 localStorage 에 남고 읽는 훅이 바로 다시 그려진다', () => {
    const { result } = renderHook(() => useUserSettings());

    act(() => result.current[1]({ server: '하프' }));

    expect(result.current[0].server).toBe('하프');
    expect(getSettings().server).toBe('하프');
    expect(JSON.parse(window.localStorage.getItem('mabikuma:userSettings') ?? '{}').server).toBe('하프');
  });

  it('여러 번 나눠 바꿔도 앞의 것이 남는다', () => {
    updateSettings({ priceStyle: 'korean' });
    updateSettings({ omitSmall: true });

    expect(getSettings()).toMatchObject({ priceStyle: 'korean', omitSmall: true });
  });

  it('잘못된 값을 넣어도 설정이 깨지지 않는다', () => {
    updateSettings({ server: '없는서버' as never });

    expect(getSettings().server).toBe('류트');
  });

  it('같은 값으로 바꾸면 다시 그리지 않는다', () => {
    const before = getSettings();
    updateSettings({ server: before.server });

    expect(getSettings()).toBe(before);
  });
});

describe('useGoldFormatter', () => {
  it('설정을 바꾸면 이 훅을 쓰는 곳의 가격 표기가 바로 바뀐다', () => {
    const { result } = renderHook(() => useGoldFormatter());
    expect(result.current(1_149_001_234)).toBe('1,149,001,234 G');

    act(() => updateSettings({ priceStyle: 'korean' }));
    expect(result.current(1_149_001_234)).toBe('11억 4,900만 1,234 G');

    act(() => updateSettings({ omitSmall: true }));
    expect(result.current(1_149_001_234)).toBe('11억 4,900만 G');
  });

  it('설정이 그대로면 같은 함수를 돌려준다', () => {
    const { result, rerender } = renderHook(() => useGoldFormatter());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
