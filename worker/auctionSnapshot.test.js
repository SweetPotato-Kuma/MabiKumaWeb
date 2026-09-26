// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { SNAPSHOT_CATEGORIES, collectSnapshot, compactItem } from './auctionSnapshot.js';

/** 워커가 쓰는 R2 기능만 흉내 낸다. get 은 text() 를, list 는 접두어로 거른 키를 준다. */
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
    async delete(keys) {
      for (const key of [].concat(keys)) store.delete(key);
    },
    async list({ prefix }) {
      return { objects: [...store.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })), truncated: false };
    },
  };
}

const ORIGIN = 'https://mabi.spkuma.com';
const ADMIN_KEY = 'a'.repeat(40);

function listing(name, price, options = []) {
  return {
    item_name: name,
    item_display_name: name,
    item_count: 1,
    auction_item_category: '모자/가발',
    auction_price_per_unit: price,
    date_auction_expire: '2026-09-28T17:00:00.000Z',
    item_option: options,
  };
}

/** 카테고리 -> 쪽 목록. 없는 카테고리는 빈 쪽 하나, 'fail' 이면 500. */
let pagesByCategory;
let calls;

function stubNexon() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = new URL(String(input));
      const category = url.searchParams.get('auction_item_category');
      calls.push(category);
      const pages = pagesByCategory[category] ?? [[]];
      if (pages === 'fail') return new Response('{}', { status: 500 });
      const index = Number(url.searchParams.get('cursor') || 0);
      const body = { auction_item: pages[index] };
      if (index + 1 < pages.length) body.next_cursor = String(index + 1);
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

let env;

