// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { collectNews } from './news.js';
import {
  MAX_ATTEMPTS,
  findPreview,
  importPreviews,
  indexPreviews,
  mirrorPreviews,
  parseGallery,
  previewKey,
  rebuildPreviews,
  splitNames,
} from './previews.js';

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

/** R2 흉내. */
function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes, options) {
      objects.set(key, { bytes, options });
    },
  };
}

const NOW = Date.parse('2026-10-08T06:00:00.000Z');
const BASE = 'https://ssl.nexon.com/s2/game/mabinogi/mabiweb/event/2026/1001_nightmare';
const VOD = 'https://mabinogi.vod.nexoncdn.co.kr/mabinogi_shop/2026/1001_nightmare';

const panel = (n, media) =>
  `<div class="img_g g_${n}">${media}<span><span><span class="txt">&nbsp;</span></span></span></div>`;
const image = (url) => `<img alt="" src="${url}" />`;
const row = (label) =>
  `<li><a href="#"><span class="t"><span><span class="txt">${label}</span></span></span></a></li>`;

/** 키트 글의 갤러리. 스타일 시트에도 img_g_list 가 나오는 것까지 같다. */
function gallery({ labels, panels, style = true }) {
  return `${style ? '<style>.img_g_list{margin:0}.img_g_list li{width:20%}</style>' : ''}
    <div style="background:#000"><!-- 갤러리 -->${panels.join('\n')}
    <!-- 리스트 -->
    <ul class="img_g_list">${labels.map(row).join('')}</ul></div>`;
}

