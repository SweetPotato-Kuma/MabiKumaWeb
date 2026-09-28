import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TYPE_ICONS, TYPE_TREE, typeTree, UNGROUPED, type ReforgeData } from './data';

const data = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/reforge.json'), 'utf8'),
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
