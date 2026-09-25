// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import {
  collectTrades,
  compactOptions,
  dailySeries,
  hourlySeries,
  kstDay,
  recentStats,
  toTradeRow,
} from './market.js';

/**
 * D1 은 SQLite 라 Node 에 든 SQLite 로 흉내 낸다. 표도 배포에 쓰는 마이그레이션 파일로 만든다.
 * 그래서 여기서 도는 SQL 은 D1 에서 도는 SQL 과 같다. 워커가 쓰는 것은 prepare, bind, first,
 * all, run, batch 뿐이다.
 */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./migrations/0001_market.sql', import.meta.url), 'utf8'));

  return {
    sqlite,
    prepare(sql) {
      const make = (args) => ({
        bind: (...next) => make(next),
        first: async () => sqlite.prepare(sql).get(...args) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
        runSync: () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
      });
      return make([]);
    },
    // D1 의 batch 는 한 트랜잭션이다. 중간에 하나가 틀리면 전부 되돌린다.
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((stmt) => stmt.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

const ORIGIN = 'https://mabi.spkuma.com';
const ADMIN_KEY = 'a'.repeat(40);

/** 2026-09-25 12:00 KST. */
const NOW = Date.parse('2026-09-25T03:00:00.000Z');

let env;
let pages;

/** 거래 한 건. 시각은 NOW 에서 몇 초 전인지로 적는다. */
function trade(id, secondsAgo, { name = '싱싱한 풀', price = 500, count = 1, ...rest } = {}) {
  return {
    item_name: name,
    item_display_name: rest.display ?? name,
    item_count: count,
    auction_item_category: rest.category ?? '기타',
    auction_price_per_unit: price,
    date_auction_buy: new Date(NOW - secondsAgo * 1000).toISOString(),
    auction_buy_id: String(id),
    item_option: rest.options ?? null,
  };
}

/** 거래 내역 API 흉내. pages 를 새것부터 쪽 단위로 돌려준다. */
function stubHistory() {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = new URL(String(input));
      const index = Number(url.searchParams.get('cursor') ?? 0);
      calls.push(index);
      const page = pages[index];
      if (page instanceof Error) return new Response('{}', { status: 500 });
      return Response.json({
        auction_history: page ?? [],
        next_cursor: index + 1 < pages.length ? String(index + 1) : null,
      });
    }),
  );
  return calls;
}

