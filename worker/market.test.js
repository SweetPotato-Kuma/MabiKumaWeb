// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import {
  collectTrades,
  compactOptions,
  dailySeries,
  expandOptions,
  hourlySeries,
  kstDay,
  lastTradesByOption,
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
  for (const file of ['0001_market.sql', '0002_horn.sql', '0003_trades_category_index.sql']) {
    sqlite.exec(readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
  }

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

  it('압축한 옵션을 되펴면 원래 객체로 돌아온다', () => {
    expect(expandOptions('[["아이템 색상","파트 A","25,25,25"]]')).toEqual([
      { option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '25,25,25' },
    ]);
    expect(expandOptions(null)).toBeUndefined();
    expect(expandOptions('[]')).toBeUndefined();
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

describe('옵션 문장마다 최종 거래', () => {
  const relic = (value) => [
    { option_type: '무리아스 유물', option_value: value },
    { option_type: '전용 해제 거래 보증서 사용 불가', option_value: 'true' },
  ];
  const seven = '오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)';
  const ten = '오버 드라이브 폭발 공격 대미지 700% 증가 (최대 700%)';

  it('같은 옵션 문장은 가장 최근 거래 하나만 준다', async () => {
    const name = '무리아스의 유물';
    pages = [
      [
        trade(1, 60, { name, price: 80_000_000, options: relic(seven) }),
        trade(2, 3600, { name, price: 95_000_000, options: relic(seven) }),
        trade(3, 86400, { name, price: 300_000_000, options: relic(ten) }),
        trade(4, 60, { name: '무리아스의 유물(이데아)', price: 134_000_000 }),
      ],
    ];
    stubHistory();
    await collectTrades(env, NOW);

    const trades = await lastTradesByOption(env.MARKET, name, '무리아스 유물');
    expect(trades).toEqual([
      [seven, 80_000_000, new Date(NOW - 60_000).toISOString()],
      [ten, 300_000_000, new Date(NOW - 86_400_000).toISOString()],
    ]);

    const response = await call(
      `/market/option-trades?name=${encodeURIComponent(name)}&type=${encodeURIComponent('무리아스 유물')}`,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).trades).toHaveLength(2);
    expect((await call('/market/option-trades?name=x')).status).toBe(400);
  });
});

describe('인기 거래 아이템', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    pages = [
      [
        trade(1, 60, { price: 100 }),
        trade(2, 120, { price: 300 }),
        trade(3, 2 * 86400, { price: 50 }),
        trade(4, 60, { name: '가죽', price: 20, count: 10, category: '재료' }),
        trade(5, 90, { name: '비싼 검', price: 100_000, category: '검' }),
        // 1시간 밖(2시간 전)이지만 24시간 안이다.
        trade(6, 7200, { name: '가죽', price: 10, count: 10, category: '재료' }),
      ],
    ];
    stubHistory();
    await collectTrades(env, NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('24시간은 거래 횟수순과 총 거래 금액순을 따로 준다', async () => {
    const body = await (await call('/market/popular?window=24h')).json();

    // 풀 2건(총 400), 가죽 2건(수량 20, 총 300), 검 1건. 횟수가 같으면 총 금액이 큰 쪽이 앞이다.
    expect(body.byCount.map((row) => row.name)).toEqual(['싱싱한 풀', '가죽', '비싼 검']);
    expect(body.byTotal.map((row) => row.name)).toEqual(['비싼 검', '싱싱한 풀', '가죽']);
    expect(body.byCount[0]).toMatchObject({ n: 2, qty: 2, total: 400, avg: 200, category: '기타' });
    expect(body.byCount[1]).toMatchObject({ n: 2, qty: 20, total: 300, avg: 15 });
  });

  it('1시간은 그 안의 거래만 센다', async () => {
    const body = await (await call('/market/popular?window=1h')).json();

    // 가죽과 검은 1건씩이라 총 금액이 큰 검이 앞이다.
    expect(body.byCount.map((row) => `${row.name}:${row.n}`)).toEqual([
      '싱싱한 풀:2',
      '비싼 검:1',
      '가죽:1',
    ]);
  });

  it('7일은 하루 요약으로 세어 이틀 전 거래도 든다', async () => {
    const body = await (await call('/market/popular?window=7d')).json();

    expect(body.byCount[0]).toMatchObject({ name: '싱싱한 풀', n: 3, total: 450 });
    expect(body.window).toBe('7d');
  });

  it('집계 기간과 기준 시각을 함께 준다', async () => {
    const day = await (await call('/market/popular?window=24h')).json();
    expect(day.to).toBe(new Date(NOW).toISOString());
    expect(day.from).toBe(new Date(NOW - 86_400_000).toISOString());
    expect(day.updated).toBe(new Date(NOW).toISOString());

    // 7일 창은 한국 시각 날짜로 가른다. 오늘(09-25)을 포함해 7일이라 09-19 00:00 KST 부터다.
    const week = await (await call('/market/popular?window=7d')).json();
    expect(week.from).toBe('2026-09-18T15:00:00.000Z');
  });

  it('기록을 모으기 시작한 날이 창보다 늦으면 부분 집계라고 알린다', async () => {
    const week = await (await call('/market/popular?window=7d')).json();
    // 수집은 이틀 전(2026-09-23)부터 시작했다.
    expect(week.partial).toBe(true);
    expect(week.since).toBe('2026-09-23');

    const hour = await (await call('/market/popular?window=1h')).json();
    expect(hour.partial).toBe(false);
  });

  it('수량이 0 이하인 줄은 평균을 0 으로 적지 않고 비운다', async () => {
    env.MARKET.sqlite.exec(
      "INSERT INTO daily (name, day, category, n, qty, total, lo, hi, mid) VALUES ('깨진 줄', " +
        `${kstDay(Math.floor(NOW / 1000))}, '기타', 50, 0, 1310000, 0, 0, 0)`,
    );
    const body = await (await call('/market/popular?window=7d')).json();

    expect(body.byCount.find((row) => row.name === '깨진 줄')).toMatchObject({ n: 50, avg: null });
  });

  it('모르는 기간은 거절하고, 기간을 안 주면 24시간이다', async () => {
    expect((await call('/market/popular?window=1y')).status).toBe(400);
    expect((await (await call('/market/popular')).json()).window).toBe('24h');
  });

  it('거래가 없던 기간은 빈 순위다', async () => {
    env.MARKET.sqlite.exec('DELETE FROM trades; DELETE FROM daily');
    const body = await (await call('/market/popular?window=24h')).json();

    expect(body.byCount).toEqual([]);
    expect(body.byTotal).toEqual([]);
  });

  it('조회 횟수 제한에 걸리면 429, 저장소가 없으면 503, POST 는 거절한다', async () => {
    env.MARKET_RATE_LIMIT = { limit: async () => ({ success: false }) };
    expect((await call('/market/popular')).status).toBe(429);
    env.MARKET_RATE_LIMIT = undefined;
    expect((await call('/market/popular', { method: 'POST', body: {} })).status).toBe(405);
    env.MARKET = undefined;
    expect((await call('/market/popular')).status).toBe(503);
  });
});

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

  it('카테고리로 거래 목록을 새것부터 준다', async () => {
    const body = await (await call(`/market/history?category=${encodeURIComponent('기타')}`)).json();
    expect(body.auction_history.map((row) => row.auction_buy_id)).toEqual(['1', '2', '3']);
    expect(body.next_cursor).toBeNull();
  });

  it('이름으로 거를 수 있다', async () => {
    const body = await (await call(`/market/history?name=${encodeURIComponent('가죽')}`)).json();
    expect(body.auction_history).toHaveLength(1);
    expect(body.auction_history[0]).toMatchObject({
      item_name: '가죽',
      auction_item_category: '재료',
      auction_price_per_unit: 20,
    });
  });

  it('쪽을 나누고 커서로 이어 받는다', async () => {
    const first = await (
      await call(`/market/history?category=${encodeURIComponent('기타')}&limit=1`)
    ).json();
    expect(first.auction_history.map((row) => row.auction_buy_id)).toEqual(['1']);
    expect(first.next_cursor).not.toBeNull();

    const second = await (
      await call(
        `/market/history?category=${encodeURIComponent('기타')}&limit=1&cursor=${first.next_cursor}`,
      )
    ).json();
    expect(second.auction_history.map((row) => row.auction_buy_id)).toEqual(['2']);
  });

  it('카테고리도 이름도 없으면 서버 전체에서 새것부터 준다', async () => {
    // 1번과 4번은 같은 시각(60초 전)이라 id 가 큰 4번이 먼저다.
    const body = await (await call('/market/history?limit=2')).json();
    expect(body.auction_history.map((row) => row.auction_buy_id)).toEqual(['4', '1']);
    expect(body.next_cursor).not.toBeNull();
  });

  it('옵션이 있던 거래는 그대로 되펴 돌려준다', async () => {
    pages = [[trade(9, 10, { price: 999, options: [{ option_type: '품질', option_value: '5' }] })]];
    stubHistory();
    await collectTrades(env, NOW);

    const body = await (
      await call(`/market/history?name=${encodeURIComponent('싱싱한 풀')}&limit=1`)
    ).json();
    expect(body.auction_history[0].item_option).toEqual([{ option_type: '품질', option_value: '5' }]);
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
