import { describe, expect, it } from 'vitest';
import { quoteKitPurchase } from './pricing';
import { NIGHTMARE_PRICING } from '@/test/fixtures/kitPricing';

const kit = { price: 1200, pricing: NIGHTMARE_PRICING };

describe('키트 구매 비용·마일리지', () => {
  it.each([
    [1, 1200, 24],
    [10, 12000, 240],
    [20, 22700, 454],
    [21, 23900, 478],
    [30, 33100, 662],
    [40, 42100, 842],
    [100, 106900, 2138],
  ])('%i개를 정확히 구매하면 %i캐시, 예상 적립 %i', (count, cash, mileage) => {
    const quote = quoteKitPurchase(kit, count)!;
    expect(quote).toMatchObject({ cash, mileage });
    expect(quote.parts.reduce((sum, part) => sum + part.bundle.units * part.quantity, 0)).toBe(
      count,
    );
  });

  it('개별 구매를 고르면 20개라도 묶음 할인 없이 적립한다', () => {
    expect(quoteKitPurchase(kit, 20, 'single')).toMatchObject({ cash: 24000, mileage: 480 });
  });

  it('큰 묶음을 먼저 고르는 방식보다 작은 묶음 조합이 쌀 수 있다', () => {
    const awkward = {
      price: 10,
      pricing: {
        ...NIGHTMARE_PRICING,
        bundles: [
          { ...NIGHTMARE_PRICING.bundles[0], units: 1, regularCash: 10, saleCash: 10 },
          { ...NIGHTMARE_PRICING.bundles[1], units: 3, regularCash: 30, saleCash: 18 },
          { ...NIGHTMARE_PRICING.bundles[2], units: 4, regularCash: 40, saleCash: 23 },
        ],
      },
    };
    expect(quoteKitPurchase(awkward, 6)?.cash).toBe(36);
    // 반복 구간을 건너뛰는 계산을, 건너뛰지 않는 완전 탐색과 비교한다.
    const costs = [0];
    for (let n = 1; n <= 250; n++) {
      costs[n] = Math.min(
        ...awkward.pricing.bundles
          .filter((b) => b.units <= n)
          .map((b) => costs[n - b.units] + b.saleCash),
      );
      expect(quoteKitPurchase(awkward, n)?.cash).toBe(costs[n]);
    }
  });

  it('천만 개도 정확히 계산하고 구매 조합은 짧게 남긴다', () => {
    const quote = quoteKitPurchase(kit, 10_000_000)!;
    expect(quote).toMatchObject({ cash: 10_525_000_000, mileage: 210_500_000 });
    expect(quote.parts).toHaveLength(1);
    expect(quote.parts[0].quantity).toBe(250000);
  });

  it('마일리지 미확인과 소수점을 임의의 적립률·반올림으로 바꾸지 않는다', () => {
    expect(quoteKitPurchase({ price: 1200 }, 20)).toMatchObject({
      cash: 24000,
      mileage: null,
      official: false,
    });
    expect(quoteKitPurchase({ price: null }, 20)).toBeNull();
    const unknown = {
      ...NIGHTMARE_PRICING,
      bundles: NIGHTMARE_PRICING.bundles.map((b) => ({ ...b, mileageRatePercent: null })),
    };
    expect(quoteKitPurchase({ price: 1200, pricing: unknown }, 20)?.mileage).toBeNull();
    const fractional = {
      ...NIGHTMARE_PRICING,
      bundles: [{ ...NIGHTMARE_PRICING.bundles[0], regularCash: 123, saleCash: 123 }],
    };
    expect(quoteKitPurchase({ price: 123, pricing: fractional }, 1)?.mileage).toBeCloseTo(2.46);
  });
});