beforeEach(() => {
  env = {
    NEXON_API_KEY: 'nexon-key',
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
    ADMIN_KEY,
    MARKET: fakeD1(),
  };
  pages = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function count(sql) {
  return env.MARKET.sqlite.prepare(sql).get().c;
}

describe('거래 한 건 정리', () => {
  it('옵션은 끝의 빈 칸을 떼고 배열로 줄인다', () => {
    expect(
      compactOptions([
        {
          option_type: '아이템 색상',
          option_sub_type: '파트 A',
          option_value: '25,25,25',
          option_value2: null,
          option_desc: null,
        },
      ]),
    ).toBe('[["아이템 색상","파트 A","25,25,25"]]');
    expect(compactOptions(null)).toBeNull();
  });

  it('표시 이름은 원래 이름과 다를 때만 남긴다', () => {
    expect(toTradeRow(trade(1, 0))[3]).toBeNull();
    expect(
      toTradeRow(trade(2, 0, { name: '인챈트 스크롤', display: '인챈트 스크롤 - 올빼미' }))[3],
    ).toBe('인챈트 스크롤 - 올빼미');
  });

  it('번호나 가격이 이상한 거래는 버린다', () => {
    expect(toTradeRow({ ...trade(1, 0), auction_buy_id: 'abc' })).toBeNull();
    expect(toTradeRow({ ...trade(1, 0), item_count: 0 })).toBeNull();
    expect(toTradeRow({ ...trade(1, 0), date_auction_buy: 'x' })).toBeNull();
  });
});

describe('거래 받기', () => {
  it('처음에는 끝까지 받고 받은 곳과 시작한 날을 적는다', async () => {
    pages = [
      [trade(3, 60, { price: 700 }), trade(2, 120, { price: 500 })],
      [trade(1, 180, { price: 600, options: [{ option_type: '품질', option_value: '5' }] })],
    ];
    const calls = stubHistory();

    const result = await collectTrades(env, NOW);

    expect(calls).toEqual([0, 1]);
    expect(result).toMatchObject({
      pages: 2,
      fetched: 3,
      inserted: 3,
      complete: true,
      error: null,
    });
    expect(count('SELECT COUNT(*) AS c FROM trades')).toBe(3);
    const meta = env.MARKET.sqlite.prepare("SELECT value FROM meta WHERE key = 'last_ts'").get();
    expect(Number(meta.value)).toBe(NOW / 1000 - 60);
    expect(env.MARKET.sqlite.prepare('SELECT options FROM trades WHERE id = 1').get().options).toBe(
      '[["품질",null,"5"]]',
    );
  });

  it('다음에는 지난번 받은 곳을 10분 지나면 멈추고 겹친 거래는 한 번만 들어간다', async () => {
    pages = [[trade(2, 60)], [trade(1, 120)]];
    stubHistory();
    await collectTrades(env, NOW);

    // 20분 뒤. 새 거래 둘, 겹치는 거래 하나, 그 아래로는 읽지 않아야 한다.
    const later = NOW + 20 * 60 * 1000;
    pages = [[trade(5, -1100), trade(4, -900)], [trade(2, 60), trade(0, 1200)], [trade(-1, 3000)]];
    const calls = stubHistory();
    const result = await collectTrades(env, later);

    expect(calls).toEqual([0, 1]);
    expect(result.inserted).toBe(3);
    expect(count('SELECT COUNT(*) AS c FROM trades')).toBe(5);
  });

  it('중간에 실패하면 받은 것은 넣되 받은 곳은 옮기지 않는다', async () => {
    pages = [[trade(2, 1000)], [trade(1, 2000)]];
    stubHistory();
    await collectTrades(env, NOW);

    pages = [[trade(4, 10)], new Error('boom')];
    stubHistory();
    const result = await collectTrades(env, NOW);

    expect(result.error).toMatch(/500/);
    expect(result.complete).toBe(false);
    expect(count('SELECT COUNT(*) AS c FROM trades')).toBe(3);
    const meta = env.MARKET.sqlite.prepare("SELECT value FROM meta WHERE key = 'last_ts'").get();
    expect(Number(meta.value)).toBe(NOW / 1000 - 1000);
  });

  it('90일 지난 원본은 지우고 하루 요약은 남긴다', async () => {
    pages = [[trade(1, 91 * 86400), trade(2, 60)]];
    stubHistory();
    await collectTrades(env, NOW);

    expect(count('SELECT COUNT(*) AS c FROM trades')).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM daily')).toBe(2);
  });

  it('키나 저장소가 없으면 아무것도 하지 않는다', async () => {
    expect(await collectTrades({ ...env, MARKET: undefined }, NOW)).toHaveProperty('skipped');
    expect(await collectTrades({ ...env, NEXON_API_KEY: '' }, NOW)).toHaveProperty('skipped');
  });
});

describe('통계', () => {
  it('중위는 거래 건수로, 평균은 수량으로 가중해 센다', async () => {
    pages = [
      [
        trade(1, 60, { price: 100, count: 10 }),
        trade(2, 120, { price: 300, count: 1 }),
        trade(3, 180, { price: 200, count: 1 }),
        trade(4, 240, { price: 900, count: 1 }),
        trade(5, 300, { name: '다른 것', price: 5 }),
      ],
    ];
    stubHistory();
    await collectTrades(env, NOW);

    const stats = await recentStats(env.MARKET, ['싱싱한 풀'], NOW);
    expect(stats['싱싱한 풀']).toMatchObject({
      n: 4,
      qty: 13,
      lo: 100,
      hi: 900,
      // 100, 200, 300, 900 의 가운데 둘
      mid: 250,
      // (1000 + 300 + 200 + 900) / 13
      avg: 185,
    });
    expect(stats).not.toHaveProperty('다른 것');
  });

  it('최근 1일 밖의 거래는 세지 않는다', async () => {
    pages = [[trade(1, 60, { price: 100 }), trade(2, 25 * 3600, { price: 9999 })]];
    stubHistory();
    await collectTrades(env, NOW);

    expect((await recentStats(env.MARKET, ['싱싱한 풀'], NOW))['싱싱한 풀']).toMatchObject({
      n: 1,
      hi: 100,
    });
  });

  it('하루 요약은 한국 시각으로 날을 가른다', async () => {
    // NOW 는 KST 12:00. 12시간 1분 전은 전날 23:59 다.
    pages = [[trade(1, 60, { price: 100 }), trade(2, 12 * 3600 + 60, { price: 300 })]];
    stubHistory();
    await collectTrades(env, NOW);

    const series = await dailySeries(env.MARKET, '싱싱한 풀', 30, NOW);
    expect(series).toEqual([
      { date: '2026-09-24', n: 1, qty: 1, lo: 300, hi: 300, mid: 300, avg: 300 },
      { date: '2026-09-25', n: 1, qty: 1, lo: 100, hi: 100, mid: 100, avg: 100 },
    ]);
    expect(kstDay(NOW / 1000)).toBe(kstDay(NOW / 1000 - 12 * 3600 + 1));
  });

  it('시간별 요약은 한국 시각의 시(時)로 가르고 칸마다 날짜와 시를 붙인다', async () => {
    // NOW 는 KST 12:00. 1분 전은 11시, 11시간 59분 전은 00시, 12시간 1분 전은 전날 23시다.
    pages = [
      [
        trade(1, 60, { price: 100, count: 3 }),
        trade(2, 120, { price: 300 }),
        trade(3, 11 * 3600 + 59 * 60, { price: 50 }),
        trade(4, 12 * 3600 + 60, { price: 70 }),
      ],
    ];
    stubHistory();
    await collectTrades(env, NOW);

    const series = await hourlySeries(env.MARKET, '싱싱한 풀', 7 * 24, NOW);
    expect(series).toEqual([
      { date: '2026-09-24', hour: 23, n: 1, qty: 1, lo: 70, hi: 70, mid: 70, avg: 70 },
      { date: '2026-09-25', hour: 0, n: 1, qty: 1, lo: 50, hi: 50, mid: 50, avg: 50 },
      // 100 x 3 과 300 x 1. 중위는 건수로 200, 평균은 수량으로 (300 + 300) / 4 = 150
      { date: '2026-09-25', hour: 11, n: 2, qty: 4, lo: 100, hi: 300, mid: 200, avg: 150 },
    ]);
  });

  it('시간별 요약은 정한 칸 수보다 앞의 거래를 세지 않는다', async () => {
    // 지금 시간(12시)을 포함해 2칸이면 11시와 12시다. 11시 전 거래는 빠진다.
    pages = [[trade(1, 60, { price: 100 }), trade(2, 3 * 3600, { price: 300 })]];
    stubHistory();
    await collectTrades(env, NOW + 30 * 60 * 1000);

    const series = await hourlySeries(env.MARKET, '싱싱한 풀', 2, NOW + 30 * 60 * 1000);
    expect(series.map((row) => row.hour)).toEqual([11]);
  });

  it('같은 날 거래가 더 들어오면 그날 요약을 다시 센다', async () => {
    pages = [[trade(1, 600, { price: 100 })]];
    stubHistory();
    await collectTrades(env, NOW);
    pages = [[trade(2, 60, { price: 300 })]];
    stubHistory();
    await collectTrades(env, NOW);

    const [today] = await dailySeries(env.MARKET, '싱싱한 풀', 1, NOW);
    expect(today).toMatchObject({ n: 2, mid: 200, lo: 100, hi: 300 });
  });
});

function call(path, { method = 'GET', body, adminKey } = {}) {
  const headers = { Origin: ORIGIN };
  if (body) headers['content-type'] = 'application/json';
  if (adminKey) headers['x-mabikuma-admin-key'] = adminKey;
  return worker.fetch(
    new Request(`https://worker.example${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
}

describe('시세 경로', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    pages = [
      [
        trade(1, 60, { price: 100 }),
        trade(2, 120, { price: 300 }),
        trade(3, 2 * 86400, { price: 50 }),
        trade(4, 60, { name: '가죽', price: 20, category: '재료' }),
      ],
    ];
    stubHistory();
    await collectTrades(env, NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('아이템 하나의 최근 1일 값과 날짜별 요약을 준다', async () => {
    const response = await call(`/market/item?name=${encodeURIComponent('싱싱한 풀')}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);

    const body = await response.json();
    expect(body.recent).toMatchObject({ n: 2, lo: 100, hi: 300, mid: 200 });
    expect(body.daily.map((row) => row.date)).toEqual(['2026-09-23', '2026-09-25']);
    // 시간별은 최근 7일이라 이틀 전(12:00) 거래도 든다. 1, 2번은 같은 11시 칸이다.
    expect(body.hourly.map((row) => `${row.date} ${row.hour}`)).toEqual([
      '2026-09-23 12',
      '2026-09-25 11',
    ]);
    expect(body.since).toBe('2026-09-23');
    expect(body.updated).toBe(new Date(NOW).toISOString());
  });

  it('거래가 없던 아이템은 빈 값이다', async () => {
    const body = await (await call(`/market/item?name=${encodeURIComponent('없는 것')}`)).json();
    expect(body.recent).toBeNull();
    expect(body.daily).toEqual([]);
  });

  it('이름 여럿의 최근 1일 값을 한 번에 준다', async () => {
    const response = await call('/market/recent', {
      method: 'POST',
      body: { names: ['싱싱한 풀', '가죽', '없는 것'] },
    });
    const body = await response.json();
    expect(Object.keys(body.items).sort()).toEqual(['가죽', '싱싱한 풀']);
    expect(body.items['가죽'].mid).toBe(20);
  });

  it('이름이 없거나 너무 많으면 거절한다', async () => {
    expect((await call('/market/item')).status).toBe(400);
    expect((await call('/market/recent', { method: 'POST', body: { names: [] } })).status).toBe(
      400,
    );
    const many = Array.from({ length: 61 }, (_, i) => `아이템 ${i}`);
    expect((await call('/market/recent', { method: 'POST', body: { names: many } })).status).toBe(
      400,
    );
  });

  it('조회 횟수 제한에 걸리면 429 다', async () => {
    env.MARKET_RATE_LIMIT = { limit: async () => ({ success: false }) };
    expect((await call(`/market/item?name=${encodeURIComponent('가죽')}`)).status).toBe(429);
  });

  it('저장소를 안 붙였으면 503 이다', async () => {
    env.MARKET = undefined;
    expect((await call(`/market/item?name=${encodeURIComponent('가죽')}`)).status).toBe(503);
  });

  it('지금 받기는 운영자만 쓴다', async () => {
    // 운영자 키 확인은 카드 저장소가 붙어 있어야 켜진다. 여기서는 있기만 하면 된다.
    env.ITEM_CARDS = {};
    expect((await call('/market/collect', { method: 'POST' })).status).toBe(401);
    const response = await call('/market/collect', { method: 'POST', adminKey: ADMIN_KEY });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ inserted: 0, complete: true });
  });

  it('크론이 불리면 거래를 받는다', async () => {
    pages = [[trade(9, 30, { price: 400 })]];
    stubHistory();
    await worker.scheduled({}, env);
    expect(count('SELECT COUNT(*) AS c FROM trades WHERE id = 9')).toBe(1);
  });
});
