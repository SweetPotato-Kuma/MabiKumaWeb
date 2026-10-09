import { quoteBuy, type BuyQuote, type PriceState } from './market';
import { DEFAULT_WORKS, hasWorks, type Recipe, type RecipeBook, type RecipeSlot } from './recipes';

/**
 * 제작 비용 계획.
 *
 * 만들 아이템의 제작법에서 시작해 재료마다 "경매장에서 산다" 와 "직접 만든다" 가운데 하나를
 * 고르고, 만든다면 그 재료의 재료로 다시 내려간다. 고른 대로 사야 할 것을 모아 값을 매긴다.
 *
 * 시세는 화면에 보이거나 값에 들어가는 재료만 묻는다. 무거운 장비는 끝까지 펼치면 거래되는
 * 재료가 270종까지 나온다. 모두 물으면 호출량 제한에 걸리고, 그만큼 기다리게 된다.
 * 그래서 이 함수는 가격을 받지 않고 "지금 필요한 시세" 목록(needed)을 돌려준다. 화면이 그것을
 * 물어 가격을 넘기면 다시 계산하고, 그 사이 새로 필요해진 것이 있으면 또 묻는다.
 *
 * 고르지 않은 재료는 사는 쪽이 기본이다. 경매장에서 필요한 만큼 살 수 없을 때(거래 불가,
 * 매물 없음, 모자람)만 만드는 쪽으로 간다. 만드는 값이 더 싼지는 사용자가 펼쳐 보고 고른다.
 * 하위 재료 시세를 모두 알아야 판단할 수 있어서, 자동으로 고르려면 결국 전부 물어야 한다.
 */

/**
 * 재료를 어떻게 구할지. 경매장 구매('buy'), NPC 구매('npc'), 던전 코인(구슬)으로 구매('coin'),
 * 제작법 순번(Recipe.index).
 */
export type Method = 'buy' | 'npc' | 'coin' | number;

/** 사는 쪽인지(경매장, NPC, 코인 어느 쪽이든). 아니면 만드는 쪽이다. */
export const isBuying = (method: Method): method is 'buy' | 'npc' | 'coin' =>
  typeof method !== 'number';

/** 재료가 이 깊이를 넘으면 더 풀지 않는다. 게임 제작법은 다섯 단계를 넘지 않는다. */
export const MAX_DEPTH = 8;

/** 한 번 만들 때 작업 재료를 넣는 횟수. 공정을 여러 번 하는 제작법은 기준 공정 수. */
const worksOf = (recipe: Recipe) => (hasWorks(recipe) ? DEFAULT_WORKS : 1);

/**
 * 재료 값을 어디서 매기는지. 경매장 시세(PriceState), NPC 판매가('npc'), 거래 불가.
 * NPC 는 개수 제한 없이 같은 값에 판다고 본다. 'coin' 은 코인으로 사는 값(unit 은 개당 코인 개수)이라
 * 골드는 들지 않는다.
 */
export type NodePrice =
  | PriceState
  | { status: 'untradable' }
  | { status: 'npc'; unit: number }
  | { status: 'coin'; unit: number };

export interface CostSum {
  gold: number;
  /** 값을 모르는 재료(거래 불가, 매물 없음, 조회 실패). */
  unpriced: number[];
  /** 매물이 모자라 필요한 개수를 다 채우지 못한 재료. gold 에는 채운 만큼만 들어 있다. */
  short: number[];
  /** 아직 시세를 받는 중인 재료 수. */
  pending: number;
}

