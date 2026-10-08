// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker from './worker.js';
import {
  COLLECT_EVERY_SECONDS,
  collectKits,
  collectKitsIfDue,
  importKits,
  kitById,
  kitIndex,
  parseKitList,
  parseKitTable,
  parseNotice,
  replaceKitIcons,
} from './kits.js';

/** D1 흉내. news.test.js 와 같다. 표는 배포에 쓰는 마이그레이션 파일로 만든다. */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_news.sql', '0002_kits.sql'])
    sqlite.exec(readFileSync(new URL(`./migrations-news/${file}`, import.meta.url), 'utf8'));
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

/** 2026-10-08 15:00 KST. */
const NOW = Date.parse('2026-10-08T06:00:00.000Z');
const NOW_SEC = NOW / 1000;

/** 확률 정보 화면. 목록 줄과 숨겨진 확률표. */
const kitEntry = (seq, name, rows) =>
  `<li><a id="list_on_${seq}" href="javascript:showEw2(${seq})" >${name}</a></li>
   <input type="hidden" id="ew_page_html_${seq}" name="ew_page_html" value="${rows.join('\n')}" />`;

const FANTASIA = [
  'S 등급\t6.5128%\t[트렌드] 스페셜 단정한 비단 운문 생활 한복(남성용)\t0.1020%\t\t ',
  'C 등급\t29.7294%\t티아 풍선(5번)\t1.7488%\t\ttrue ',
];

function probSite(entries) {
  const list = entries.map(([seq, name, rows]) => kitEntry(seq, name, rows)).join('');
  const pages = { '/ItemShop/prob.asp': `<ul>${list}</ul>` };
  for (const [seq, name, rows] of entries)
    pages[`/ItemShop/prob.asp?seq=${seq}`] = kitEntry(seq, name, rows);
  const calls = [];
  return {
    calls,
    get: async (path) => {
      calls.push(path);
      if (!(path in pages)) throw new Error(`${path}: HTTP 500`);
      return pages[path];
    },
  };
}

/** 받아 둔 판매 공지 하나를 새소식 기록에 넣는다. */
function addNotice(db, id, title, body) {
  db.sqlite
    .prepare(
      `INSERT INTO news_posts (id, board, category, title, posted_at, first_seen, checked_at, revisions, body_hash)
       VALUES (?, 'notice', '샵', ?, ?, ?, ?, 1, 'h')`,
    )
    .run(id, title, NOW_SEC - 86400, NOW_SEC, NOW_SEC);
  db.sqlite
    .prepare(
      `INSERT INTO news_revisions (post_id, rev, title, body, hash, seen_at) VALUES (?, 1, ?, ?, 'h', ?)`,
    )
    .run(id, title, body, NOW_SEC);
}

const SALE_NOTICE =
  '<img alt="나이트메어 판타지아 박스 / 판매 가격 : 1,200 캐시 / 판매 기간 : 2026. 10. 1(목) 점검 후 ~ 2026. 10. 14(수) 23:59:00">';

describe('키트 확률표 읽기', () => {
  it('확률형 이벤트 상품 목록에서 번호와 이름을 읽는다', () => {
    expect(parseKitList(kitEntry(492, '비단 운문 한복 상자', []))).toEqual([
      { seq: '492', name: '비단 운문 한복 상자' },
    ]);
  });

  it('등급과 아이템 확률을 읽고, 아이템은 등급 자리를 가리킨다', () => {
    const table = parseKitTable(kitEntry(492, '상자', FANTASIA), '492');
    expect(table.grades).toEqual([
      { name: 'S 등급', chance: 0.065128 },
      { name: 'C 등급', chance: 0.297294 },
    ]);
    expect(table.items[1]).toEqual({ name: '티아 풍선(5번)', chance: 0.017488, grade: 1 });
  });

  it('등급이 없는 키트는 등급을 비우고, 이름 뒤 색 코드는 색 목록으로 뗀다', () => {
    const table = parseKitTable(
      kitEntry(460, '포션', [
        '없음\t없음\t반짝이 이름/채팅 지정 색상 변경 포션 (30일)  ■color:FFF549 ■color:00FFC82F\t2%',
      ]),
      '460',
    );
    expect(table.grades).toEqual([]);
    expect(table.items[0]).toEqual({
      name: '반짝이 이름/채팅 지정 색상 변경 포션 (30일)',
      chance: 0.02,
      colors: ['FFF549', 'FFC82F'],
    });
  });

  it('공지에서 판매 가격과 기간을 읽는다. 그림 설명에 있어도 읽는다', () => {
    expect(parseNotice(SALE_NOTICE)).toEqual({
      price: 1200,
      start: '2026-10-01',
      end: '2026-10-14',
    });
    expect(parseNotice('<p>이용 안내</p>')).toEqual({ price: null, start: null, end: null });
  });
});

