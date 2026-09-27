import { afterEach, describe, expect, it } from 'vitest';
import type { AuctionItem } from '@/features/auction/types';
import { readRelicCache, RELIC_CACHE_MAX_AGE_MS, writeRelicCache } from './hooks';
import { summarizeMurias } from './prices';

const listing = (item_name: string, price: number, relic?: string): AuctionItem => ({
  item_name,
  item_display_name: item_name,
  item_count: 1,
  auction_item_category: '유물',
  auction_price_per_unit: price,
  date_auction_expire: '2026-09-28T22:55:00.000Z',
  item_option: relic
    ? [
        { option_type: '무리아스 유물', option_value: relic },
        { option_type: '전용 해제 거래 보증서 사용 불가', option_value: 'true' },
      ]
    : undefined,
});

const AT = Date.parse('2026-09-27T05:00:00.000Z');

afterEach(() => window.localStorage.clear());

describe('지난번에 본 유물 매물', () => {
  it('표에 필요한 것만 남기고, 되읽어도 같은 표가 나온다', () => {
    const items = [
      listing('무리아스의 유물', 80_000_000, '오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)'),
      listing('무리아스의 유물(이데아)', 134_000_000),
      listing('와드네(특급)', 32_000_000),
    ];
    writeRelicCache(AT, items);

    const cached = readRelicCache(AT + 60_000);
    expect(cached?.at).toBe(AT);
    expect(summarizeMurias(cached?.items ?? [])).toEqual(summarizeMurias(items));
    expect(cached?.items.map((item) => item.item_name)).toEqual(items.map((item) => item.item_name));
  });

  it('너무 오래됐거나 모양이 다르면 쓰지 않는다', () => {
    writeRelicCache(AT, [listing('와드네', 1)]);
    expect(readRelicCache(AT + RELIC_CACHE_MAX_AGE_MS + 1)).toBeNull();

    window.localStorage.setItem('mabikuma:relics:last', '{"rows":"x"}');
    expect(readRelicCache(AT)).toBeNull();
    window.localStorage.setItem('mabikuma:relics:last', 'not json');
    expect(readRelicCache(AT)).toBeNull();
  });
});
