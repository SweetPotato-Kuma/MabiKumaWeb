import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'mabikuma:bagSavedColors';

/** 모듈이 처음 읽을 때의 저장소 값을 정하려고 테스트마다 새로 불러온다. */
async function load() {
  vi.resetModules();
  return import('./savedColors');
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('저장한 색', () => {
  it('저장하면 맨 앞에 오고, 같은 색은 한 번만 남는다', async () => {
    const colors = await load();
    colors.saveColor('#FFFFFF');
    colors.saveColor('#000000');
    colors.saveColor('#ffffff');

    expect(colors.getSavedColors()).toEqual(['#ffffff', '#000000']);
    expect(colors.isSavedColor('ffffff')).toBe(true);
  });

  it('브라우저에 남아서 다시 열어도 그대로다', async () => {
    (await load()).saveColor('#f58459');
    expect((await load()).getSavedColors()).toEqual(['#f58459']);
  });

  it('뺄 수 있다', async () => {
    const colors = await load();
    colors.saveColor('#f58459');
    colors.removeSavedColor('#F58459');
    expect(colors.getSavedColors()).toEqual([]);
  });

  it('정해 둔 개수를 넘으면 가장 오래 전에 저장한 색부터 빠진다', async () => {
    const colors = await load();
    for (let i = 0; i <= colors.SAVED_COLORS_MAX; i++) {
      colors.saveColor(`#0000${i.toString(16).padStart(2, '0')}`);
    }
    const list = colors.getSavedColors();
    expect(list).toHaveLength(colors.SAVED_COLORS_MAX);
    expect(list).not.toContain('#000000');
  });

  it('저장소 값이 깨져 있으면 빈 목록에서 시작하고, 틀린 값은 버린다', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{깨짐');
    expect((await load()).getSavedColors()).toEqual([]);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['#abcdef', 'zzz', 3, '#ABCDEF']));
    expect((await load()).getSavedColors()).toEqual(['#abcdef']);
  });
});
