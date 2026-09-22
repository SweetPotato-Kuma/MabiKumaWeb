import { describe, expect, it } from 'vitest';
import { bundlePrice } from './price';

describe('bundlePrice', () => {
  it('한 개짜리는 묶음으로 보지 않는다', () => {
    /**
     * 장비는 대부분 한 칸에 하나씩 올라온다. 개당과 전체가 같은데 둘 다 보여 주면
     * 읽을 것만 늘어난다.
     */
    const price = bundlePrice(599, 1);

    expect(price.isBundle).toBe(false);
    expect(price.total).toBe(599);
  });

  it('여러 개면 전체 값을 계산한다', () => {
    const price = bundlePrice(1200, 15);

    expect(price.isBundle).toBe(true);
    expect(price.total).toBe(18000);
  });

  it('개수가 없거나 이상하면 한 개로 본다', () => {
    // 0 으로 나오면 전체 가격이 0 이 되어 공짜처럼 보인다. 그런 값을 내보내지 않는다.
    expect(bundlePrice(500, 0)).toMatchObject({ count: 1, total: 500, isBundle: false });
    expect(bundlePrice(500, Number.NaN)).toMatchObject({ count: 1, total: 500 });
  });

  it('가격이 없으면 0 으로 둔다', () => {
    expect(bundlePrice(Number.NaN, 3)).toMatchObject({ pricePerUnit: 0, total: 0, count: 3 });
  });
});