beforeEach(() => {
  env = {
    NEXON_API_KEY: 'nexon-key',
    ALLOWED_ORIGINS: ORIGIN,
    ADMIN_KEY,
    ITEM_CARDS: {},
    ICONS: fakeR2(),
    ICON_BASE_URL: 'https://icons.test/',
  };
  pagesByCategory = {};
  calls = [];
  stubNexon();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function call(path, { method = 'GET', adminKey } = {}) {
  const headers = { Origin: ORIGIN };
  if (adminKey) headers['x-mabikuma-admin-key'] = adminKey;
  return worker.fetch(new Request(`https://worker.test${path}`, { method, headers }), env);
}

function manifest() {
  return JSON.parse(env.ICONS.store.get('auction/manifest.json').value);
}

function fileOf(category) {
  return JSON.parse(env.ICONS.store.get(manifest().categories[category].file).value);
}

describe('매물 줄이기', () => {
  it('이름이 같으면 0 으로, 옵션은 끝의 빈 칸을 떼어 줄인다', () => {
    const item = listing('빛나는 클로버 모자', 4650000000, [
      { option_type: '세공 옵션', option_sub_type: null, option_value: '랜스 차지 쿨타임 감소(7레벨:1초 감소)', option_value2: null, option_desc: null },
      { option_type: '내구력', option_sub_type: null, option_value: '12', option_value2: '15', option_desc: null },
    ]);
    expect(compactItem(item)).toEqual([
      0,
      '빛나는 클로버 모자',
      1,
      4650000000,
      Date.parse('2026-09-28T17:00:00.000Z') / 1000,
      [['세공 옵션', null, '랜스 차지 쿨타임 감소(7레벨:1초 감소)'], ['내구력', null, '12', '15']],
    ]);
  });

  it('원래 이름이 다르면 원래 이름을 남긴다', () => {
    const item = { ...listing('써클릿', 10), item_display_name: '축복받은 써클릿' };
    expect(compactItem(item).slice(0, 2)).toEqual(['써클릿', '축복받은 써클릿']);
  });
});

describe('장비 매물 모으기', () => {
  it('카테고리를 쪽 끝까지 받아 가격이 싼 순으로 올리고 목록을 쓴다', async () => {
    pagesByCategory['모자/가발'] = [[listing('비싼 모자', 900)], [listing('싼 모자', 100)]];
    const result = await collectSnapshot(env, Date.parse('2026-09-26T05:00:00Z'));

    expect(result.categories).toBe(SNAPSHOT_CATEGORIES.length);
    expect(result.items).toBe(2);
    expect(result.failed).toEqual([]);
    expect(fileOf('모자/가발').items.map((item) => item[1])).toEqual(['싼 모자', '비싼 모자']);
    expect(manifest().categories['모자/가발']).toMatchObject({ count: 2 });
    expect(manifest().categories['모자/가발'].file).toMatch(/^auction\/20260926T050000Z\/[0-9a-f]{8}\.js$/);
    // 이름에 시각이 들어 있어 오래 붙잡아도 된다.
    const { options } = env.ICONS.store.get(manifest().categories['모자/가발'].file);
    expect(options.httpMetadata.cacheControl).toContain('immutable');
  });

  it('실패한 카테고리는 지난번 파일을 가리키고, 두 목록 밖의 파일은 지운다', async () => {
    pagesByCategory['검'] = [[listing('숏 소드', 10)]];
    await collectSnapshot(env, Date.parse('2026-09-26T05:00:00Z'));
    const first = manifest().categories['검'];

    await collectSnapshot(env, Date.parse('2026-09-26T05:10:00Z'));
    pagesByCategory['검'] = 'fail';
    const result = await collectSnapshot(env, Date.parse('2026-09-26T05:20:00Z'));

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toContain('검');
    // 실패한 검은 5시 10분 파일을 그대로 가리킨다.
    expect(manifest().categories['검'].file).toContain('20260926T051000Z');
    // 5시 파일은 새 목록도 앞 목록도 가리키지 않으니 지워졌다.
    expect(env.ICONS.store.has(first.file)).toBe(false);
    const stamps = new Set(
      [...env.ICONS.store.keys()].filter((key) => key !== 'auction/manifest.json').map((key) => key.split('/')[1]),
    );
    expect([...stamps].sort()).toEqual(['20260926T051000Z', '20260926T052000Z']);
  });

  it('저장소나 키가 없으면 건너뛴다', async () => {
    expect(await collectSnapshot({ ...env, ICONS: undefined })).toMatchObject({ skipped: expect.any(String) });
    expect(await collectSnapshot({ ...env, NEXON_API_KEY: undefined })).toMatchObject({ skipped: expect.any(String) });
    expect(calls).toEqual([]);
  });
});

describe('모아 둔 목록 내보내기', () => {
  it('모은 적이 없으면 404 다', async () => {
    expect((await call('/auction/snapshot')).status).toBe(404);
  });

  it('목록에 파일 주소의 앞부분을 붙여 준다', async () => {
    await collectSnapshot(env, Date.parse('2026-09-26T05:00:00Z'));
    const response = await call('/auction/snapshot');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toMatch(/max-age=\d+/);
    const body = await response.json();
    expect(body.base).toBe('https://icons.test');
    expect(Object.keys(body.categories)).toHaveLength(SNAPSHOT_CATEGORIES.length);
  });

  it('내보낼 주소가 없으면 404 라 화면은 실시간으로 받는다', async () => {
    await collectSnapshot(env, Date.parse('2026-09-26T05:00:00Z'));
    env.ICON_BASE_URL = '';
    expect((await call('/auction/snapshot')).status).toBe(404);
  });

  it('지금 모으기는 운영자만 쓴다', async () => {
    expect((await call('/auction/snapshot/collect', { method: 'POST' })).status).toBe(401);
    const response = await call('/auction/snapshot/collect', { method: 'POST', adminKey: ADMIN_KEY });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ categories: SNAPSHOT_CATEGORIES.length });
  });

  it('크론이 불리면 매물도 모은다', async () => {
    await worker.scheduled({}, env);
    expect(env.ICONS.store.has('auction/manifest.json')).toBe(true);
  });
});