describe('키트 모으기', () => {
  it('판매 중인 키트를 더하고, 가격과 기간은 받아 둔 판매 공지에서 읽는다', async () => {
    const db = fakeD1();
    addNotice(db, 4893863, '나이트메어 판타지아 박스', SALE_NOTICE);
    const site = probSite([[495, '나이트메어 판타지아 박스', FANTASIA]]);
    const summary = await collectKits({ NEWS: db }, NOW, { get: site.get });

    expect(summary).toMatchObject({ onSale: 1, added: ['나이트메어 판타지아 박스'], errors: [] });
    // 공지는 새소식 기록에서 찾으므로 공식 홈페이지에는 확률 화면만 묻는다.
    expect(site.calls).toEqual(['/ItemShop/prob.asp', '/ItemShop/prob.asp?seq=495']);
    const index = await kitIndex(db);
    expect(index).toEqual({
      updated: '2026-10-08',
      current: ['official-495'],
      kits: [
        {
          id: 'official-495',
          name: '나이트메어 판타지아 박스',
          start: '2026-10-01',
          end: '2026-10-14',
          price: 1200,
          firstSeen: '2026-10-08',
          count: 2,
        },
      ],
    });
  });

  it('공지를 아직 못 받았으면 비워 두고, 다음에 공지가 들어오면 채운다', async () => {
    const db = fakeD1();
    const site = probSite([[495, '나이트메어 판타지아 박스', FANTASIA]]);
    await collectKits({ NEWS: db }, NOW, { get: site.get });
    expect((await kitById(db, 'official-495'))?.price).toBeNull();

    addNotice(db, 4893863, '나이트메어 판타지아 박스', SALE_NOTICE);
    const summary = await collectKits({ NEWS: db }, NOW + 3600_000, { get: site.get });
    expect(summary.filled).toEqual(['나이트메어 판타지아 박스']);
    expect(await kitById(db, 'official-495')).toMatchObject({ price: 1200, start: '2026-10-01' });
  });

  it('판매가 끝나 목록에서 빠진 키트는 지우지 않고 지금 파는 목록에서만 뺀다', async () => {
    const db = fakeD1();
    await collectKits({ NEWS: db }, NOW, { get: probSite([[495, '박스', FANTASIA]]).get });
    await collectKits({ NEWS: db }, NOW + 3600_000, {
      get: probSite([[496, '새 박스', FANTASIA]]).get,
    });
    const index = await kitIndex(db);
    expect(index.current).toEqual(['official-496']);
    expect(index.kits.map((kit) => kit.id).sort()).toEqual(['official-495', 'official-496']);
  });

  it('목록을 읽지 못하면 지금 파는 목록을 그대로 둔다', async () => {
    const db = fakeD1();
    await collectKits({ NEWS: db }, NOW, { get: probSite([[495, '박스', FANTASIA]]).get });
    await collectKits({ NEWS: db }, NOW + 3600_000, { get: async () => '<h1>점검 중입니다</h1>' });
    expect((await kitIndex(db)).current).toEqual(['official-495']);
  });

  it('한 시간이 지나야 다시 모은다', async () => {
    const db = fakeD1();
    const site = probSite([[495, '박스', FANTASIA]]);
    await collectKitsIfDue({ NEWS: db }, NOW, { get: site.get });
    expect(await collectKitsIfDue({ NEWS: db }, NOW + 60_000, { get: site.get })).toEqual({
      skipped: 'not due',
    });
    const again = await collectKitsIfDue({ NEWS: db }, NOW + COLLECT_EVERY_SECONDS * 1000, {
      get: site.get,
    });
    expect(again.onSale).toBe(1);
  });
});

