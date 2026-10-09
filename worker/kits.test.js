// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { NEWS_CRON } from './news.js';
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
  parseShopProducts,
  parseShopBundles,
  parseShopMileage,
  replaceKitIcons,
} from './kits.js';

/** D1 흉내. news.test.js 와 같다. 표는 배포에 쓰는 마이그레이션 파일로 만든다. */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_news.sql', '0002_kits.sql', '0003_previews.sql', '0004_banners.sql'])
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

function probSite(entries, shopPages = {}) {
  const list = entries.map(([seq, name, rows]) => kitEntry(seq, name, rows)).join('');
  const pages = {
    '/ItemShop/prob.asp': `<ul>${list}</ul>`,
    '/ItemShop/item_list.asp':
      '<li><a href="product_detail.asp?product_no=1"><div class="txt">다른 상품</div></a></li>',
    ...shopPages,
  };
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
function addNotice(db, id, title, body, { postedAt = NOW_SEC - 86400, category = '샵' } = {}) {
  db.sqlite
    .prepare(
      `INSERT INTO news_posts (id, board, category, title, posted_at, first_seen, checked_at, revisions, body_hash)
       VALUES (?, 'notice', ?, ?, ?, ?, ?, 1, 'h')`,
    )
    .run(id, category, title, postedAt, NOW_SEC, NOW_SEC);
  db.sqlite
    .prepare(
      `INSERT INTO news_revisions (post_id, rev, title, body, hash, seen_at) VALUES (?, 1, ?, ?, 'h', ?)`,
    )
    .run(id, title, body, NOW_SEC);
}

const SALE_NOTICE =
  '<img alt="나이트메어 판타지아 박스 / 판매 가격 : 1,200 캐시 / 판매 기간 : 2026. 10. 1(목) 점검 후 ~ 2026. 10. 14(수) 23:59:00">';

const SHOP_NAME = '나이트메어 판타지아 박스';
const SHOP_LIST = `<li><a href="product_detail.asp?product_no=630516"><div class="txt"><span>${SHOP_NAME}</span></div></a></li>`;
const shopDetail = (sale = 22700) =>
  [
    ['630516', 1, 1200, 1200],
    ['630519', 20, 24000, sale],
  ]
    .map(
      ([id, units, regular, price]) =>
        `<input value="${regular}" name="product_price${id}" type="hidden">
   <input name="sale_price${id}" value="${price}" type="hidden">
   <input type="radio" value="${id}" name="product_no"><label for="${id}">${units}개</label>`,
    )
    .join('');
const shopPages = (sale) => ({
  '/ItemShop/item_list.asp': SHOP_LIST,
  '/ItemShop/product_detail.asp?product_no=630516': shopDetail(sale),
  '/ItemShop/mileage.asp?nismsid=630516': '2%',
  '/ItemShop/mileage.asp?nismsid=630519': '3%',
});

describe('공식 상점 가격·마일리지', () => {
  it('구매 옵션 순서와 속성 순서에 의존하지 않고 가격을 읽는다', () => {
    expect(parseShopProducts(SHOP_LIST)).toEqual([{ productId: '630516', name: SHOP_NAME }]);
    expect(parseShopBundles(shopDetail())).toEqual([
      { productId: '630516', label: '1개', units: 1, regularCash: 1200, saleCash: 1200 },
      { productId: '630519', label: '20개', units: 20, regularCash: 24000, saleCash: 22700 },
    ]);
    expect(() => parseShopBundles(shopDetail().replace('20개', '알 수 없는 구성'))).toThrow();
    expect(() => parseShopBundles('<h1>점검 중</h1>')).toThrow();
    expect(parseShopMileage('<span>+2%</span>')).toBe(2);
    expect(parseShopMileage('0%')).toBe(0);
    expect(parseShopMileage('5 포인트')).toBeNull();
    expect(parseShopMileage('점검 중')).toBeNull();
  });

  it('묶음마다 따로 적립률을 확인하고 확률표 변경 없이도 판매가를 갱신한다', async () => {
    const db = fakeD1();
    const site = probSite([[495, SHOP_NAME, FANTASIA]], shopPages());
    const first = await collectKits({ NEWS: db }, NOW, { get: site.get });
    expect(first).toMatchObject({ priced: [SHOP_NAME], pricingErrors: [] });
    const pricing = (await kitById(db, 'official-495')).pricing;
    expect(pricing.checkedAt).toBe(new Date(NOW).toISOString());
    expect(pricing.bundles.map((bundle) => bundle.mileageRatePercent)).toEqual([2, 3]);
    expect((await kitIndex(db)).kits[0].price).toBe(1200);
    const changed = await collectKits({ NEWS: db }, NOW + 86400_000, {
      get: probSite([[495, SHOP_NAME, FANTASIA]], shopPages(22000)).get,
    });
    expect(changed).toMatchObject({ changed: [], priced: [SHOP_NAME], pricingErrors: [] });
    expect((await kitById(db, 'official-495')).pricing.bundles[1].saleCash).toBe(22000);
    expect((await kitIndex(db)).updated).toBe('2026-10-09');
  });

  it('가격 조회 실패와 판매 종료에도 마지막 확인 날짜와 기록을 보존한다', async () => {
    const db = fakeD1();
    await collectKits({ NEWS: db }, NOW, {
      get: probSite([[495, SHOP_NAME, FANTASIA]], shopPages()).get,
    });
    const before = (await kitById(db, 'official-495')).pricing;
    const failed = await collectKits({ NEWS: db }, NOW + 3600_000, {
      get: probSite([[495, SHOP_NAME, FANTASIA]], {
        ...shopPages(),
        '/ItemShop/product_detail.asp?product_no=630516': '<h1>점검 중</h1>',
      }).get,
    });
    expect(failed.errors).toEqual([]);
    expect(failed.pricingErrors).toHaveLength(1);
    expect((await kitById(db, 'official-495')).pricing).toEqual(before);
    await collectKits({ NEWS: db }, NOW + 7200_000, {
      get: probSite([[496, '다음 박스', FANTASIA]]).get,
    });
    expect((await kitById(db, 'official-495')).pricing).toEqual(before);
    expect((await kitById(db, 'official-496')).pricing).toBeUndefined();
  });

  it('묶음 적립률 조회 실패를 기본 상품의 비율로 대체하지 않는다', async () => {
    const db = fakeD1();
    const site = probSite([[495, SHOP_NAME, FANTASIA]], {
      ...shopPages(),
      '/ItemShop/mileage.asp?nismsid=630519': '<p>점검 중</p>',
    });
    const result = await collectKits({ NEWS: db }, NOW, { get: site.get });
    expect(result.pricingErrors).toHaveLength(1);
    expect((await kitById(db, 'official-495')).pricing.bundles[1]).toMatchObject({
      saleCash: 22700,
      mileageRatePercent: null,
    });
  });

  it('같은 비교 이름의 다른 상품이 있으면 임의로 연결하지 않는다', async () => {
    const db = fakeD1();
    const site = probSite([[495, SHOP_NAME, FANTASIA]], {
      '/ItemShop/item_list.asp': SHOP_LIST + SHOP_LIST.replace('630516', '630517'),
    });
    await collectKits({ NEWS: db }, NOW, { get: site.get });
    expect((await kitById(db, 'official-495')).pricing).toBeUndefined();
    expect(site.calls.some((path) => path.includes('product_detail'))).toBe(false);
  });
});

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
    // 공지는 이미 받아 둔 기록에서 읽고, 공식 상품 목록도 함께 확인한다.
    expect(site.calls).toEqual([
      '/ItemShop/prob.asp',
      '/ItemShop/prob.asp?seq=495',
      '/ItemShop/item_list.asp',
    ]);
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

/** 공지를 고친 것처럼 마지막 판의 본문을 바꾼다. */
function editNotice(db, id, body) {
  db.sqlite.prepare('UPDATE news_revisions SET body = ? WHERE post_id = ?').run(body, id);
}

const saleNotice = (name, price, from, to) =>
  `<img alt="${name} / 판매 가격 : ${price} 캐시 / 판매 기간 : ${from} 점검 후 ~ ${to} 23:59:00">`;

describe('키트 공지와 함께 갱신', () => {
  it('판매 공지를 고쳐 기간을 늘리거나 가격을 바로잡으면 다음에 모을 때 따라간다', async () => {
    const db = fakeD1();
    addNotice(db, 4893863, '나이트메어 판타지아 박스', SALE_NOTICE);
    const site = probSite([[495, '나이트메어 판타지아 박스', FANTASIA]]);
    await collectKits({ NEWS: db }, NOW, { get: site.get });
    expect(await kitById(db, 'official-495')).toMatchObject({ price: 1200, end: '2026-10-14' });

    editNotice(
      db,
      4893863,
      saleNotice('나이트메어 판타지아 박스', '1,500', '2026. 10. 1(목)', '2026. 10. 21(수)'),
    );
    const summary = await collectKits({ NEWS: db }, NOW + 600_000, { get: site.get });
    expect(summary.filled).toEqual(['나이트메어 판타지아 박스']);
    expect(await kitById(db, 'official-495')).toMatchObject({
      price: 1500,
      start: '2026-10-01',
      end: '2026-10-21',
    });
  });

  it('공지가 값을 적지 않았거나 공지를 못 찾으면 기록해 둔 값을 지우지 않는다', async () => {
    const db = fakeD1();
    addNotice(db, 4893863, '나이트메어 판타지아 박스', SALE_NOTICE);
    const site = probSite([[495, '나이트메어 판타지아 박스', FANTASIA]]);
    await collectKits({ NEWS: db }, NOW, { get: site.get });
    editNotice(db, 4893863, '<p>점검 안내로 바꿨다</p>');
    await collectKits({ NEWS: db }, NOW + 600_000, { get: site.get });
    expect(await kitById(db, 'official-495')).toMatchObject({ price: 1200, end: '2026-10-14' });
  });

  it('키트 공지가 왔다는 표시가 있으면 한 시간을 기다리지 않고 바로 모은다', async () => {
    const db = fakeD1();
    const site = probSite([[495, '박스', FANTASIA]]);
    await collectKitsIfDue({ NEWS: db }, NOW, { get: site.get });
    // 한 시간이 안 지났고 기다리는 공지도 없다.
    expect(await collectKitsIfDue({ NEWS: db }, NOW + 60_000, { get: site.get })).toEqual({
      skipped: 'not due',
    });
    const forced = await collectKitsIfDue({ NEWS: db }, NOW + 60_000, {
      get: site.get,
      force: true,
    });
    expect(forced).toMatchObject({ reason: 'notice', onSale: 1 });
    const hourly = await collectKitsIfDue(
      { NEWS: db },
      NOW + 60_000 + COLLECT_EVERY_SECONDS * 1000,
      {
        get: site.get,
      },
    );
    expect(hourly.reason).toBe('hourly');
  });

  it('판매 공지는 왔는데 확률 화면에 키트가 아직 없으면 크론마다 다시 보고, 키트가 오르면 그만 본다', async () => {
    const db = fakeD1();
    const name = '나이트메어 판타지아 박스';
    addNotice(db, 4893863, name, SALE_NOTICE, { postedAt: NOW_SEC - 3600 });
    const empty = probSite([]);
    await collectKitsIfDue({ NEWS: db }, NOW, { get: empty.get });
    // 한 시간이 안 지났어도 판매 공지가 기다리고 있어 다시 본다.
    const waiting = await collectKitsIfDue({ NEWS: db }, NOW + 600_000, { get: empty.get });
    expect(waiting).toMatchObject({ reason: 'waiting', onSale: 0 });

    const listed = probSite([[495, name, FANTASIA]]);
    const arrived = await collectKitsIfDue({ NEWS: db }, NOW + 1_200_000, { get: listed.get });
    expect(arrived).toMatchObject({ reason: 'waiting', added: [name] });
    expect(await collectKitsIfDue({ NEWS: db }, NOW + 1_800_000, { get: listed.get })).toEqual({
      skipped: 'not due',
    });
  });

  it('오래된 공지, 판매 정보가 없는 공지, 다른 분류의 공지는 기다리지 않는다', async () => {
    const db = fakeD1();
    await collectKitsIfDue({ NEWS: db }, NOW, { get: probSite([]).get });
    addNotice(db, 1, '사흘 전 박스', SALE_NOTICE, { postedAt: NOW_SEC - 3 * 86400 });
    addNotice(db, 2, '가격이 없는 샵 공지', '<p>점검 안내</p>', { postedAt: NOW_SEC - 3600 });
    addNotice(db, 3, '공지 분류의 박스', SALE_NOTICE, {
      postedAt: NOW_SEC - 3600,
      category: '공지',
    });
    expect(await collectKitsIfDue({ NEWS: db }, NOW + 600_000, { get: probSite([]).get })).toEqual({
      skipped: 'not due',
    });
  });
});

describe('새소식 크론과 키트', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 공식 홈페이지 흉내. 경로마다 정해 둔 화면을 돌려주고 없는 경로는 500 이다. */
  const stubSite = (pages) => {
    const asked = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const path = String(input).replace('https://mabinogi.nexon.com', '');
        asked.push(path);
        if (!(path in pages)) return new Response('', { status: 500 });
        return new Response(pages[path], {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }),
    );
    return asked;
  };

  const listRow = (id, category, title) =>
    `<li><div class="type"><p>${category}</p></div><dl><dt><a href="notice_view.asp?id=${id}">${title}</a></dt><dd>마비노기</dd></dl><p class="info_r"><span class="date">2026.10.08</span></p></li>`;
  const listPage = (rows) => `<div class="board_common01"><ul>${rows.join('')}</ul></div>`;
  const viewPage = (title, body) =>
    `<div class="board_view01"><dl><dt>${title}</dt><dd class="view_info"><p class="fr"><span class="date">2026.10.08 11:00</span></p></dd><dd class="view_cont_wrap"><div class="view_cont">${body}</div></dd><dd class="link"></dd></dl></div><!-- //view -->`;
  const EMPTY = listPage([]);
  const NO_EVENTS = '<div class="board_event"><ul></ul></div>';

  it('키트 공지(샵)를 받은 크론에서 그 키트의 확률표까지 받아 시뮬레이터 목록에 올린다', async () => {
    const db = fakeD1();
    const name = '나이트메어 판타지아 박스';
    const asked = stubSite({
      '/page/news/notice_list.asp': listPage([listRow(4893863, '샵', name)]),
      '/page/news/update_list.asp': EMPTY,
      '/page/news/event_list.asp': NO_EVENTS,
      '/page/news/notice_view.asp?id=4893863': viewPage(name, SALE_NOTICE),
      '/page/news/notice_list.asp?page=2': EMPTY,
      '/page/news/update_list.asp?page=2': EMPTY,
      '/ItemShop/prob.asp': `<ul>${kitEntry(495, name, FANTASIA)}</ul>`,
      '/ItemShop/prob.asp?seq=495': kitEntry(495, name, FANTASIA),
      ...shopPages(),
    });
    // 지금 시각에서 한 시간 안에 이미 모은 기록이 있어도 키트 공지가 왔으니 확률 화면을 읽는다.
    db.sqlite
      .prepare("INSERT INTO news_meta (key, value) VALUES ('kits_at', ?)")
      .run(String(Math.floor(Date.now() / 1000)));
    await worker.scheduled({ cron: NEWS_CRON }, { NEWS: db });

    expect(asked).toContain('/ItemShop/prob.asp?seq=495');
    const catalogRequest = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/ItemShop/item_list.asp'));
    expect(catalogRequest?.[1]).toMatchObject({
      method: 'POST',
      body: 'category_no=2302&orderby_type=0&id=',
    });
    expect((await kitById(db, 'official-495')).pricing.bundles[1]).toMatchObject({
      saleCash: 22700,
      mileageRatePercent: 3,
    });
    // 가격과 기간은 방금 받은 공지에서 왔다.
    expect(await kitIndex(db)).toMatchObject({
      current: ['official-495'],
      kits: [
        { id: 'official-495', name, price: 1200, start: '2026-10-01', end: '2026-10-14', count: 2 },
      ],
    });
  }, 60_000);

  it('키트와 상관없는 공지만 받은 크론은 한 시간 안에 확률 화면을 다시 읽지 않는다', async () => {
    const db = fakeD1();
    db.sqlite
      .prepare("INSERT INTO news_meta (key, value) VALUES ('kits_at', ?)")
      .run(String(Math.floor(Date.now() / 1000)));
    const asked = stubSite({
      '/page/news/notice_list.asp': listPage([listRow(4893864, '공지', '정기 점검 안내')]),
      '/page/news/update_list.asp': EMPTY,
      '/page/news/event_list.asp': NO_EVENTS,
      '/page/news/notice_view.asp?id=4893864': viewPage('정기 점검 안내', '<p>점검</p>'),
      '/page/news/notice_list.asp?page=2': EMPTY,
      '/page/news/update_list.asp?page=2': EMPTY,
    });
    await worker.scheduled({ cron: NEWS_CRON }, { NEWS: db });
    expect(asked.some((path) => path.includes('/ItemShop/'))).toBe(false);
  }, 60_000);
});