export interface PlanNode {
  /** 트리 안의 자리. 고른 방법과 펼침 상태를 이 값으로 기억한다. */
  key: string;
  itemId: number;
  /** 같은 칸에 대신 넣을 수 있는 다른 아이템. */
  alternatives: number[];
  /** 마무리 재료 칸인지. */
  finish: boolean;
  required: number;
  /** 이미 가진 개수(PlanInput.owned). 가진 것이 없으면 0. */
  owned: number;
  /** 더 마련해야 하는 개수. 값과 하위 재료는 이 개수로 센다. 가진 것이 없으면 required 와 같다. */
  short: number;
  depth: number;
  price: NodePrice;
  /** 필요한 개수를 샀을 때. 시세를 모르면 undefined. */
  quote?: BuyQuote;
  /** 이 재료를 만드는 제작법(금속 변환 제외). 비어 있으면 사는 수밖에 없다. */
  recipes: Recipe[];
  /** 경매장에서 거래되는지. */
  tradable: boolean;
  /** NPC 가 판다면 개당 값. */
  npcUnit?: number;
  method: Method;
  /** 사용자가 고른 방법인지. 아니면 기본값이다. */
  chosen: boolean;
  /** 코인으로 산다면 개당 코인 개수. 이 계획의 코인으로 파는 재료만. */
  coinUnit?: number;
  /**
   * "구슬로 만들기" 가 켜진 재료인지. 사용자가 이 줄을 켰거나, 켠 윗줄 아래라 함께 켜진 것이다.
   * 켜진 재료 아래에서 코인으로 파는 재료는 코인으로 사고, 구슬로 만드는 재료는 만든다.
   */
  byBeads: boolean;
  /** 구슬로 만들 수 있는 재료인지. 이 줄에 "구슬로 만들기" 칸이 생긴다. */
  beadCraftable: boolean;
  /** 만드는 중이고, 아래에서 코인으로 사거나 구슬로 만들 수 있는 재료를 모두 그렇게 골랐는지. 칸을 켠 것처럼 보인다. */
  beadsAll?: boolean;
  /** 공정마다 넣는 개수. 공정을 여러 번 하는 제작법의 작업 재료일 때만. */
  perWork?: number;
  /** 만든다면 몇 번 만들어야 하는지, 한 번에 몇 개 나오는지. */
  crafts: number;
  yieldCount: number;
  /** 사는 값. */
  buyCost: CostSum;
  /** 만드는 값. 하위 재료를 계산했을 때만. */
  craftCost?: CostSum;
  /** 고른 방법의 값. */
  cost: CostSum;
  /** 하위 재료. 만들기로 했거나 화면에서 펼친 재료만 채운다. */
  children?: PlanNode[];
}

export interface ShoppingRow {
  itemId: number;
  required: number;
  price: NodePrice;
  quote?: BuyQuote;
}

export interface CraftPlan {
  /** 목표 개수를 만들려면 몇 번 만들어야 하는지. */
  crafts: number;
  nodes: PlanNode[];
  /** 살 것을 아이템별로 모은 것. 같은 재료가 트리 여러 곳에 나와도 한 줄이다. */
  shopping: ShoppingRow[];
  /** 살 것 전부의 값. 같은 재료는 모은 개수로 싼 매물부터 채워 매긴다. 코인으로 사는 재료는 들어 있지 않다. */
  total: CostSum;
  /** 코인으로 사기로 한 재료에 드는 코인 개수. */
  beads: number;
  /** 코인으로 사기로 한 재료를 경매장에서 샀다면 드는 값. 코인 개당 가치를 구할 때 쓴다. */
  beadsWorth: CostSum;
  /**
   * 맨 위 재료 칸을 공정 재료와 마무리 재료로 나눠 매긴 값. 마무리 재료가 없는 제작법은 없다.
   * 두 구역에 같은 재료가 있으면 따로 사는 값이라 둘을 더하면 total 보다 조금 클 수 있다.
   */
  sections?: { work: CostSum; finish: CostSum };
  /** 지금 시세가 필요한 아이템. 화면이 이것을 묻는다. */
  needed: number[];
}

