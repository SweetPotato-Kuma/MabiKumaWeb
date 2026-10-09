import { isBuying, type Method, type PlanNode } from './plan';

/**
 * 재료 트리에서 사용자가 고른 것. 줄(PlanNode.key)마다 구하는 방법과, "구슬로 만들기" 를 직접 켠 줄.
 * 아이템 정보의 제작 비용과 재료 메모가 같은 규칙으로 고른다. 모두 새 값을 돌려주고 인자를 고치지 않는다.
 */
export interface TreeChoices {
  methods: Record<string, Method>;
  /** "구슬로 만들기" 를 사용자가 직접 켠 줄의 key. 그 아래 줄은 함께 켜지므로 들어 있지 않다. */
  beadChecked: string[];
}

export const NO_CHOICES: TreeChoices = { methods: {}, beadChecked: [] };

/** 사는 줄 아래에서 코인을 고르면 값에 들어가도록 그 윗줄들을 제작으로 바꾼다. 윗줄의 체크 칸은 건드리지 않는다. */
function craftingAbove(nodes: PlanNode[], key: string): Record<string, Method> {
  const found: Record<string, Method> = {};
  const walk = (level: PlanNode[]) => {
    for (const node of level) {
      if (!key.startsWith(`${node.key}.`)) continue;
      if (isBuying(node.method)) found[node.key] = node.recipes[0].index;
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

/** 줄 하나의 구하는 방법을 바꾼다. 코인으로 사기를 고르면 그 윗줄은 제작으로 바뀐다. */
export function chooseMethod(
  choices: TreeChoices,
  nodes: PlanNode[],
  key: string,
  method: Method,
): TreeChoices {
  const above = method === 'coin' ? craftingAbove(nodes, key) : {};
  return {
    methods: { ...choices.methods, ...above, [key]: method },
    beadChecked: choices.beadChecked.filter((each) => each !== key),
  };
}

/**
 * "구슬로 만들기" 를 켜고 끈다. 그 아래 줄은 각자 고른 것을 지우고 같은 쪽으로 맞춘다.
 * off 로 끌 때 offMethod 를 남기는 것은 윗줄이 켜져 있어도 이 줄만 꺼진 채로 두기 위해서다.
 */
export function toggleBeads(
  choices: TreeChoices,
  nodes: PlanNode[],
  key: string,
  on: boolean,
  offMethod: Method,
): TreeChoices {
  const below = (each: string) => each.startsWith(`${key}.`);
  const above = on ? craftingAbove(nodes, key) : {};
  const methods = Object.fromEntries(
    Object.entries(choices.methods).filter(([each]) => each !== key && !below(each)),
  );
  const rest = choices.beadChecked.filter((each) => each !== key && !below(each));
  return {
    methods: on ? { ...methods, ...above } : { ...methods, [key]: offMethod },
    beadChecked: on ? [...rest, key] : rest,
  };
}

/** 코인으로 사거나 구슬로 만들 수 있는 줄. 맨 위 줄 가운데 이것을 한꺼번에 켜고 끈다. */
export const beadOptionsOf = (nodes: PlanNode[]) =>
  nodes.filter((node) => node.coinUnit !== undefined || node.beadCraftable);

/** beadOptionsOf 가 모두 켜져 있는지. */
export const allBeadsOn = (options: PlanNode[]) =>
  options.length > 0 &&
  options.every((node) =>
    node.coinUnit !== undefined ? node.method === 'coin' : node.byBeads || node.beadsAll === true,
  );

/** beadOptionsOf 를 모두 켜거나 끈다. 트리는 펼치지 않는다. */
export function toggleAllBeads(
  choices: TreeChoices,
  options: PlanNode[],
  on: boolean,
): TreeChoices {
  const keys = options.map((node) => node.key);
  const under = (each: string) => keys.some((key) => each === key || each.startsWith(`${key}.`));
  const methods = Object.fromEntries(
    Object.entries(choices.methods).filter(([each]) => !under(each)),
  );
  if (on) for (const node of options) if (node.coinUnit !== undefined) methods[node.key] = 'coin';
  const rest = choices.beadChecked.filter((each) => !under(each));
  return {
    methods,
    beadChecked: on
      ? [...rest, ...options.filter((node) => node.coinUnit === undefined).map((node) => node.key)]
      : rest,
  };
}

/** 줄마다 고른 구매처(경매장, NPC)는 지운다. 제작과 코인으로 사기를 고른 것은 그대로 둔다. */
export function clearSourceChoices(choices: TreeChoices): TreeChoices {
  return {
    ...choices,
    methods: Object.fromEntries(
      Object.entries(choices.methods).filter(
        ([, method]) => method === 'coin' || !isBuying(method),
      ),
    ),
  };
}