const KIT_BODY = gallery({
  labels: [
    '스페셜 나이트메어 판타지아 웨어(남성용)',
    '나이트메어 판타지아 가발(남성용)',
    '나이트메어 판타지아 글러브(남성용), 나이트메어 판타지아 글러브(여성용)',
    '그림이 없는 줄',
  ],
  panels: [
    panel(
      1,
      `<video loop="" muted="" playsinline="" poster="${BASE}/poster_1.jpg" src="${VOD}/1.mp4">&nbsp;</video>`,
    ),
    panel(2, `${image(`${BASE}/2.jpg`)} `),
    panel(3, image(`http://ssl.nexon.com/old/3.jpg`)),
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('갤러리 읽기', () => {
  it('N 번째 이름 줄을 N 번째 칸의 그림이나 영상에 잇고, 이름 둘이 묶인 줄은 둘 다 담는다', () => {
    expect(parseGallery(KIT_BODY)).toEqual([
      { name: '스페셜 나이트메어 판타지아 웨어(남성용)', kind: 'video', src: `${VOD}/1.mp4` },
      { name: '나이트메어 판타지아 가발(남성용)', kind: 'image', src: `${BASE}/2.jpg` },
      {
        name: '나이트메어 판타지아 글러브(남성용)',
        kind: 'image',
        src: 'https://ssl.nexon.com/old/3.jpg',
      },
      {
        name: '나이트메어 판타지아 글러브(여성용)',
        kind: 'image',
        src: 'https://ssl.nexon.com/old/3.jpg',
      },
    ]);
  });

  it('목록이 여럿이면 번호를 이어서 센다', () => {
    const body = `${panel(1, image(`${BASE}/1.jpg`))}${panel(2, image(`${BASE}/2.jpg`))}
      <ul class="img_g_list">${row('가')}</ul><ul class="img_g_list">${row('나')}</ul>`;
    expect(parseGallery(body).map((item) => [item.name, item.src.slice(-5)])).toEqual([
      ['가', '1.jpg'],
      ['나', '2.jpg'],
    ]);
  });

  it('갤러리가 없는 글과 글자뿐인 줄은 아무것도 담지 않는다', () => {
    expect(parseGallery('<p>공지</p>')).toEqual([]);
    expect(parseGallery('<style>.img_g_list{}</style><p>공지</p>')).toEqual([]);
    expect(parseGallery(null)).toEqual([]);
  });

  it('찾는 열쇠는 말머리와 겹공백을 없앤다', () => {
    expect(previewKey('[트렌드]  스페셜 위치   햇')).toBe('스페셜 위치 햇');
    expect(previewKey('스페셜 위치 햇')).toBe('스페셜 위치 햇');
    expect(splitNames('A(남성용), B(여성용)')).toEqual(['A(남성용)', 'B(여성용)']);
    expect(splitNames('쉼표,붙은이름')).toEqual(['쉼표,붙은이름']);
    expect(splitNames('얼굴 장식 슬롯 전용 아이템(귀걸이, 마스크)')).toEqual([
      '얼굴 장식 슬롯 전용 아이템(귀걸이, 마스크)',
    ]);
    expect(splitNames('가(a, b), 나(c)')).toEqual(['가(a, b)', '나(c)']);
    expect(splitNames('  ')).toEqual([]);
  });
});

describe('색인', () => {
  const post = (extra = {}) => ({
    postId: 1,
    title: '나이트메어 판타지아 박스',
    postedAt: 1000,
    body: KIT_BODY,
    ...extra,
  });

  it('이름마다 한 줄씩 담고, 더 최근 글이 같은 이름을 덮고, 더 오래된 글은 덮지 못한다', async () => {
    const db = fakeD1();
    expect(await indexPreviews(db, post())).toBe(4);
    expect(
      await indexPreviews(db, {
        postId: 2,
        title: '다시 파는 박스',
        postedAt: 2000,
        body: gallery({
          labels: ['나이트메어 판타지아 가발(남성용)'],
          panels: [panel(1, image('https://ssl.nexon.com/new/2.jpg'))],
        }),
      }),
    ).toBe(1);
    const found = await findPreview(db, '나이트메어 판타지아 가발(남성용)');
    expect(found).toMatchObject({
      postId: 2,
      title: '다시 파는 박스',
      url: 'https://ssl.nexon.com/new/2.jpg',
    });

    await indexPreviews(db, post({ postId: 3, postedAt: 500 }));
    expect((await findPreview(db, '나이트메어 판타지아 가발(남성용)'))?.postId).toBe(2);
  });

  it('주소가 같으면 사본 표시를 지키고 달라지면 지워 다시 만든다', async () => {
    const db = fakeD1();
    await indexPreviews(db, post());
    db.sqlite.prepare(`UPDATE item_previews SET mirror = 'previews/a.jpg', attempts = 2`).run();
    await indexPreviews(db, post({ postedAt: 1500 }));
    expect(
      db.sqlite.prepare('SELECT mirror, attempts FROM item_previews WHERE kind = ?').get('image'),
    ).toEqual({ mirror: 'previews/a.jpg', attempts: 2 });

    const changed = KIT_BODY.replace(`${BASE}/2.jpg`, `${BASE}/2-new.jpg`);
    await indexPreviews(db, post({ postedAt: 1600, body: changed }));
    expect(
      db.sqlite
        .prepare('SELECT mirror, attempts FROM item_previews WHERE key = ?')
        .get('나이트메어 판타지아 가발(남성용)'),
    ).toEqual({ mirror: null, attempts: 0 });
  });

  it('조회는 말머리가 붙은 이름도 찾고, 사본이 있으면 사본 주소를 돌려준다', async () => {
    const db = fakeD1();
    await indexPreviews(db, post());
    expect((await findPreview(db, '[트렌드] 나이트메어 판타지아 가발(남성용)'))?.kind).toBe(
      'image',
    );
    db.sqlite
      .prepare(`UPDATE item_previews SET mirror = 'previews/abc.jpg' WHERE kind = 'image'`)
      .run();
    expect(
      (await findPreview(db, '나이트메어 판타지아 가발(남성용)', 'https://icons.example/'))?.url,
    ).toBe('https://icons.example/previews/abc.jpg');
    expect(
      (await findPreview(db, '스페셜 나이트메어 판타지아 웨어(남성용)', 'https://icons.example'))
        ?.url,
    ).toBe(`${VOD}/1.mp4`);
    expect(await findPreview(db, '없는 아이템')).toBeNull();
  });

  it('다시 훑기는 갤러리가 있는 글만 번호 순으로 이어서 색인한다', async () => {
    const db = fakeD1();
    const add = db.sqlite.prepare(
      `INSERT INTO news_posts (id, board, category, title, posted_at, first_seen, checked_at, revisions, body_hash) VALUES (?, 'notice', '샵', ?, ?, 0, 0, 1, 'h')`,
    );
    const rev = db.sqlite.prepare(
      `INSERT INTO news_revisions (post_id, rev, title, body, hash, seen_at) VALUES (?, 1, ?, ?, 'h', 0)`,
    );
    for (let id = 1; id <= 11; id += 1) {
      add.run(id, `글 ${id}`, 1000 + id);
      rev.run(
        id,
        `글 ${id}`,
        id % 2
          ? gallery({ labels: [`아이템 ${id}`], panels: [panel(1, image(`${BASE}/${id}.jpg`))] })
          : '<p>공지</p>',
      );
    }
    const first = await rebuildPreviews(db, 0);
    expect(first).toEqual({ posts: 6, indexed: 6, next: null });
    expect((await findPreview(db, '아이템 11'))?.url).toBe(`${BASE}/11.jpg`);
  });
});

describe('그림 사본', () => {
  const setup = async () => {
    const db = fakeD1();
    const ICONS = fakeR2();
    await indexPreviews(db, { postId: 1, title: '박스', postedAt: 1000, body: KIT_BODY });
    return { db, ICONS, env: { NEWS: db, ICONS } };
  };
  const stubFetch = (handler) => {
    const asked = [];
    vi.stubGlobal('fetch', async (url) => {
      asked.push(String(url));
      return handler(String(url));
    });
    return asked;
  };
  const jpeg = () =>
    new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
  const noWait = { gapMs: 0, wait: async () => undefined };

  it('그림만 R2 에 올리고 영상은 건드리지 않으며, 같은 주소는 한 번만 받는다', async () => {
    const { db, ICONS, env } = await setup();
    const asked = stubFetch(jpeg);
    const result = await mirrorPreviews(env, { limit: 10, ...noWait });
    expect(result).toEqual({ tried: 2, mirrored: 2, failed: 0, left: 0 });
    // 글러브 남성용과 여성용은 같은 그림이다.
    expect(asked).toEqual([`${BASE}/2.jpg`, 'https://ssl.nexon.com/old/3.jpg']);
    expect(ICONS.objects.size).toBe(2);
    const [key, object] = [...ICONS.objects][0];
    expect(key).toMatch(/^previews\/[0-9a-f]{24}\.jpg$/);
    expect(object.options.httpMetadata.contentType).toBe('image/jpeg');
    expect(
      db.sqlite
        .prepare(
          `SELECT COUNT(*) AS n FROM item_previews WHERE kind = 'video' AND mirror IS NOT NULL`,
        )
        .get().n,
    ).toBe(0);
  });

  it('받지 못한 그림은 횟수를 올리고, 세 번 실패하면 그만둔다', async () => {
    const { db, env } = await setup();
    stubFetch(() => new Response('gone', { status: 404 }));
    for (let run = 1; run <= MAX_ATTEMPTS; run += 1) {
      const result = await mirrorPreviews(env, { limit: 10, ...noWait });
      // 글러브 남성용과 여성용은 같은 주소라 한 번으로 센다.
      expect(result).toMatchObject({ tried: 2, failed: 2 });
    }
    expect(await mirrorPreviews(env, { limit: 10, ...noWait })).toEqual({
      tried: 0,
      mirrored: 0,
      failed: 0,
      left: 0,
    });
    // 사본이 없어도 공식 주소로 보여 준다.
    expect(
      (await findPreview(db, '나이트메어 판타지아 가발(남성용)', 'https://icons.example'))?.url,
    ).toBe(`${BASE}/2.jpg`);
  });

  it('이미지가 아닌 응답은 사본으로 두지 않는다', async () => {
    const { ICONS, env } = await setup();
    stubFetch(
      () => new Response('<html>점검</html>', { headers: { 'content-type': 'text/html' } }),
    );
    const result = await mirrorPreviews(env, { limit: 10, ...noWait });
    expect(result.mirrored).toBe(0);
    expect(ICONS.objects.size).toBe(0);
  });

  it('바인딩이 없으면 건너뛴다', async () => {
    expect(await mirrorPreviews({ NEWS: fakeD1() })).toEqual({
      skipped: 'NEWS 나 ICONS 바인딩이 없습니다.',
    });
  });
});

describe('옛 글에서 잘라 낸 그림 올리기', () => {
  const item = (name, file) => ({
    name,
    file,
    src: 'https://file.example/old.jpg#panel-1',
    postId: 4888517,
    title: '엘레노아 뉴룩 박스 판매 안내',
    postedAt: 1604544000,
  });

  it('그림 사본이 있는 항목으로 올라가고 공개 조회가 R2 주소를 준다', async () => {
    const db = fakeD1();
    const result = await importPreviews(db, {
      items: [item('엘레노아 뉴룩 날개', 'a.webp'), item('[트렌드] 엘레노아 뉴룩 수트', 'b.webp')],
    });
    expect(result).toEqual({ received: 2, added: 2 });
    expect(await findPreview(db, '엘레노아 뉴룩 날개', 'https://icons.example')).toEqual({
      name: '엘레노아 뉴룩 날개',
      kind: 'image',
      url: 'https://icons.example/a.webp',
      postId: 4888517,
      title: '엘레노아 뉴룩 박스 판매 안내',
    });
    expect((await findPreview(db, '엘레노아 뉴룩 수트', 'https://icons.example'))?.url).toBe(
      'https://icons.example/b.webp',
    );
  });

  it('이미 있는 이름은 건드리지 않는다', async () => {
    const db = fakeD1();
    await importPreviews(db, { items: [item('엘레노아 뉴룩 날개', 'a.webp')] });
    const again = await importPreviews(db, {
      items: [item('엘레노아 뉴룩 날개', 'other.webp'), item('목화 가지', 'c.webp')],
    });
    expect(again).toEqual({ received: 2, added: 1 });
    expect((await findPreview(db, '엘레노아 뉴룩 날개', 'https://icons.example'))?.url).toBe(
      'https://icons.example/a.webp',
    );
  });

  it('모양이 맞지 않으면 하나도 올리지 않는다', async () => {
    const db = fakeD1();
    await expect(
      importPreviews(db, { items: [item('좋은 이름', 'a.webp'), item('나쁜 파일', '../x')] }),
    ).rejects.toThrow('나쁜 파일');
    await expect(importPreviews(db, { items: [] })).rejects.toThrow('items');
    expect(await findPreview(db, '좋은 이름')).toBeNull();
  });
});

describe('새소식 받기와 경로', () => {
  /** 공식 홈페이지 흉내. 목록 한 줄과 갤러리가 있는 본문 하나. */
  const site = (body) => ({
    '/page/news/notice_list.asp': `<div class="board_common01"><ul><li><div class="type"><p>샵</p></div><dl><dt><a href="notice_view.asp?id=4893863">나이트메어 판타지아 박스</a></dt><dd>마비노기</dd></dl><p class="info_r"><span class="date">2026.10.07</span></p></li></ul></div>`,
    '/page/news/update_list.asp': '<div class="board_common01"><ul></ul></div>',
    '/page/news/event_list.asp': '<div class="board_event"><ul></ul></div>',
    '/page/main/index.asp':
      '<ul class="rolling"><li><div class="vis01" banner_id="4893871"><a href="/page/news/event_view.asp?id=4893871" target=""><img class="lazy" src="blit.gif" data-src="https://ssl.nexon.com/mainb.jpg" alt=""></a></div></li></ul><div class="banner_list"><ul><li><a href="/page/news/event_view.asp?id=4893871" target="">[이벤트]가갸날 잔치</a></li></ul></div>',
    '/page/news/notice_view.asp?id=4893863': `<div class="board_view01"><dl><dt>나이트메어 판타지아 박스</dt><dd class="view_info"><p class="fr"><span class="date">2026.10.07 11:00</span></p></dd><dd class="view_cont_wrap"><div class="view_cont">${body}</div></dd><dd class="link"></dd></dl></div><!-- //view -->`,
    '/page/news/notice_list.asp?page=2': '<div class="board_common01"><ul></ul></div>',
    '/page/news/update_list.asp?page=2': '<div class="board_common01"><ul></ul></div>',
  });
  const getFrom = (pages) => async (path) => {
    if (!(path in pages)) throw new Error(`${path}: HTTP 500`);
    return pages[path];
  };

  it('새 글을 받을 때 갤러리를 색인하고, 고친 글은 새 그림으로 바꾼다', async () => {
    const db = fakeD1();
    const pages = site(KIT_BODY);
    await collectNews({ NEWS: db }, NOW, { get: getFrom(pages) });
    expect((await findPreview(db, '나이트메어 판타지아 가발(남성용)'))?.url).toBe(`${BASE}/2.jpg`);

    pages['/page/news/notice_view.asp?id=4893863'] = site(
      KIT_BODY.replace(`${BASE}/2.jpg`, `${BASE}/2-fixed.jpg`),
    )['/page/news/notice_view.asp?id=4893863'];
    await collectNews({ NEWS: db }, NOW + 600_000, { get: getFrom(pages) });
    expect((await findPreview(db, '나이트메어 판타지아 가발(남성용)'))?.url).toBe(
      `${BASE}/2-fixed.jpg`,
    );
  });

  it('색인이 실패해도 글 받기는 이어 간다', async () => {
    const db = fakeD1();
    db.sqlite.exec('DROP TABLE item_previews');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const summary = await collectNews({ NEWS: db }, NOW, { get: getFrom(site(KIT_BODY)) });
    expect(summary.added).toBe(1);
    expect(summary.errors).toEqual([]);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('공개 조회는 이름으로 찾고, 다시 훑기와 사본 만들기는 운영자만 부른다', async () => {
    const db = fakeD1();
    const ICONS = fakeR2();
    await indexPreviews(db, { postId: 1, title: '박스', postedAt: 1000, body: KIT_BODY });
    const env = {
      NEWS: db,
      ICONS,
      ICON_BASE_URL: 'https://icons.example',
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

    const hit = await call(
      `/news/preview?name=${encodeURIComponent('스페셜 나이트메어 판타지아 웨어(남성용)')}`,
    );
    expect(await hit.json()).toMatchObject({
      kind: 'video',
      url: `${VOD}/1.mp4`,
      postId: 1,
      title: '박스',
    });
    expect((await call('/news/preview?name=없는%20아이템')).status).toBe(404);
    expect((await call('/news/preview')).status).toBe(400);
    expect((await call('/news/preview?name=x', { method: 'POST' })).status).toBe(405);

    expect((await call('/news/previews/rebuild', { method: 'POST' })).status).toBe(401);
    expect((await call('/news/previews/mirror', { method: 'POST' })).status).toBe(401);
    expect((await call('/news/previews/import', { method: 'POST', body: '{}' })).status).toBe(401);
    const admin = { 'x-mabikuma-admin-key': 'secret' };
    expect(
      await (
        await call('/news/previews/rebuild?after=0', { method: 'POST', headers: admin })
      ).json(),
    ).toEqual({ posts: 0, indexed: 0, next: null });
    expect((await call('/news/previews/rebuild', { method: 'GET', headers: admin })).status).toBe(
      405,
    );
  });
});