export interface PlanInput {
  book: RecipeBook;
  recipe: Recipe;
  quantity: number;
  /**
   * 만들 제작법의 공정 수. 작업 재료는 공정마다 다시 넣으므로 이만큼 곱한다(마무리 재료는 한 번).
   * 없으면 기준 공정 수(DEFAULT_WORKS). 하위 재료의 제작법은 늘 기준 공정 수를 쓴다.
   */
  works?: number;
  /**
   * 맨 위 재료 칸의 자리 이름. 없으면 m0, m1, ... 칸 순서가 바뀌어도 자리가 같아야 하는 쪽
   * (재료 메모의 목표 목록)이 넘긴다. 점(.)과 빗금(/)은 쓰지 않는다.
   */
  slotKeys?: readonly string[];
  /**
   * 줄의 자리(PlanNode.key) -> 이미 가진 개수. 가진 만큼은 사지도 만들지도 않는다. 만들기로 한 재료를
   * 가졌다면 모자란 개수만큼만 하위 재료를 센다.
   */
  owned?: Readonly<Record<string, number>>;
  /** 아이템 번호로 시세를 찾는다. 모르는 아이템은 undefined(아직 묻지 않음). */
  priceOf: (itemId: number) => PriceState | undefined;
  methods: Readonly<Record<string, Method>>;
  expanded: ReadonlySet<string>;
  /**
   * NPC 가 파는 재료의 개당 값(할인까지 적용한 값). 없으면 NPC 구매를 고를 수 없다.
   * 경매장만 썼을 때의 비교 계산은 이것을 빼고 한 번 더 돌린다.
   */
  npcPriceOf?: (itemId: number) => number | undefined;
  /** 따로 고르지 않은 재료를 NPC 가 팔면 NPC 에서 사는 것을 기본으로 할지. */
  preferNpc?: boolean;
  /**
   * 코인(구슬) 계산. 이 물건이 쓰는 코인 하나만 다룬다.
   * coinCostOf 는 그 코인으로 파는 재료의 개당 코인 개수, craftable 은 만들 때 그 코인이 드는 재료인지.
   * checked 는 "구슬로 만들기" 를 켠 줄의 key. 켠 재료 아래에서는 코인으로 파는 재료를 고르지 않아도
   * 코인으로 산다.
   */
  beads?: {
    checked: ReadonlySet<string>;
    coinCostOf: (itemId: number) => number | undefined;
    craftable: (itemId: number) => boolean;
  };
}

const emptyCost = (): CostSum => ({ gold: 0, unpriced: [], short: [], pending: 0 });

function addCost(target: CostSum, source: CostSum): void {
  target.gold += source.gold;
  target.pending += source.pending;
  for (const id of source.unpriced) if (!target.unpriced.includes(id)) target.unpriced.push(id);
  for (const id of source.short) if (!target.short.includes(id)) target.short.push(id);
}

/** 값을 다 아는지. 모르는 재료가 섞인 합은 실제보다 싸 보인다. */
export function isComplete(cost: CostSum): boolean {
  return cost.pending === 0 && cost.unpriced.length === 0 && cost.short.length === 0;
}

