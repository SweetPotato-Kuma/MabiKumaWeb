// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import {
  GAP_SECONDS,
  buildSearch,
  collectServer,
  parseExcludes,
  parseHorn,
  parseTerms,
} from './horn.js';

/** D1 흉내. market.test.js 와 같다. 표는 배포에 쓰는 마이그레이션 파일로 만든다. */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_market.sql', '0002_horn.sql']) {
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

/** 2026-09-28 22:00 KST. */
const NOW = Date.parse('2026-09-28T13:00:00.000Z');

let env;
/** 서버별로 API 가 돌려줄 목록. 새것부터. */
let horns;

/** 뿔피리 한 건. 시각은 NOW 에서 몇 초 전인지로 적는다. */
function horn(character, message, secondsAgo) {
  return {
    character_name: character,
    message,
    date_send: new Date(NOW - secondsAgo * 1000).toISOString(),
  };
}

function stubHorns() {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = new URL(String(input));
      const server = url.searchParams.get('server_name');
      calls.push(server);
      const list = horns[server];
      if (list instanceof Error) return new Response('{}', { status: 500 });
      return Response.json({ horn_bugle_world_history: list ?? [] });
    }),
  );
  return calls;
}

function rows() {
  return env.MARKET.sqlite
    .prepare('SELECT character, body, kind, channel, members, times, first_ts, last_ts FROM horn_posts ORDER BY id')
    .all()
    .map((row) => ({ ...row }));
}

