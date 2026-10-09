import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_GOALS,
  addGoal,
  clearOwned,
  parseState,
  removeGoal,
  resetMemoCache,
  setOwned,
  setQuantity,
  updateChoices,
} from './store';

const STORAGE_KEY = 'mabikuma:materialMemo:v2';

const saved = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');

describe('재료 메모 저장', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetMemoCache();
  });

  it('목표를 더하면 번호를 돌려주고 브라우저에 남는다', () => {
    const id = addGoal('롱 소드', 2);
    expect(saved().goals).toEqual([{ id, name: '롱 소드', quantity: 2 }]);
  });

  it('같은 이름을 또 더하면 개수만 늘리고 같은 번호를 돌려준다', () => {
    const first = addGoal('롱 소드', 2);
    const second = addGoal('롱 소드', 3);
    expect(second).toBe(first);
    expect(saved().goals).toHaveLength(1);
    expect(saved().goals[0].quantity).toBe(5);
  });

  it('목표가 가득 차면 더하지 않는다', () => {
    for (let index = 1; index <= MAX_GOALS; index += 1)
      expect(addGoal(`아이템 ${index}`, 1)).not.toBeNull();
    expect(addGoal('넘치는 아이템', 1)).toBeNull();
    expect(saved().goals).toHaveLength(MAX_GOALS);
  });

  it('목표 개수는 1 아래로 내려가지 않는다', () => {
    const id = addGoal('롱 소드', 2) as string;
    setQuantity(id, 0);
    expect(saved().goals[0].quantity).toBe(1);
  });

  it('가진 개수는 0 이 되면 지운다', () => {
    const id = addGoal('롱 소드', 1) as string;
    setOwned(`${id}.4/m0`, 4);
    expect(saved().owned).toEqual({ [`${id}.4/m0`]: 4 });
    setOwned(`${id}.4/m0`, 0);
    expect(saved().owned).toEqual({});
  });

  it('가진 개수를 모두 비워도 고른 방법은 남는다', () => {
    const id = addGoal('롱 소드', 1) as string;
    setOwned(id, 2);
    updateChoices((choices) => ({ ...choices, methods: { [id]: 7 }, beadChecked: [id] }));
    clearOwned();
    expect(saved()).toMatchObject({
      owned: {},
      choices: { methods: { [id]: 7 }, beadChecked: [id] },
    });
  });

  it('목표를 지우면 그 목표의 가진 개수와 고른 방법만 함께 지운다', () => {
    const first = addGoal('롱 소드', 1) as string;
    const second = addGoal('철괴', 1) as string;
    setOwned(first, 1);
    setOwned(`${first}.3/m0`, 5);
    setOwned(second, 9);
    updateChoices(() => ({
      methods: { [`${first}.3/m0`]: 'coin', [second]: 'npc' },
      beadChecked: [`${first}.3/m1`, second],
    }));

    removeGoal(first);
    expect(saved()).toEqual({
      goals: [{ id: second, name: '철괴', quantity: 1 }],
      owned: { [second]: 9 },
      choices: { methods: { [second]: 'npc' }, beadChecked: [second] },
    });
  });

  it('마지막 목표를 지우면 저장값도 지운다', () => {
    removeGoal(addGoal('롱 소드', 1) as string);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('parseState', () => {
  it('모양이 틀린 저장값은 버리고 나머지를 살린다', () => {
    const state = parseState({
      goals: [
        { id: 'a', name: '롱 소드', quantity: 2.9 },
        { id: 'a', name: '중복', quantity: 1 },
        { id: 'b.c', name: '점이 든 번호', quantity: 1 },
        { id: 'b', name: '  ', quantity: 1 },
        { name: '번호 없음', quantity: 1 },
        'x',
      ],
      owned: { a: '3', 'a.1/m0': 4, 'a.1/m1': -1, 'z.1/m0': 5, 'a.2/m0': 'x' },
      choices: {
        methods: { a: 'coin', 'a.1/m0': 7, 'a.1/m1': 'x', 'z.1/m0': 'buy' },
        beadChecked: ['a.1/m0', 'z', 3],
      },
    });
    expect(state).toEqual({
      goals: [{ id: 'a', name: '롱 소드', quantity: 2 }],
      owned: { a: 3, 'a.1/m0': 4 },
      choices: { methods: { a: 'coin', 'a.1/m0': 7 }, beadChecked: ['a.1/m0'] },
    });
  });

  it('목표 목록이 배열이 아니면 빈 상태다', () => {
    expect(parseState({ goals: 'x' }).goals).toEqual([]);
    expect(parseState(null).goals).toEqual([]);
  });
});
