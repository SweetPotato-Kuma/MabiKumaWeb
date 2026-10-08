import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { levelCaps, TYPE_ICONS, TYPE_TREE, typeTree, UNGROUPED, type ReforgeData } from './data';

const data = JSON.parse(
  readFileSync(resolve(process.cwd(), '.cache/game-data/current/reforge.json'), 'utf8'),
) as ReforgeData;

describe('아이템 타입 트리', () => {
  it('확률표의 타입이 모두 트리의 묶음 안에 있다', () => {
    const groups = typeTree(data.types);
    expect(groups.find((group) => group.name === UNGROUPED)).toBeUndefined();
    expect(groups.flatMap((group) => group.types)).toHaveLength(data.types.length);
  });

  it('트리에 적은 타입이 확률표에 있고 겹치지 않는다', () => {
    const names = TYPE_TREE.flatMap((group) => group.types);
    const known = new Set(data.types.map((type) => type.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((name) => !known.has(name))).toEqual([]);
  });

  it('타입마다 그림으로 쓸 대표 아이템이 있다', () => {
    expect(data.types.filter((type) => !TYPE_ICONS[type.name]).map((type) => type.name)).toEqual(
      [],
    );
  });

  it('트리에 없는 타입은 끝의 분류되지 않음에 붙는다', () => {
    const groups = typeTree([...data.types, { id: 999, name: '새 무기' }]);
    expect(groups.at(-1)).toEqual({ name: UNGROUPED, types: [{ id: 999, name: '새 무기' }] });
  });
});

describe('레벨 상한', () => {
  it('같은 장비의 같은 옵션은 도구가 달라도 레벨 상한이 같다', () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const [key, index] of Object.entries(data.tables)) {
      const [, type, race] = key.split('|');
      for (const [option, , max, , lbMax = 0] of data.pools[index]) {
        const id = `${type}|${race}|${option}`;
        const cap = `${max},${lbMax}`;
        const prev = seen.get(id);
        if (prev !== undefined && prev !== cap) conflicts.push(id);
        seen.set(id, cap);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('지금 도구의 표에 없는 옵션도 다른 도구의 표에서 상한을 찾는다', () => {
    // 한손 검 공용. 변신 옵션은 정교한 표에만 있고 찬란한 표에는 없다.
    const fine = new Set(data.pools[data.tables['fine|1|0']].map((row) => row[0]));
    const brilliant = new Set(data.pools[data.tables['brilliant|1|0']].map((row) => row[0]));
    const onlyFine = [...fine].filter((option) => !brilliant.has(option));
    expect(onlyFine.length).toBeGreaterThan(0);
    const caps = levelCaps(data, 1, 0);
    for (const option of onlyFine) expect(caps.get(option)?.max).toBeGreaterThan(0);
  });
});
