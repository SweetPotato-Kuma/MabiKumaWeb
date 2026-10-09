import type { KitPricing } from '@/features/kits/pricing';

/** 2026-10-09 공식 구매 옵션. 운영 데이터는 서버가 수집하고 이 값은 회귀 시험에만 쓴다. */
export const NIGHTMARE_PRICING: KitPricing = {
  checkedAt: '2026-10-09T00:00:00.000Z',
  source: 'https://mabinogi.nexon.com/ItemShop/product_detail.asp?product_no=630516',
  bundles: [
    [1, '630516', 1200, 1200],
    [10, '630518', 12000, 12000],
    [20, '630519', 24000, 22700],
    [30, '630520', 36000, 33100],
    [40, '630521', 48000, 42100],
  ].map(([units, productId, regularCash, saleCash]) => ({
    units: Number(units),
    productId: String(productId),
    label: `${units}개`,
    regularCash: Number(regularCash),
    saleCash: Number(saleCash),
    mileageRatePercent: 2,
  })),
};
