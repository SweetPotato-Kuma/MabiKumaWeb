// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { PRICE_CRON, PRICE_FILE, collectPrices } from './priceSnapshot.js';

/** 워커가 쓰는 R2 기능만 흉내 낸다. */
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

const ORIGIN = 'https://mabi.spkuma.com';
const ADMIN_KEY = 'a'.repeat(40);

function listing(name, price, count = 1) {
  return {
    item_name: name,
    item_display_name: name,
    item_count: count,
    auction_price_per_unit: price,
    date_auction_expire: '2026-09-28T17:00:00.000Z',
  };
}

/** 이름 -> 쪽 목록. 'fail' 이면 500, 'unknown' 이면 경매장이 모르는 이름(OPENAPI00004). */
let pagesByName;
let calls;

function stubNexon() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = new URL(String(input));
      const name = url.searchParams.get('item_name');
      calls.push(name);
      const pages = pagesByName[name] ?? [[]];
      if (pages === 'fail') return new Response('{}', { status: 500 });
      if (pages === 'unknown')
        return new Response(JSON.stringify({ error: { name: 'OPENAPI00004' } }), { status: 400 });
      const index = Number(url.searchParams.get('cursor') || 0);
      const body = { auction_item: pages[index] };
      if (index + 1 < pages.length) body.next_cursor = String(index + 1);
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

let env;

function saved() {
  return JSON.parse(env.ICONS.store.get(PRICE_FILE).value);
}

describe('이름으로 묻는 시세 모으기', () => {
  beforeEach(() => {
    pagesByName = {};
    calls = [];
    env = {
      ICONS: fakeR2(),
      NEXON_API_KEY: 'key',
      ADMIN_KEY,
      ITEM_CARDS: {},
      ALLOWED_ORIGINS: ORIGIN,
    };
    stubNexon();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('이름마다 쪽을 끝까지 받아 싼 순으로 한 파일에 올린다', async () => {
    pagesByName = {
      마력석: [[listing('마력석', 1_200, 10), listing('마력석', 900, 5)], [listing('마력석', 1_000, 3)]],
      // 이름으로 물었는데 다른 아이템이 섞여 오면 뺀다.
      '브리 레흐의 정수': [[listing('브리 레흐의 정수', 39_000_000), listing('브리 레흐의 코어', 1)]],
    };
    const result = await collectPrices(env, Date.parse('2026-09-27T05:05:00Z'), [
      '마력석',
      '브리 레흐의 정수',
    ]);
    expect(result).toMatchObject({ names: 2, failed: [] });

    const file = saved();
    expect(file.at).toBe(Date.parse('2026-09-27T05:05:00Z'));
    expect(file.prices['마력석']).toMatchObject({
      offers: [
        [900, 5],
        [1_000, 3],
        [1_200, 10],
      ],
      complete: true,
    });
    expect(file.prices['브리 레흐의 정수'].offers).toEqual([[39_000_000, 1]]);
    expect(env.ICONS.store.get(PRICE_FILE).options.httpMetadata.cacheControl).toBe(
      'public, max-age=60',
    );
  });

  it('경매장이 모르는 이름은 매물 없음으로, 실패한 이름은 지난번 값을 남긴다', async () => {
    pagesByName = { 마력석: [[listing('마력석', 900)]] };
    await collectPrices(env, 1, ['마력석']);

    pagesByName = { 마력석: 'fail', '어둠의 에르그 결정 (100)': 'unknown' };
    const result = await collectPrices(env, 2, ['마력석', '어둠의 에르그 결정 (100)']);
    expect(result.failed).toHaveLength(1);
    const file = saved();
    expect(file.prices['마력석'].offers).toEqual([[900, 1]]);
    expect(file.prices['어둠의 에르그 결정 (100)']).toMatchObject({ offers: [], complete: true });
  });

  it('지금 모으기는 운영자만 쓴다', async () => {
    const call = (init = {}) =>
      worker.fetch(
        new Request('https://api.example/prices/collect', {
          method: init.method ?? 'POST',
          headers: {
            origin: ORIGIN,
            ...(init.adminKey ? { 'x-mabikuma-admin-key': init.adminKey } : {}),
          },
        }),
        env,
      );
    expect((await call()).status).toBe(401);
    const response = await call({ adminKey: ADMIN_KEY });
    expect(response.status).toBe(200);
    expect(env.ICONS.store.has(PRICE_FILE)).toBe(true);
  });

  it('5분 어긋난 크론만 시세를 모은다', async () => {
    await worker.scheduled({ cron: PRICE_CRON }, env);
    expect(env.ICONS.store.has(PRICE_FILE)).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    // 장비 매물과 거래 내역은 이 크론에서 받지 않는다.
    expect(env.ICONS.store.has('auction/manifest.json')).toBe(false);
  });
});
