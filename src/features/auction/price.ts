/**
 * 번들 가격 계산.
 *
 * 경매장은 한 칸에 여러 개를 묶어 올릴 수 있고, API 는 개당 가격만 준다.
 * 실제로 지갑에서 나가는 돈은 개당 가격이 아니라 묶음 전체 값이므로 둘 다 보여 줘야 한다.
 */

export interface BundlePrice {
  pricePerUnit: number;
  count: number;
  /** 개당 가격 곱하기 개수. API 가 주는 값이 아니라 여기서 계산한 값이다. */
  total: number;
  /** 두 개 이상 묶인 매물인지. 한 개짜리는 개당과 전체가 같아 나눠 보여 줄 이유가 없다. */
  isBundle: boolean;
}

export function bundlePrice(pricePerUnit: number, count: number): BundlePrice {
  const safeCount = Number.isFinite(count) && count > 0 ? count : 1;
  const safePrice = Number.isFinite(pricePerUnit) ? pricePerUnit : 0;

  return {
    pricePerUnit: safePrice,
    count: safeCount,
    total: safePrice * safeCount,
    isBundle: safeCount > 1,
  };
}
