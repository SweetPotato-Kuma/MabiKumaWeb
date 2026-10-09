import type { Kit } from './kits';

export interface KitBundle {
  productId: string;
  label: string;
  units: number;
  regularCash: number;
  saleCash: number;
  mileageRatePercent: number | null;
  mileageText?: string;
  mileageSource?: string;
}

export interface KitPricing {
  checkedAt: string;
  source: string;
  bundles: KitBundle[];
}

export type PurchaseMode = 'bundles' | 'single';

export interface PurchaseQuote {
  cash: number;
  regularCash: number;
  /** 공식 소수점 처리 규칙을 추정하지 않은 적립 계산값. */
  mileage: number | null;
  parts: { bundle: KitBundle; quantity: number }[];
  official: boolean;
}

/** 연 개수에 정확히 맞는 최저 판매가 조합. 묶음을 쪼개서 단가만 곱하지 않는다. */
export function quoteKitPurchase(
  kit: Pick<Kit, 'price' | 'pricing'>,
  count: number,
  mode: PurchaseMode = 'bundles',
): PurchaseQuote | null {
  if (!Number.isSafeInteger(count) || count < 0) return null;
  const bundles =
    kit.pricing?.bundles.filter(
      (bundle) =>
        Number.isSafeInteger(bundle.units) &&
        bundle.units > 0 &&
        bundle.units <= 1000 &&
        Number.isSafeInteger(bundle.saleCash) &&
        bundle.saleCash > 0 &&
        Number.isSafeInteger(bundle.regularCash) &&
        bundle.regularCash >= bundle.saleCash,
    ) ?? [];
  const single = bundles.find((bundle) => bundle.units === 1);
  if (!single) {
    return kit.price !== null && Number.isSafeInteger(kit.price) && kit.price > 0
      ? {
          cash: count * kit.price,
          regularCash: count * kit.price,
          mileage: null,
          parts: [],
          official: false,
        }
      : null;
  }
  const choices = mode === 'single' ? [single] : bundles;
  // 개당 판매가가 가장 낮은 묶음. 같으면 큰 묶음을 골라 반복 구간을 빨리 찾는다.
  const best = choices.reduce((prev, bundle) =>
    bundle.saleCash * prev.units < prev.saleCash * bundle.units ||
    (bundle.saleCash * prev.units === prev.saleCash * bundle.units && bundle.units > prev.units)
      ? bundle
      : prev,
  );
  const maxUnits = Math.max(...choices.map((bundle) => bundle.units));
  const costs = [0];
  const chosen: KitBundle[] = [];
  let repeating = 0;
  let remainder = count;
  let bulk = 0;
  for (let n = 1; n <= count; n++) {
    let cost = Infinity;
    let pick = single;
    for (const bundle of choices) {
      if (bundle.units <= n && costs[n - bundle.units] + bundle.saleCash < cost) {
        cost = costs[n - bundle.units] + bundle.saleCash;
        pick = bundle;
      }
    }
    costs.push(cost);
    chosen.push(pick);
    repeating =
      n >= best.units && cost === costs[n - best.units] + best.saleCash ? repeating + 1 : 0;
    // 최대 묶음 수량만큼 연속으로 같은 주기가 성립하면 점화식에 의해 이후에도 성립한다.
    // 천만 회를 입력해도 증명된 반복 구간은 묶어서 계산한다.
    if (repeating >= maxUnits) {
      bulk = Math.floor((count - n) / best.units);
      remainder = count - bulk * best.units;
      // 주기 안의 나머지는 이미 계산한 바로 앞 구간에서 읽는다.
      if (remainder > n) {
        bulk++;
        remainder -= best.units;
      }
      break;
    }
  }
  const quantities = new Map<KitBundle, number>();
  if (bulk > 0) quantities.set(best, bulk);
  while (remainder > 0) {
    const bundle = chosen[remainder - 1];
    quantities.set(bundle, (quantities.get(bundle) ?? 0) + 1);
    remainder -= bundle.units;
  }
  const parts = [...quantities]
    .map(([bundle, quantity]) => ({ bundle, quantity }))
    .sort((a, b) => b.bundle.units - a.bundle.units);
  const cash = parts.reduce((sum, { bundle, quantity }) => sum + bundle.saleCash * quantity, 0);
  const regularCash = parts.reduce(
    (sum, { bundle, quantity }) => sum + bundle.regularCash * quantity,
    0,
  );
  const mileage = parts.every(
    ({ bundle }) =>
      bundle.mileageRatePercent !== null &&
      Number.isFinite(bundle.mileageRatePercent) &&
      bundle.mileageRatePercent >= 0 &&
      bundle.mileageRatePercent <= 100,
  )
    ? parts.reduce(
        (sum, { bundle, quantity }) =>
          sum + (bundle.saleCash * quantity * bundle.mileageRatePercent!) / 100,
        0,
      )
    : null;
  return { cash, regularCash, mileage, parts, official: true };
}
