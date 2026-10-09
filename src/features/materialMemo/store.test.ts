import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_TARGETS,
  addTarget,
  clearOwned,
  parseState,
  removeTarget,
  resetMemoCache,
  setChoice,
  setOwned,
  setTargetRecipe,
} from './store';

const STORAGE_KEY = 'mabikuma:materialMemo';

const saved = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');

describe('재료 메모 저장', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetMemoCache();
  });

  it('목표를 더하면 브라우저에 남는다', () => {
    addTarget(100, 2);
    expect(saved().targets).toMatchObject([{ itemId: 100, count: 2, owned: {}, choices: {} }]);
  });

  it('같은 아이템을 또 더하면 개수만 늘린다', () => {
    addTarget(100, 2);
    addTarget(100, 3);
    expect(saved().targets).toHaveLength(1);
    expect(saved().targets[0].count).toBe(5);
  });

  it('목표 개수가 가득 차면 더하지 않는다', () => {
    for (let id = 1; id <= MAX_TARGETS; id += 1) expect(addTarget(id, 1)).toBe(true);
    expect(addTarget(9999, 1)).toBe(false);
    expect(saved().targets).toHaveLength(MAX_TARGETS);
  });

  it('가진 개수는 0 이 되면 지운다', () => {
    addTarget(100, 1);
    const { id } = saved().targets[0];
    setOwned(id, 'm0', 4);
    expect(saved().targets[0].owned).toEqual({ m0: 4 });
    setOwned(id, 'm0', 0);
    expect(saved().targets[0].owned).toEqual({});
  });

  it('가진 개수를 모두 지워도 고른 방법은 남는다', () => {
    addTarget(100, 1);
    const { id } = saved().targets[0];
    setOwned(id, 'm0', 4);
    setChoice(id, 'm0', 'gather');
    clearOwned(id);
    expect(saved().targets[0]).toMatchObject({ owned: {}, choices: { m0: 'gather' } });
  });

  it('목표 제작법을 바꾸면 가진 개수와 고른 방법을 새로 시작한다', () => {
    addTarget(100, 1);
    const { id } = saved().targets[0];
    setOwned(id, 'm0', 4);
    setChoice(id, 'm0', 3);
    setTargetRecipe(id, 8);
    expect(saved().targets[0]).toMatchObject({ recipe: 8, owned: {}, choices: {} });
  });

  it('마지막 목표를 지우면 저장값도 지운다', () => {
    addTarget(100, 1);
    removeTarget(saved().targets[0].id);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('parseState', () => {
  it('모양이 틀린 저장값은 버리고 나머지를 살린다', () => {
    const state = parseState({
      targets: [
        { id: 'a', itemId: 5, count: 2.9, owned: { m0: '3', m1: -1, m2: 'x' }, choices: { m0: 'gather', m1: 'x', m2: 4 } },
        { id: 'a', itemId: 6, count: 1 },
        { id: 'b', itemId: 0, count: 1 },
        { itemId: 7, count: 1 },
        'x',
      ],
    });
    expect(state.targets).toEqual([
      { id: 'a', itemId: 5, count: 2, owned: { m0: 3 }, choices: { m0: 'gather', m2: 4 } },
    ]);
  });

  it('배열이 아니면 빈 상태다', () => {
    expect(parseState({ targets: 'x' }).targets).toEqual([]);
    expect(parseState(null).targets).toEqual([]);
  });
});