describe('지난 키트 올리기와 그림', () => {
  const archived = {
    id: 'archive-2018-05-24-4fdfc4',
    name: '샤인 브라이트 박스',
    start: '2018-05-24',
    end: '2018-06-13',
    price: 1200,
    grades: [{ name: 'S 등급', chance: 0.03 }],
    items: [{ name: '윈드 서클 피치 헤일로', chance: 0.00022, grade: 0, count: 2 }],
  };

  it('지난 키트는 더하기만 하고 이미 있는 키트는 건드리지 않는다', async () => {
    const db = fakeD1();
    await collectKits({ NEWS: db }, NOW, { get: probSite([[495, '박스', FANTASIA]]).get });
    const result = await importKits(
      db,
      {
        updated: '2026-10-07',
        current: ['official-495'],
        icons: { '샤인 브라이트 박스': 'aaaa.webp', '윈드 서클 피치 헤일로': 'bbbb.webp' },
        kits: [archived, { ...archived, id: 'official-495', name: '덮어쓰면 안 되는 이름' }],
      },
      NOW,
    );
    expect(result).toEqual({ received: 2, added: 1, icons: 2 });
    expect((await kitById(db, 'official-495'))?.name).toBe('박스');
    expect(await kitById(db, archived.id)).toEqual({
      ...archived,
      icons: { '샤인 브라이트 박스': 'aaaa.webp', '윈드 서클 피치 헤일로': 'bbbb.webp' },
    });
    // 크론이 이미 정한 updated 를 올린 값으로 덮지 않는다.
    expect((await kitIndex(db)).updated).toBe('2026-10-08');
  });

  it('모양이 맞지 않는 키트가 있으면 하나도 올리지 않는다', async () => {
    const db = fakeD1();
    await expect(
      importKits(db, { kits: [archived, { id: 'Bad Id', name: 'x', grades: [], items: [] }] }),
    ).rejects.toThrow('Bad Id');
    expect((await kitIndex(db)).kits).toEqual([]);
  });

  it('그림 이름 표는 통째로 바뀌고 목록에는 키트 상자 그림이 붙는다', async () => {
    const db = fakeD1();
    await importKits(db, { kits: [archived], icons: { 옛이름: 'old.webp' } });
    expect(
      await replaceKitIcons(db, { icons: { '샤인 브라이트 박스': 'box.webp', 잘못: '../x' } }),
    ).toEqual({
      icons: 1,
      skipped: 1,
    });
    expect((await kitIndex(db)).kits[0].icon).toBe('box.webp');
    expect((await kitById(db, archived.id))?.icons).toEqual({ '샤인 브라이트 박스': 'box.webp' });
  });
});

describe('키트 경로', () => {
  it('목록과 키트는 공개로 읽고, 기록 전체와 올리기는 운영자만 쓴다', async () => {
    const db = fakeD1();
    await collectKits({ NEWS: db }, NOW, { get: probSite([[495, '박스', FANTASIA]]).get });
    const env = {
      NEWS: db,
      ALLOWED_ORIGINS: 'https://mabi.spkuma.com',
      ADMIN_KEY: 'secret',
      ITEM_CARDS: {},
    };
    const call = (path, init = {}) =>
      worker.fetch(
        new Request(`https://api.example${path}`, {
          ...init,
          headers: { Origin: 'https://mabi.spkuma.com', ...init.headers },
        }),
        env,
      );

    expect((await (await call('/kits/index')).json()).kits.map((kit) => kit.id)).toEqual([
      'official-495',
    ]);
    expect((await (await call('/kits/kit?id=official-495')).json()).items).toHaveLength(2);
    expect((await call('/kits/kit?id=nope')).status).toBe(404);
    expect((await call('/kits/kit?id=../x')).status).toBe(400);
    expect((await call('/kits/archive')).status).toBe(401);
    expect((await call('/kits/import', { method: 'POST', body: '{}' })).status).toBe(401);

    const admin = { 'x-mabikuma-admin-key': 'secret', 'content-type': 'application/json' };
    const archive = await call('/kits/archive', { headers: admin });
    expect((await archive.json()).kits[0].items[0].name).toContain('비단 운문');
    const icons = await call('/kits/icons', {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ icons: { 박스: 'b.webp' } }),
    });
    expect(await icons.json()).toEqual({ icons: 1, skipped: 0 });
  });
});
