// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RELIC_PRICE_FILE, summarizeRelicOffers, writeRelicPrices } from './relicPrices.js';

/** compactItem 모양의 유물 매물. */
const relic = (name, price, text) => [
  0,
  name,
  1,
  price,
  1790600000,
  text
    ? [
        ['무리아스 유물', null, text],
        ['전용 해제 거래 보증서 사용 불가', null, 'true'],
      ]
    : [],
];

const ITEMS = [
  relic('무리아스의 유물', 95_000_000, '오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)'),
  relic('무리아스의 유물', 80_000_000, '오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)'),
  relic('무리아스의 유물', 300_000_000, '오버 드라이브 폭발 공격 대미지 700% 증가 (최대 700%)'),
  relic('무리아스의 유물(이데아)', 134_000_000),
  relic('무리아스의 유물(이데아)', 135_000_000),
  relic('와드네(특급)', 32_000_000),
];

function fakeR2() {
  const store = new Map();
  return {
    store,
    async get(key) {
      if (!store.has(key)) return null;
      const value = store.get(key).value;
      return { body: value, text: async () => value };
    },
    async put(key, value, options) {
      store.set(key, { value, options });
    },
  };
}

describe('summarizeRelicOffers', () => {
  it('옵션 문장마다 가장 싼 값과 매물 수를 세고, 이데아는 따로 센다', () => {
    expect(summarizeRelicOffers(ITEMS)).toEqual({
      idea: [134_000_000, 2],
      offers: [
        ['오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 80_000_000, 2],
        ['오버 드라이브 폭발 공격 대미지 700% 증가 (최대 700%)', 300_000_000, 1],
      ],
    });
  });
});

describe('writeRelicPrices', () => {
  const trade = [
    '오버 드라이브 폭발 공격 대미지 560% 증가 (최대 700%)',
    200_000_000,
    '2026-09-25T03:00:00.000Z',
  ];
  const db = (rows) => ({
    prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }),
  });

  it('매물 요약과 최종 거래가를 파일 하나로 올린다', async () => {
    const ICONS = fakeR2();
    const MARKET = db([{ text: trade[0], price: trade[1], ts: Date.parse(trade[2]) / 1000 }]);
    const result = await writeRelicPrices({ ICONS, MARKET }, ITEMS, 1234);

    expect(result).toEqual({ offers: 2, trades: 1 });
    const saved = ICONS.store.get(RELIC_PRICE_FILE);
    expect(saved.options.httpMetadata.cacheControl).toBe('public, max-age=60');
    expect(JSON.parse(saved.value)).toEqual({
      at: 1234,
      idea: [134_000_000, 2],
      offers: summarizeRelicOffers(ITEMS).offers,
      trades: [trade],
    });
  });

  it('거래 기록을 읽지 못하면 지난번 파일의 최종 거래가를 그대로 둔다', async () => {
    const ICONS = fakeR2();
    await ICONS.put(
      RELIC_PRICE_FILE,
      JSON.stringify({ at: 1, idea: null, offers: [], trades: [trade] }),
    );
    const MARKET = {
      prepare: () => {
        throw new Error('D1 unavailable');
      },
    };
    await writeRelicPrices({ ICONS, MARKET }, ITEMS, 2000);
    expect(JSON.parse(ICONS.store.get(RELIC_PRICE_FILE).value).trades).toEqual([trade]);
  });
});
