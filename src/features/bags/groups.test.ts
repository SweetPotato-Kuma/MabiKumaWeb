import { describe, expect, it } from 'vitest';
import { BAG_NAMES } from './constants';
import { bareName, buildBagTree, namesOfSelection, type BagTreeNode } from './groups';

const tree = buildBagTree(BAG_NAMES);

function node(value: string, nodes: readonly BagTreeNode[] = tree): BagTreeNode | undefined {
  for (const entry of nodes) {
    if (entry.value === value) return entry;
    const found = entry.children ? node(value, entry.children) : undefined;
    if (found) return found;
  }
  return undefined;
}

describe('buildBagTree', () => {
  it('허브, 가죽, 옷감, 실크, 재료, 식품 순으로 묶는다', () => {
    expect(tree.map((entry) => entry.title)).toEqual([
      '허브',
      '가죽',
      '옷감',
      '실크',
      '재료',
      '식품',
    ]);
  });

  it('허브는 튼튼한과 더 튼튼한으로 한 번 더 나눈다', () => {
    const herb = node('group:herb')!;
    expect(herb.children!.map((entry) => entry.title)).toEqual(['허브', '더 튼튼한 허브']);
    expect(herb.children!.map((entry) => entry.children!.length)).toEqual([10, 10]);
  });

  it('더 튼튼한 쪽이 없는 재료는 나누지 않고, 품질 순으로 둔다', () => {
    expect(node('group:leather')!.children!.map((entry) => entry.title)).toEqual([
      '저가형 가죽',
      '일반 가죽',
      '고급 가죽',
      '최고급 가죽',
    ]);
  });

  it('더 튼튼한 가죽이 나오면 가죽도 나눈다', () => {
    const leather = buildBagTree([...BAG_NAMES, '더 튼튼한 고급 가죽 주머니']).find(
      (entry) => entry.value === 'group:leather',
    )!;
    expect(leather.children!.map((entry) => entry.title)).toEqual(['가죽', '더 튼튼한 가죽']);
  });

  it('재료와 식품', () => {
    expect(
      node('group:material')!
        .children!.map((entry) => entry.title)
        .sort(),
    ).toEqual(['가는 실뭉치', '거미줄', '굵은 실뭉치', '꽃바구니', '양털'].sort());
    expect(
      node('group:food')!
        .children!.map((entry) => entry.title)
        .sort(),
    ).toEqual(['감자', '달걀', '밀', '보리', '옥수수'].sort());
  });

  it('알려진 42종이 빠짐없이 한 번씩 들어간다', () => {
    expect(
      [
        ...namesOfSelection(
          tree,
          tree.map((entry) => entry.value),
        )!,
      ].sort(),
    ).toEqual([...BAG_NAMES].sort());
  });

  it('어디에도 맞지 않는 새 주머니는 기타에 모인다', () => {
    const withNew = buildBagTree([...BAG_NAMES, '튼튼한 새싹 주머니']);
    expect(withNew.at(-1)).toMatchObject({ title: '기타', children: [{ title: '새싹' }] });
  });
});

describe('namesOfSelection', () => {
  it('아무것도 고르지 않으면 모든 주머니', () => {
    expect(namesOfSelection(tree, [])).toBeNull();
  });

  it('상위 칸을 고르면 그 안의 주머니를 모두 고른 것이다', () => {
    const names = namesOfSelection(tree, ['group:herb:sturdier'])!;
    expect(names.size).toBe(10);
    expect([...names].every((name) => name.startsWith('더 튼튼한 '))).toBe(true);
  });

  it('칸과 주머니를 섞어 고를 수 있다', () => {
    const names = namesOfSelection(tree, ['group:silk', '튼튼한 양털 주머니'])!;
    expect(names.size).toBe(5);
    expect(names.has('튼튼한 양털 주머니')).toBe(true);
  });
});

describe('bareName', () => {
  it('등급과 "주머니" 를 뗀다', () => {
    expect(bareName('더 튼튼한 골드 허브 주머니')).toBe('골드 허브');
    expect(bareName('튼튼한 꽃바구니')).toBe('꽃바구니');
  });
});
