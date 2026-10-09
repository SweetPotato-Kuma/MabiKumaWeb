import { useMemo, useState } from 'react';
import { useMarketPrices } from '@/features/crafting/market';
import { isWednesdayInKorea, npcUnitPrice } from '@/features/crafting/npcPrices';
import { buildPlan, type CraftPlan } from '@/features/crafting/plan';
import type { RecipeBook } from '@/features/crafting/recipes';
import { coinOfItem, goalBeads, goalCoins, goalsRecipe, memoBook } from './goalPlan';
import type { MemoState } from './store';

/** 코인으로 사기로 한 재료에 드는 코인 개수. */
export interface CoinNeed {
  coin: string;
  total: number;
}

/**
 * 목표 전체의 재료 트리 계산과 그 화면 상태. 아이템 정보의 제작 비용(RecipeCost)과 같은 규칙이고,
 * 다른 점은 맨 위 줄이 목표들이라는 것과 가진 개수를 뺀다는 것이다. 고른 방법과 가진 개수는 저장소에
 * 있고, 펼침과 구매처 기본값은 이번 방문 동안만 기억한다.
 */
export function useMemoPlan(base: RecipeBook, state: MemoState) {
  const { goals, owned, choices } = state;
  // 가진 개수를 칠 때마다 저장소가 새 객체를 돌려준다. 목표 이름이 같으면 책과 코인은 다시 만들지 않는다.
  const nameKey = JSON.stringify(goals.map((goal) => goal.name));
  const names = useMemo(() => JSON.parse(nameKey) as string[], [nameKey]);
  const book = useMemo(() => memoBook(base, names), [base, names]);
  const root = useMemo(() => goalsRecipe(book, goals), [book, goals]);
  const coins = useMemo(() => goalCoins(book, names), [book, names]);
  const coinOf = useMemo(() => (id: number) => coinOfItem(book, coins, id), [book, coins]);

  const [expanded, setExpanded] = useState<string[]>([]);
  /** 물어본 이름. 계산이 "이 시세가 필요하다" 고 하면 여기에 더한다. 빼지는 않는다. */
  const [requested, setRequested] = useState<string[]>([]);
  const prices = useMarketPrices(requested);

  const [useNpc, setUseNpc] = useState(true);
  const [todayIsWednesday] = useState(() => isWednesdayInKorea());
  const [wednesday, setWednesday] = useState(todayIsWednesday);

  const beads = useMemo(
    () => goalBeads(book, coins, new Set(choices.beadChecked)),
    [book, coins, choices.beadChecked],
  );

  const planWith = (withBeads: boolean): CraftPlan =>
    buildPlan({
      book,
      recipe: root,
      quantity: 1,
      slotKeys: goals.map((goal) => goal.id),
      owned,
      priceOf: (id) => prices.get(book.itemName(id)),
      methods: choices.methods,
      expanded: new Set(expanded),
      npcPriceOf: (id) => npcUnitPrice(book.itemName(id), wednesday),
      preferNpc: useNpc,
      // 목표는 만드는 것이 기본이다. 살 거라면 줄에서 경매장 구매를 고른다.
      craftRootsByDefault: true,
      beads: withBeads ? beads : undefined,
    });
  const plan = planWith(true);
  /** 코인을 쓰지 않고 모두 골드로 샀다면. 코인을 쓰는 목표가 없으면 없다. */
  const goldPlan = coins.length > 0 ? planWith(false) : undefined;

  const missing = [
    ...new Set([...plan.needed, ...(goldPlan?.needed ?? [])].map(book.itemName)),
  ].filter((name) => !requested.includes(name));
  // 렌더 중에 상태를 고치는 React 의 "이전 렌더에서 파생" 방식. 새 이름이 있을 때만 바뀌므로 멈춘다.
  if (missing.length > 0) setRequested([...requested, ...missing]);

  /** 코인으로 사기로 한 재료의 코인 개수를 코인별로. */
  const coinNeeds: CoinNeed[] = [];
  for (const row of plan.shopping) {
    if (row.price.status !== 'coin') continue;
    const coin = coinOf(row.itemId);
    if (!coin) continue;
    const found = coinNeeds.find((each) => each.coin === coin);
    const total = row.price.unit * row.required;
    if (found) found.total += total;
    else coinNeeds.push({ coin, total });
  }

  return {
    book,
    plan,
    goldPlan,
    coins,
    coinOf,
    coinNeeds,
    expanded,
    setExpanded,
    useNpc,
    setUseNpc,
    wednesday,
    setWednesday,
    todayIsWednesday,
  };
}