export function buildPlan(input: PlanInput): CraftPlan {
  const {
    book,
    recipe,
    quantity,
    works,
    priceOf,
    methods,
    expanded,
    npcPriceOf,
    preferNpc = false,
    beads,
    slotKeys,
    owned: ownedByKey,
  } = input;
  const needed = new Set<number>();

  /** 살 수 있는지. 경매장에서 거래되거나 NPC 가 판다. */
  const canBuy = (itemId: number) => book.isTradable(itemId) || npcPriceOf?.(itemId) !== undefined;

  /** 경매장 시세. 거래되는 아이템만 묻는다. */
  const auctionPriceFor = (itemId: number): NodePrice => {
    if (!book.isTradable(itemId)) return { status: 'untradable' };
    needed.add(itemId);
    return priceOf(itemId) ?? { status: 'loading' };
  };

  /** 고르지 않았을 때 어디서 살지. NPC 가 팔고 NPC 를 기본으로 했으면 NPC. */
  const defaultSource = (itemId: number): 'buy' | 'npc' =>
    preferNpc && npcPriceOf?.(itemId) !== undefined ? 'npc' : 'buy';

  const priceFor = (itemId: number, source: 'buy' | 'npc' | 'coin'): NodePrice => {
    const npc = npcPriceOf?.(itemId);
    const coin = beads?.coinCostOf(itemId);
    if (source === 'coin' && coin !== undefined) return { status: 'coin', unit: coin };
    return source === 'npc' && npc !== undefined
      ? { status: 'npc', unit: npc }
      : auctionPriceFor(itemId);
  };

  /** 필요한 개수를 샀을 때. NPC 는 모자람 없이 같은 값이다. 코인은 골드가 들지 않는다. */
  const quoteFor = (price: NodePrice, required: number): BuyQuote | undefined => {
    if (price.status === 'coin') return { cost: 0, filled: required, lowest: 0 };
    if (price.status === 'npc')
      return { cost: price.unit * required, filled: required, lowest: price.unit };
    return price.status === 'ok' ? quoteBuy(price.price, required) : undefined;
  };

  const buyCostOf = (
    itemId: number,
    price: NodePrice,
    required: number,
    quote?: BuyQuote,
  ): CostSum => {
    const cost = emptyCost();
    if (price.status === 'loading') cost.pending = 1;
    else if (!quote || quote.filled === 0) cost.unpriced.push(itemId);
    else {
      cost.gold = quote.cost;
      if (quote.filled < required) cost.short.push(itemId);
    }
    return cost;
  };

  /**
   * 칸에 넣을 아이템. 거래되는 것 가운데 필요한 개수를 가장 싸게 채우는 것을 쓴다.
   * 대부분의 칸은 "거래 가능 한 가지 + 거래 불가 한 가지" 라 거래 가능한 쪽이 뽑힌다.
   * NPC 가 파는 것은 거래 불가여도 살 수 있으니 후보에 넣는다.
   */
  const pickSlotItem = (slot: RecipeSlot, required: number): number => {
    const buyable = slot.ids.filter(canBuy);
    if (buyable.length === 0) return slot.ids[0];
    let best = buyable[0];
    let bestScore: [number, number] | undefined;
    for (const id of buyable) {
      const quote = quoteFor(priceFor(id, defaultSource(id)), required);
      if (!quote || quote.filled === 0) continue;
      // 다 채우는 쪽이 먼저, 그다음 싼 쪽.
      const score: [number, number] = [required - quote.filled, quote.cost];
      if (
        !bestScore ||
        score[0] < bestScore[0] ||
        (score[0] === bestScore[0] && score[1] < bestScore[1])
      ) {
        best = id;
        bestScore = score;
      }
    }
    return best;
  };

  /** 제작법의 재료 칸. times 는 한 번 만들 때 그 칸을 몇 번 넣는지(작업 재료는 공정 수만큼). */
  const slotsOf = (target: Recipe, workCount = worksOf(target), keys?: readonly string[]) => [
    ...target.materials.map((slot, index) => ({
      slot,
      finish: false,
      id: keys?.[index] ?? `m${index}`,
      times: workCount,
    })),
    ...target.finish.map((slot, index) => ({ slot, finish: true, id: `f${index}`, times: 1 })),
  ];

  /** 재료 칸 하나를 노드로. 하위 재료는 expand 가 채운다. times 는 한 번 만들 때 넣는 횟수. */
  const buildNode = (
    slot: RecipeSlot,
    finish: boolean,
    key: string,
    multiplier: number,
    times: number,
    depth: number,
    ancestors: ReadonlySet<number>,
    inheritBeads: boolean,
  ): PlanNode => {
    const required = slot.count * multiplier * times;
    const itemId = pickSlotItem(slot, required);
    const owned = Math.max(0, Math.floor(ownedByKey?.[key] ?? 0));
    // 값과 하위 재료는 가진 만큼을 뺀 개수로 센다. 어느 아이템을 넣을지는 가진 개수와 상관없이 정한다.
    const short = Math.max(0, required - owned);
    const tradable = book.isTradable(itemId);
    const npcUnit = npcPriceOf?.(itemId);
    const coinUnit = beads?.coinCostOf(itemId);
    const recipes = depth < MAX_DEPTH && !ancestors.has(itemId) ? book.subRecipesOf(itemId) : [];

    // 고른 방법이 지금도 가능한지. NPC 목록이 빠진 비교 계산에서는 NPC 구매를 고른 것이 무효가 된다.
    const choice = methods[key];
    const chosenRecipe =
      typeof choice === 'number' ? recipes.find((each) => each.index === choice) : undefined;
    const chosenSource =
      (choice === 'npc' && npcUnit !== undefined) || (choice === 'buy' && tradable)
        ? choice
        : undefined;
    const chosenCoin = choice === 'coin' && coinUnit !== undefined;

    // 사는 값은 고른 곳에서, 고르지 않았으면 기본 구매처에서 매긴다. 만들기로 해도 "구매 시" 비교에 쓴다.
    // 코인으로 사도 경매장 값은 그대로 매겨 둔다. 코인으로 사면 얼마를 아끼는지 보이게 하려는 것이다.
    const source = chosenSource ?? defaultSource(itemId);
    const price = priceFor(itemId, source);
    const quote = quoteFor(price, short);
    const buyCost = short === 0 ? emptyCost() : buyCostOf(itemId, price, short, quote);

    const buyable = price.status === 'loading' || (quote !== undefined && quote.filled >= short);
    // "구슬로 만들기" 를 켠 재료 아래에서는 고르지 않은 재료가 코인이면 코인으로 사고, 구슬로 만드는 재료면 만든다.
    const inheritsCoin = inheritBeads && !chosenSource && !chosenRecipe && coinUnit !== undefined;
    const beadable =
      !chosenSource &&
      !chosenCoin &&
      !chosenRecipe &&
      coinUnit === undefined &&
      recipes.length > 0 &&
      beads?.craftable(itemId) === true;
    const checkedHere = beadable && (inheritBeads || beads?.checked.has(key) === true);
    let method: Method = source;
    if (chosenRecipe) method = chosenRecipe.index;
    else if (chosenCoin || inheritsCoin) method = 'coin';
    else if (checkedHere) method = recipes[0].index;
    else if (!chosenSource && !buyable && recipes.length > 0) method = recipes[0].index;

    const byBeads = checkedHere && typeof method === 'number';

    const node: PlanNode = {
      key,
      itemId,
      alternatives: slot.ids.filter((id) => id !== itemId),
      finish,
      required,
      depth,
      price,
      quote,
      recipes,
      tradable,
      npcUnit,
      method,
      owned,
      short,
      chosen: chosenSource !== undefined || chosenCoin || chosenRecipe !== undefined,
      ...(coinUnit !== undefined ? { coinUnit } : {}),
      byBeads,
      beadCraftable:
        recipes.length > 0 && coinUnit === undefined && beads?.craftable(itemId) === true,
      ...(times > 1 ? { perWork: slot.count * multiplier } : {}),
      crafts: 0,
      yieldCount: 1,
      buyCost,
      cost: method === 'coin' ? emptyCost() : buyCost,
    };
    return node;
  };

  /**
   * 노드의 하위 재료를 채운다. 만들기로 했으면 값도 하위 재료의 합으로 바꾼다.
   *
   * 만들기로 했거나(값에 들어간다) 화면에서 펼쳤을 때(보인다)만 내려간다. 사는 재료를 접어 두면
   * 그 아래는 만들지도, 시세를 묻지도 않는다.
   */
  const expand = (node: PlanNode, ancestors: ReadonlySet<number>): void => {
    const crafting = !isBuying(node.method);
    if (node.recipes.length === 0 || (!crafting && !expanded.has(node.key))) return;

    const target = crafting
      ? (node.recipes.find((each) => each.index === node.method) ?? node.recipes[0])
      : node.recipes[0];
    node.yieldCount = target.yield;
    node.crafts = Math.ceil(node.short / target.yield);
    const nextAncestors = new Set(ancestors).add(node.itemId);
    const prefix = `${node.key}.${target.index}`;
    node.children = slotsOf(target).map(({ slot, finish, id, times }) => {
      const child = buildNode(
        slot,
        finish,
        `${prefix}/${id}`,
        node.crafts,
        times,
        node.depth + 1,
        nextAncestors,
        node.byBeads,
      );
      expand(child, nextAncestors);
      return child;
    });
    const craftCost = emptyCost();
    for (const child of node.children) addCost(craftCost, child.cost);
    node.craftCost = craftCost;
    if (crafting) {
      node.cost = craftCost;
      const options = node.children.filter(
        (child) => child.coinUnit !== undefined || child.beadCraftable,
      );
      node.beadsAll =
        options.length > 0 &&
        options.every((child) =>
          child.coinUnit !== undefined
            ? child.method === 'coin'
            : child.byBeads || child.beadsAll === true,
        );
    }
  };

  const crafts = Math.ceil(Math.max(1, quantity) / recipe.yield);
  const rootAncestors = new Set([recipe.item]);
  const rootWorks = hasWorks(recipe) && works !== undefined ? Math.max(1, works) : undefined;
  const nodes = slotsOf(recipe, rootWorks, slotKeys).map(({ slot, finish, id, times }) => {
    const node = buildNode(slot, finish, id, crafts, times, 0, rootAncestors, false);
    expand(node, rootAncestors);
    return node;
  });

  /** 살 것을 아이템과 구매처별로 모아 값을 매긴다. 합계에 들어가는 가지만 따라간다. */
  const buyAll = (roots: PlanNode[]) => {
    const requiredByKey = new Map<
      string,
      { itemId: number; source: 'buy' | 'npc' | 'coin'; required: number }
    >();
    const collect = (node: PlanNode) => {
      if (!isBuying(node.method) && node.children) {
        node.children.forEach(collect);
        return;
      }
      // 이미 다 가졌으면 살 것이 없다.
      if (node.short === 0) return;
      const source = node.method === 'coin' ? 'coin' : node.price.status === 'npc' ? 'npc' : 'buy';
      const key = `${source}:${node.itemId}`;
      const entry = requiredByKey.get(key);
      if (entry) entry.required += node.short;
      else requiredByKey.set(key, { itemId: node.itemId, source, required: node.short });
    };
    roots.forEach(collect);

    const total = emptyCost();
    let coins = 0;
    const worth = emptyCost();
    const shopping = [...requiredByKey.values()].map(
      ({ itemId, source, required }): ShoppingRow => {
        const price = priceFor(itemId, source);
        const quote = quoteFor(price, required);
        addCost(total, buyCostOf(itemId, price, required, quote));
        if (price.status === 'coin') {
          coins += price.unit * required;
          const auction = auctionPriceFor(itemId);
          addCost(worth, buyCostOf(itemId, auction, required, quoteFor(auction, required)));
        }
        return { itemId, required, price, quote };
      },
    );
    return { shopping, total, coins, worth };
  };

  const { shopping, total, coins, worth } = buyAll(nodes);
  const sections =
    recipe.finish.length > 0
      ? {
          work: buyAll(nodes.filter((node) => !node.finish)).total,
          finish: buyAll(nodes.filter((node) => node.finish)).total,
        }
      : undefined;

  return {
    crafts,
    nodes,
    shopping,
    total,
    beads: coins,
    beadsWorth: worth,
    ...(sections ? { sections } : {}),
    needed: [...needed],
  };
}
