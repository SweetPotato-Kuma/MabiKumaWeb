import { isBuying, type PlanNode } from '@/features/crafting/plan';

/** 구해야 하는 재료 한 종의 전체 개수와 가진 개수. */
export interface MaterialTotal {
  itemId: number;
  /** 트리 전체에서 필요한 개수. */
  required: number;
  /** 줄마다 적은 가진 개수의 합. */
  owned: number;
}

/**
 * 목표 전체의 재료를 아이템별로 합친다. 만들기로 한 줄은 그 아래 재료로 풀어 가고, 사거나 구하기로 한
 * 줄(목표 자신 포함)만 센다. 같은 재료가 트리 여러 곳에 나오면 한 줄이고, 처음 나온 차례를 따른다.
 * 윗줄을 이미 가져 만들 필요가 없어진 가지(필요 개수 0)는 뺀다.
 */
export function materialTotals(nodes: readonly PlanNode[]): MaterialTotal[] {
  const byItem = new Map<number, MaterialTotal>();
  const collect = (node: PlanNode) => {
    if (!isBuying(node.method) && node.children) {
      node.children.forEach(collect);
      return;
    }
    if (node.required === 0) return;
    const found = byItem.get(node.itemId);
    if (found) {
      found.required += node.required;
      found.owned += node.owned;
    } else {
      byItem.set(node.itemId, { itemId: node.itemId, required: node.required, owned: node.owned });
    }
  };
  nodes.forEach(collect);
  return [...byItem.values()];
}