beforeEach(() => {
  env = {
    NEXON_API_KEY: 'nexon-key',
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
    MARKET: fakeD1(),
  };
  horns = {};
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('뿔피리 글 읽기', () => {
  it('파티 광고는 이름, 채널, 인원을 떼고 채널과 인원을 따로 둔다', () => {
    expect(parseHorn('재물', '재물 : #[채널15] 새우엘 각2통 16릴 [5/8명]', '류트')).toEqual({
      body: '새우엘 각2통 16릴',
      kind: 'party',
      channel: 15,
      members: '5/8',
    });
  });

  it('사람이 쓴 글은 삽니다, 팝니다로 가르고 본문의 채널을 읽는다', () => {
    expect(parseHorn('라즈', '석궁 에르그 s50 1억삽니다', '류트').kind).toBe('buy');
    expect(parseHorn('혀련', '붕마정 1500 팝니다 18채 던뱅', '류트')).toMatchObject({
      kind: 'sell',
      channel: 18,
    });
    expect(parseHorn('a', '햄스터 4500에팔아주실분 계신가요', '류트').kind).toBe('buy');
    expect(parseHorn('a', '어르그50 주입식 3.5억 팜다', '류트').kind).toBe('sell');
    expect(parseHorn('a', '거불구슬 30에 판매합니다. 구매 문의는 귓말', '류트').kind).toBe('sell');
  });

  it('결정 구매, 사람 구함은 거래가 아니라 파티다', () => {
    expect(parseHorn('a', 'a : #[채널8] 크심 결정구매 200 세바구함 [2/3명]', '류트').kind).toBe(
      'party',
    );
    expect(parseHorn('a', '38채 켈 왕복5릴할분구함 4/8명', '류트').kind).toBe('party');
    expect(parseHorn('a', '딜러 구해요 [1/4명]', '류트').kind).toBe('party');
  });

  it('그 서버에 없는 채널이나 채팅, 채집은 채널로 읽지 않는다', () => {
    expect(parseHorn('a', '50채 앞', '울프').channel).toBeNull();
    expect(parseHorn('a', '3채팅 하실 분', '류트').channel).toBeNull();
    expect(parseHorn('a', '허리펴세요', '류트')).toMatchObject({ kind: 'chat', channel: null });
  });
});

describe('뿔피리 받기', () => {
  it('같은 캐릭터의 같은 글은 한 줄로 합치고 가장 최근 인원을 남긴다', async () => {
    horns['류트'] = [
      horn('재물', '재물 : #[채널15] 새우엘 [4/8명]', 10),
      horn('라즈', '석궁 에르그 삽니다', 15),
      horn('재물', '재물 : #[채널15] 새우엘 [3/8명]', 20),
      horn('재물', '재물 : #[채널15] 새우엘 [2/8명]', 30),
    ];
    stubHorns();

    const result = await collectServer(env, '류트', NOW);

    expect(result).toMatchObject({ fetched: 4, fresh: 4, inserted: 2, updated: 0, gap: false });
    expect(rows()).toEqual([
      {
        character: '재물',
        body: '새우엘',
        kind: 'party',
        channel: 15,
        members: '4/8',
        times: 3,
        first_ts: NOW / 1000 - 30,
        last_ts: NOW / 1000 - 10,
      },
      expect.objectContaining({ character: '라즈', kind: 'buy', times: 1 }),
    ]);
  });

  it('겹쳐 받은 글은 한 번만 세고, 새 글은 이미 있는 줄에 붙는다', async () => {
    horns['류트'] = [horn('재물', '재물 : #[채널15] 새우엘 [2/8명]', 120)];
    stubHorns();
    await collectServer(env, '류트', NOW - 90 * 1000);

    horns['류트'] = [
      horn('재물', '재물 : #[채널15] 새우엘 [5/8명]', 5),
      horn('재물', '재물 : #[채널15] 새우엘 [2/8명]', 120),
    ];
    const result = await collectServer(env, '류트', NOW);

    expect(result).toMatchObject({ fresh: 1, inserted: 0, updated: 1 });
    expect(rows()).toEqual([
      expect.objectContaining({ times: 2, members: '5/8', last_ts: NOW / 1000 - 5 }),
    ]);
  });

  it('같은 초에 외친 서로 다른 글은 지난번에 본 것만 거른다', async () => {
    horns['류트'] = [horn('a', '하나', 60)];
    stubHorns();
    await collectServer(env, '류트', NOW - 2 * 60 * 1000);

    horns['류트'] = [horn('b', '둘', 60), horn('a', '하나', 60)];
    const result = await collectServer(env, '류트', NOW);

    expect(result.fresh).toBe(1);
    expect(rows().map((row) => row.body)).toEqual(['하나', '둘']);
  });

  it('같은 글이라도 30분 넘게 쉬었다 다시 외치면 새 줄이다', async () => {
    horns['류트'] = [horn('a', '붕마정 팝니다', 0), horn('a', '붕마정 팝니다', GAP_SECONDS + 60)];
    stubHorns();

    await collectServer(env, '류트', NOW);

    expect(rows().map((row) => row.times)).toEqual([1, 1]);
  });

  it('1분 안에 다시 부르면 넥슨에 묻지 않는다', async () => {
    horns['류트'] = [horn('a', '하나', 10)];
    const calls = stubHorns();

    await collectServer(env, '류트', NOW);
    const second = await collectServer(env, '류트', NOW + 30 * 1000);
    await collectServer(env, '류트', NOW + 61 * 1000);

    expect(second).toEqual({ skipped: 'fresh' });
    expect(calls).toEqual(['류트', '류트']);
  });

  it('1,000건 상한 때문에 사이 글을 놓치면 알려 준다', async () => {
    horns['류트'] = [horn('a', '하나', 600)];
    stubHorns();
    await collectServer(env, '류트', NOW - 10 * 60 * 1000);

    horns['류트'] = [horn('b', '둘', 10), horn('c', '셋', 300)];
    const result = await collectServer(env, '류트', NOW);

    expect(result.gap).toBe(true);
  });

  it('90일 지난 줄은 지운다', async () => {
    env.MARKET.sqlite
      .prepare(
        `INSERT INTO horn_posts (server, character, body, norm, kind, times, first_ts, last_ts)
VALUES ('류트', 'a', 'old', 'a|old', 'chat', 1, ?1, ?1)`,
      )
      .run(NOW / 1000 - 91 * 86400);
    horns['류트'] = [horn('a', '새 글', 10)];
    stubHorns();

    await collectServer(env, '류트', NOW);

    expect(rows().map((row) => row.body)).toEqual(['새 글']);
  });
});

describe('검색어 읽기', () => {
  it('띄어쓰기는 그리고, 쉼표는 또는이고 공백과 대소문자를 가리지 않는다', () => {
    expect(parseTerms('탈라,탈가  세바 S50')).toEqual([['탈라', '탈가'], ['세바'], ['s50']]);
    expect(parseTerms(' , ')).toEqual([]);
    expect(parseExcludes('파티, 구함 구함')).toEqual(['파티', '구함']);
  });

  it('%, _ 같은 특수 문자는 글자 그대로 찾는다', () => {
    const { sql, params } = buildSearch({
      server: '류트',
      since: 0,
      character: '',
      kinds: null,
      groups: [['100%']],
      excludes: ['a_b'],
      limit: 10,
    });

    expect(params).toContain('100%');
    expect(params).toContain('a_b');
    expect(sql).not.toMatch(/LIKE/i);
  });

  it('D1 의 LIKE 한도(패턴 50바이트)를 넘는 긴 한글 검색어는 LIKE 없이 찾는다', () => {
    const long = parseTerms('탈라가흐트라이팟딜러구함고수만환영합니다많이와주세요')[0][0];
    expect(Buffer.byteLength(long)).toBeGreaterThan(50);

    const { sql, params } = buildSearch({
      server: '류트',
      since: 0,
      character: '',
      kinds: null,
      groups: [[long]],
      excludes: [long],
      limit: 10,
    });

    expect(sql).not.toMatch(/LIKE/i);
    expect(params).toContain(long);
  });
});

describe('GET /horn/search', () => {
  async function search(query) {
    const response = await worker.fetch(
      new Request(`https://w.example/horn/search?${new URLSearchParams(query)}`, {
        headers: { Origin: ORIGIN },
      }),
      env,
    );
    return { status: response.status, body: await response.json(), response };
  }

  beforeEach(async () => {
    // 찾기는 지금 시각을 스스로 읽는다. 글의 시각과 맞춰 둔다.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    horns['류트'] = [
      horn('혀련', '혀련 : #[채널18] 붕마정 개당 1500 구매 18채 던뱅 [1/8명]', 5),
      horn('뷰쿠', '뷰쿠 : #[채널26] 탈라 4인/세바1 [3/4명]', 10),
      horn('물감', '물감 : #[채널33] 탈라가흐 트라이팟 딜러 [3/4명]', 20),
      horn('은하수', '신비 보랏빛가방 1100 팝니다', 30),
    ];
    horns['울프'] = [horn('키위', '울프 글', 5)];
    stubHorns();
  });

  it('서버를 받고 나서 마지막으로 외친 순으로 돌려준다', async () => {
    const { status, body, response } = await search({ server: '류트' });

    expect(status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(body.posts.map((post) => post.character)).toEqual(['혀련', '뷰쿠', '물감', '은하수']);
    expect(body.posts[0]).toMatchObject({ kind: 'buy', channel: 18, members: '1/8', times: 1 });
    expect(body.more).toBe(false);
    expect(body.updated).not.toBeNull();
  });

  it('검색어는 공백을 무시하고, 쉼표는 또는, 뺄 말은 거른다', async () => {
    const both = await search({ server: '류트', q: '탈라 가흐' });
    expect(both.body.posts.map((post) => post.character)).toEqual(['물감']);

    const either = await search({ server: '류트', q: '붕마정,보랏빛' });
    expect(either.body.posts.map((post) => post.character)).toEqual(['혀련', '은하수']);

    const excluded = await search({ server: '류트', q: '탈라', not: '트라이' });
    expect(excluded.body.posts.map((post) => post.character)).toEqual(['뷰쿠']);
  });

  it('캐릭터 이름도 검색어로 찾히고, 캐릭터와 분류로 거를 수 있다', async () => {
    expect((await search({ server: '류트', q: '은하수' })).body.posts).toHaveLength(1);
    expect((await search({ server: '류트', char: '뷰쿠' })).body.posts).toHaveLength(1);
    expect(
      (await search({ server: '류트', kind: 'noparty' })).body.posts.map((post) => post.kind),
    ).toEqual(['buy', 'sell']);
    expect((await search({ server: '류트', kind: 'party' })).body.posts).toHaveLength(2);
  });

  it('줄 수를 넘으면 더 있다고 알린다', async () => {
    const { body } = await search({ server: '류트', limit: '2' });
    expect(body.posts).toHaveLength(2);
    expect(body.more).toBe(true);
  });

  it('없는 서버는 거절한다', async () => {
    const { status, body } = await search({ server: '데이안' });
    expect(status).toBe(400);
    expect(body.error.name).toBe('HORN_INVALID_SERVER');
  });

  it('넥슨이 답하지 않아도 쌓아 둔 글로 답한다', async () => {
    await collectServer(env, '울프', NOW - 5 * 60 * 1000);
    horns['울프'] = new Error('down');
    const { status, body } = await search({ server: '울프' });
    expect(status).toBe(200);
    expect(body.posts).toHaveLength(1);
  });

  it('긴 한글 검색어도 찾고, D1 의 LIKE 한도에 걸리지 않는다', async () => {
    // 로컬 SQLite 에는 없는 D1 의 한도를 흉내 낸다. LIKE 패턴이 50바이트를 넘으면 터진다.
    const real = env.MARKET.prepare.bind(env.MARKET);
    env.MARKET.prepare = (sql) => {
      const statement = real(sql);
      return {
        ...statement,
        bind: (...args) => {
          if (/ LIKE /i.test(sql) && args.some((arg) => typeof arg === 'string' && Buffer.byteLength(arg) > 50))
            throw new Error('LIKE or GLOB pattern too complex');
          return statement.bind(...args);
        },
      };
    };

    // 긴 글을 하나 더 두고 한 번 찾아 받아 둔 뒤, 저장된 줄임 글(norm)을 그대로 검색어로 쓴다. 한글 글자당 3바이트다.
    horns['류트'].push(horn('긴글', '탈라가흐 트라이팟 딜러 고수만 구합니다 많이 와주세요', 3));
    await search({ server: '류트' });
    const { norm } = env.MARKET.sqlite.prepare("SELECT norm FROM horn_posts WHERE character = '긴글'").get();
    const long = norm;
    expect(Buffer.byteLength(long)).toBeGreaterThan(50);

    const { status, body } = await search({ server: '류트', q: long });

    expect(status).toBe(200);
    expect(body.posts.map((post) => post.character)).toEqual(['긴글']);
  });
});
