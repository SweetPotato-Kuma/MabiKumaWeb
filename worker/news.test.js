// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker from './worker.js';
import {
  NEWS_CRON,
  WATCH_DAYS,
  collectNews,
  getPost,
  listEvents,
  listPosts,
  parseBoardList,
  parseEventList,
  parseKstTime,
  parseView,
} from './news.js';

/** D1 흉내. horn.test.js 와 같다. 표는 배포에 쓰는 마이그레이션 파일로 만든다. */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./migrations-news/0001_news.sql', import.meta.url), 'utf8'));
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

/** 공지사항 목록 한 줄. 공식 홈페이지의 줄 모양을 줄인 것. */
function noticeRow(id, title, { type = '공지', date = '2026.10.08', author = '조이에' } = {}) {
  return `
    <li>
      <div class="type"><p>${type}</p></div>
      <dl>
        <dt><a href="notice_view.asp?id=${id}"> ${title}&nbsp;<img src="icon_new.gif" alt=""></a></dt>
        <dd><img src='icon_gm.png' /> ${author}</dd>
      </dl>
      <p class="info_r"><span class="date">${date}</span></p>
    </li>`;
}

function updateRow(id, title, date = '2026.08.13') {
  return `
    <li>
      <div class="type"><p></p></div>
      <dl>
        <dt><a href="update_view.asp?id=${id}">${title}</a></dt>
        <dd><img src='icon_dev.png' /> 칼룬</dd>
      </dl>
      <p class="info_r"><span class="date">${date}</span></p>
    </li>`;
}

/** 목록 한 쪽. 위의 메인 배너와 고정 글 칸, 그 쪽의 글 칸. */
function listPage(pinnedRows, rows, pageMax = 667) {
  return `<html><body>
    <div class="sub_visual"><a href="/page/news/notice_view.asp?id=4889488">배너</a></div>
    <div class="board_wrap01">
      <div class="board_common01 notice"><ul>${pinnedRows.join('')}</ul></div>
      <!-- //공지 -->
      <div class="board_common01"><ul class="notice">${rows.join('')}</ul></div>
      <div id="paging" class="pageing"></div>
    </div>
    <script>var page_max = ${pageMax};</script>
  </body></html>`;
}

function viewPage(title, date, body) {
  return `<html><body><div id="div_contents" class="contents">
    <div class="board_view01">
      <dl>
        <dt>${title}</dt>
        <dd class="view_info"><p class="fr">${date ? `<span class="date">${date}</span>` : ''}</p></dd>
        <dd class="view_cont_wrap">
          <div class="view_cont">${body}</div>
        </dd>
        <dd class="link"><span class="address">https://mabinogi.nexon.com/page/news/notice_view.asp?id=1</span></dd>
      </dl>
    </div>
    <!-- //view -->
  </div></body></html>`;
}

const MISSING_PAGE = `<html><body><div class="gnb_bg_box"></div><script>alert('게시물을 찾을 수 없습니다.');history.go(-1);</script></body></html>`;
const MAINTENANCE_PAGE = '<html><body><h1>점검 중입니다</h1></body></html>';

const EVENT_PAGE = `<html><body>
  <div class="board_wrap02"><div class="board_event"><ul>
    <li class="first">
      <p class="thum"><a href="/page/news/event_view.asp?id=4893871" ><img src="https://ssl.nexon.com/listb_hangul.jpg" alt="가갸날 잔치" /></a></p>
      <dl>
        <dt><a href="/page/news/event_view.asp?id=4893871" >가갸날 잔치</a></dt>
        <dd>
          <p class="cont"><a href="/page/news/event_view.asp?id=4893871" >가갸날 세움 100돌 맞이</a></p>
          <p class="date">2026.10.08 11:30:00~2026.10.21 23:59:00</p>
        </dd>
      </dl>
    </li>
    <li>
      <p class="thum"><a href="/page/event/2026/0922_moon/index.asp" ><img src="https://ssl.nexon.com/listb_moon.jpg" alt="" /></a></p>
      <dl>
        <dt><a href="/page/event/2026/0922_moon/index.asp" >달에게 소원을 이벤트</a></dt>
        <dd>
          <p class="cont"><a href="/page/event/2026/0922_moon/index.asp" >즐거운 한가위</a></p>
          <p class="date">2026.09.22 12:00:00~2026.10.07 23:59:00</p>
        </dd>
      </dl>
    </li>
    <li>
      <p class="thum"><a href="https://connect.mabinogi.nexon.com/" ><img src="https://ssl.nexon.com/listb_connect.jpg" alt="" /></a></p>
      <dl>
        <dt><a href="https://connect.mabinogi.nexon.com/" >에린 커넥트</a></dt>
        <dd><p class="cont"><a href="https://connect.mabinogi.nexon.com/" >함께 하는 에린</a></p><p class="date">상시진행</p></dd>
      </dl>
    </li>
  </ul></div></div>
</body></html>`;

/**
 * 공식 홈페이지 흉내. pages 의 경로 -> HTML(또는 HTML 을 돌려주는 함수). 물은 경로를 calls 에 남긴다.
 * 없는 경로는 HTTP 500 으로 던진다.
 */
function fakeSite(pages) {
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    const page = pages[path];
    if (page === undefined) throw new Error(`${path}: HTTP 500`);
    return typeof page === 'function' ? page() : page;
  };
  return { get, calls };
}

/** 글 셋, 개발자 노트 하나, 이벤트 목록이 있는 첫 상태. 지난 쪽은 비어 있다. */
function basicSite() {
  return {
    '/page/news/notice_list.asp': listPage(
      [noticeRow(4893249, '마비노기 복구 서비스 개편 안내', { date: '2025.12.23' })],
      [
        noticeRow(4893864, '10/8(목) 이터니티 새로운 소식', { date: '2026.10.08' }),
        noticeRow(4893871, '가갸날 잔치', { type: '이벤트', author: '마비노기' }),
        noticeRow(4893249, '마비노기 복구 서비스 개편 안내', { date: '2025.12.23' }),
      ],
    ),
    '/page/news/notice_view.asp?id=4893864': viewPage(
      '[공지] 10/8(목) 이터니티 새로운 소식',
      '2026.10.08 11:37',
      '<p>안녕하세요.</p>',
    ),
    '/page/news/notice_view.asp?id=4893871': viewPage('가갸날 잔치', '', '<img src="bg.jpg">'),
    '/page/news/notice_view.asp?id=4893249': viewPage(
      '[공지](내용추가) 마비노기 복구 서비스 개편 안내',
      '2025.12.23 13:00',
      '<p>복구</p>',
    ),
    '/page/news/update_list.asp': listPage(
      [],
      [updateRow(4893721, '[적용됨] RE:ACTION 2차 업데이트')],
    ),
    '/page/news/update_view.asp?id=4893721': viewPage(
      '[적용됨] RE:ACTION 2차 업데이트',
      '2026.08.13 13:33',
      '<p>노트</p>',
    ),
    '/page/news/event_list.asp': EVENT_PAGE,
    '/page/news/notice_list.asp?page=2': listPage(
      [noticeRow(4893249, '마비노기 복구 서비스 개편 안내')],
      [],
    ),
    '/page/news/update_list.asp?page=2': listPage([], []),
  };
}

describe('공식 홈페이지 읽기', () => {
  it('한국 시각 날짜를 유닉스 초로 바꾼다', () => {
    expect(parseKstTime('2026.10.08 11:37')).toBe(Date.parse('2026-10-08T02:37:00Z') / 1000);
    expect(parseKstTime('2026.10.21 23:59:00')).toBe(Date.parse('2026-10-21T14:59:00Z') / 1000);
    expect(parseKstTime('2026.10.08')).toBe(Date.parse('2026-10-07T15:00:00Z') / 1000);
    expect(parseKstTime('상시진행')).toBeNull();
  });

  it('목록의 고정 글과 그 쪽의 글을 가르고, 겹치는 글은 한 번만 센다', () => {
    const { rows, hasBoard } = parseBoardList(basicSite()['/page/news/notice_list.asp'], 'notice');
    expect(hasBoard).toBe(true);
    expect(rows.map((row) => [row.id, row.pinned])).toEqual([
      [4893249, true],
      [4893864, false],
      [4893871, false],
    ]);
    expect(rows[1]).toMatchObject({
      title: '10/8(목) 이터니티 새로운 소식',
      category: '공지',
      author: '조이에',
    });
    expect(rows[2].category).toBe('이벤트');
  });

  it('개발자 노트는 분류 칸이 비어 있어도 개발자 노트로 둔다', () => {
    const { rows } = parseBoardList(basicSite()['/page/news/update_list.asp'], 'update');
    expect(rows).toEqual([
      expect.objectContaining({
        id: 4893721,
        category: '개발자 노트',
        title: '[적용됨] RE:ACTION 2차 업데이트',
      }),
    ]);
  });

  it('점검 화면처럼 목록 틀이 없으면 빈 쪽과 가른다', () => {
    expect(parseBoardList(MAINTENANCE_PAGE, 'notice').hasBoard).toBe(false);
    expect(parseBoardList(listPage([], []), 'notice')).toEqual({ rows: [], hasBoard: true });
  });

  it('글 본문은 본문 칸 안의 HTML 만 그대로 남긴다', () => {
    const view = parseView(
      viewPage('[공지] 안내', '2026.10.08 11:37', '<p style="color:red">안녕&nbsp;하세요</p>'),
    );
    expect(view).toEqual({
      title: '[공지] 안내',
      postedAt: parseKstTime('2026.10.08 11:37'),
      body: '<div class="view_cont"><p style="color:red">안녕&nbsp;하세요</p></div>',
    });
  });

  it('지워진 글과 읽을 수 없는 화면을 가른다', () => {
    expect(parseView(MISSING_PAGE)).toEqual({ missing: true });
    expect(parseView(MAINTENANCE_PAGE)).toBeNull();
  });

  it('이벤트 목록에서 그림, 기간, 글 번호를 읽는다', () => {
    const { events } = parseEventList(EVENT_PAGE);
    expect(events[0]).toEqual({
      link: 'https://mabinogi.nexon.com/page/news/event_view.asp?id=4893871',
      postId: 4893871,
      title: '가갸날 잔치',
      summary: '가갸날 세움 100돌 맞이',
      thumb: 'https://ssl.nexon.com/listb_hangul.jpg',
      period: '2026.10.08 11:30:00~2026.10.21 23:59:00',
      startsAt: parseKstTime('2026.10.08 11:30'),
      endsAt: parseKstTime('2026.10.21 23:59'),
    });
    expect(events[1]).toMatchObject({
      link: 'https://mabinogi.nexon.com/page/event/2026/0922_moon/index.asp',
      postId: null,
    });
    expect(events[2]).toMatchObject({ period: '상시진행', startsAt: null, endsAt: null });
    const guide = parseEventList(
      EVENT_PAGE.replace(
        'https://connect.mabinogi.nexon.com/',
        '/page/archive/guide_view.asp?id=4892986&num=2',
      ),
    ).events[2];
    expect(guide.postId).toBeNull();
  });
});

describe('새소식 모으기', () => {
  it('처음 보는 글은 본문을 받아 첫 판으로 넣고 지난 쪽이 비면 채우기를 끝낸다', async () => {
    const db = fakeD1();
    const site = fakeSite(basicSite());
    const summary = await collectNews({ NEWS: db }, NOW, { get: site.get });

    expect(summary).toMatchObject({ added: 4, edited: 0, events: 3, errors: [] });
    expect(summary.backfill).toEqual({ notice: 'done', update: 'done' });
    const { posts, total, backfill } = await listPosts(db);
    expect(total).toBe(4);
    expect(posts.map((post) => post.id)).toEqual([4893864, 4893871, 4893721, 4893249]);
    expect(posts[0]).toMatchObject({
      category: '공지',
      postedAt: parseKstTime('2026.10.08 11:37'),
      revisions: 1,
    });
    // 본문에 시각이 없으면 목록의 날짜를 쓴다.
    expect(posts[1].postedAt).toBe(parseKstTime('2026.10.08'));
    expect(posts.find((post) => post.id === 4893249)?.pinned).toBe(true);
    expect(backfill).toEqual({ notice: 'done', update: 'done' });

    const post = await getPost(db, 4893864);
    expect(post?.revisions).toEqual([
      expect.objectContaining({
        rev: 1,
        title: '[공지] 10/8(목) 이터니티 새로운 소식',
        seenAt: NOW_SEC,
      }),
    ]);
    expect(post?.source).toBe('https://mabinogi.nexon.com/page/news/notice_view.asp?id=4893864');
  });

  it('지켜보는 글의 본문이 바뀌면 새 판을 남기고, 같으면 다시 읽은 시각만 바꾼다', async () => {
    const db = fakeD1();
    const pages = basicSite();
    await collectNews({ NEWS: db }, NOW, { get: fakeSite(pages).get });

    pages['/page/news/notice_view.asp?id=4893864'] = viewPage(
      '[공지] 10/8(목) 이터니티 새로운 소식',
      '2026.10.08 11:37',
      '<p>안녕하세요.</p><p>(내용 추가) 일정이 바뀌었습니다.</p>',
    );
    const later = NOW + 10 * 60 * 1000;
    const site = fakeSite(pages);
    const summary = await collectNews({ NEWS: db }, later, { get: site.get });

    expect(summary.edited).toBe(1);
    // 올린 지 7일 안 된 글(셋)과 고정 글(하나)을 다시 읽는다. 8월의 개발자 노트는 읽지 않는다.
    expect(summary.rechecked).toBe(3);
    expect(site.calls).not.toContain('/page/news/update_view.asp?id=4893721');
    const post = await getPost(db, 4893864);
    expect(post?.post).toMatchObject({ revisions: 2, editedAt: later / 1000 });
    expect(post?.revisions.map((rev) => rev.rev)).toEqual([1, 2]);
    expect(post?.revisions[1].body).toContain('일정이 바뀌었습니다');

    const edited = await listPosts(db, { edited: true });
    expect(edited.posts.map((each) => each.id)).toEqual([4893864]);
  });

  it(`${WATCH_DAYS}일이 지난 글은 고정 글이 아니면 다시 읽지 않는다`, async () => {
    const db = fakeD1();
    await collectNews({ NEWS: db }, NOW, { get: fakeSite(basicSite()).get });
    const site = fakeSite(basicSite());
    await collectNews({ NEWS: db }, NOW + 8 * 86400 * 1000, { get: site.get });
    const views = site.calls.filter((path) => path.includes('_view.asp'));
    expect(views).toEqual(['/page/news/notice_view.asp?id=4893249']);
  });

  it('목록의 제목이 바뀐 글은 그 자리에서 다시 읽는다', async () => {
    const db = fakeD1();
    const pages = basicSite();
    await collectNews({ NEWS: db }, NOW, { get: fakeSite(pages).get });
    pages['/page/news/update_list.asp'] = listPage(
      [],
      [updateRow(4893721, '[적용됨] RE:ACTION 2차 업데이트 (수정)')],
    );
    pages['/page/news/update_view.asp?id=4893721'] = viewPage(
      '[적용됨] RE:ACTION 2차 업데이트 (수정)',
      '2026.08.13 13:33',
      '<p>노트</p>',
    );
    const summary = await collectNews({ NEWS: db }, NOW + 600_000, { get: fakeSite(pages).get });
    expect(summary.edited).toBe(1);
    const post = await getPost(db, 4893721);
    expect(post?.post).toMatchObject({
      title: '[적용됨] RE:ACTION 2차 업데이트 (수정)',
      revisions: 2,
    });
  });

  it('지워진 글은 지운 시각을 남기고 본문은 그대로 둔다', async () => {
    const db = fakeD1();
    const pages = basicSite();
    await collectNews({ NEWS: db }, NOW, { get: fakeSite(pages).get });
    pages['/page/news/notice_view.asp?id=4893871'] = MISSING_PAGE;
    const summary = await collectNews({ NEWS: db }, NOW + 600_000, { get: fakeSite(pages).get });
    expect(summary.deleted).toBe(1);
    const post = await getPost(db, 4893871);
    expect(post?.post.deletedAt).toBe(NOW_SEC + 600);
    expect(post?.revisions).toHaveLength(1);
  });

  it('지난 글은 둘째 쪽부터 쪽마다 이어서 채우고, 점검 화면에서는 끝내지 않는다', async () => {
    const db = fakeD1();
    const pages = basicSite();
    pages['/page/news/notice_list.asp?page=2'] = listPage(
      [noticeRow(4893249, '마비노기 복구 서비스 개편 안내')],
      [noticeRow(4880001, '옛 공지', { date: '2012.05.24' })],
    );
    pages['/page/news/notice_view.asp?id=4880001'] = viewPage(
      '[공지] 옛 공지',
      '2012.05.24 14:10',
      '<P>옛날</P>',
    );
    pages['/page/news/notice_list.asp?page=3'] = MAINTENANCE_PAGE;

    const first = await collectNews({ NEWS: db }, NOW, {
      get: fakeSite(pages).get,
      backfillPages: 3,
    });
    expect(first.backfill).toEqual({ notice: 2, update: 'done' });
    expect(first.errors).toEqual(['backfill notice: 3쪽에 목록 틀이 없습니다.']);
    expect((await getPost(db, 4880001))?.post.postedAt).toBe(parseKstTime('2012.05.24 14:10'));

    pages['/page/news/notice_list.asp?page=3'] = listPage([], []);
    const second = await collectNews({ NEWS: db }, NOW + 600_000, {
      get: fakeSite(pages).get,
      backfillPages: 5,
    });
    expect(second.backfill).toEqual({ notice: 'done' });
    expect((await listPosts(db)).backfill).toEqual({ notice: 'done', update: 'done' });
  });

  it('한 단계가 막혀도 다음 단계는 간다', async () => {
    const db = fakeD1();
    const pages = basicSite();
    delete pages['/page/news/notice_list.asp'];
    const summary = await collectNews({ NEWS: db }, NOW, { get: fakeSite(pages).get });
    expect(summary.errors[0]).toContain('notice');
    expect(summary.events).toBe(3);
    expect((await listPosts(db)).posts.map((post) => post.id)).toEqual([4893721]);
    expect(await listPosts(db)).toMatchObject({
      collectedAt: null,
      attemptedAt: NOW_SEC,
      failedSteps: ['notice'],
    });
  });

  it('한 쪽씩 수집해도 두 게시판을 번갈아 진행한다', async () => {
    const db = fakeD1();
    const pages = basicSite();
    pages['/page/news/notice_list.asp?page=2'] = listPage([], [noticeRow(4880001, '옛 공지')]);
    pages['/page/news/notice_view.asp?id=4880001'] = viewPage(
      '옛 공지',
      '2012.05.24 14:10',
      '<p>공지</p>',
    );
    pages['/page/news/update_list.asp?page=2'] = listPage(
      [],
      [updateRow(4880002, '옛 개발자 노트')],
    );
    pages['/page/news/update_view.asp?id=4880002'] = viewPage(
      '옛 개발자 노트',
      '2012.05.24 14:10',
      '<p>노트</p>',
    );
    expect(
      (await collectNews({ NEWS: db }, NOW, { get: fakeSite(pages).get, backfillPages: 1 }))
        .backfill,
    ).toEqual({ notice: 2 });
    expect(
      (
        await collectNews({ NEWS: db }, NOW + 600_000, {
          get: fakeSite(pages).get,
          backfillPages: 1,
        })
      ).backfill,
    ).toEqual({ update: 2 });
  });

  it('실패한 실행은 성공 시각을 보존하고 다음 성공에서 실패 표시를 지운다', async () => {
    const db = fakeD1();
    const pages = basicSite();
    await collectNews({ NEWS: db }, NOW, { get: fakeSite(pages).get });
    const good = pages['/page/news/notice_list.asp'];
    pages['/page/news/notice_list.asp'] = MAINTENANCE_PAGE;
    await collectNews({ NEWS: db }, NOW + 600_000, { get: fakeSite(pages).get });
    expect(await listPosts(db)).toMatchObject({
      collectedAt: NOW_SEC,
      attemptedAt: NOW_SEC + 600,
      failedSteps: ['notice'],
    });
    pages['/page/news/notice_list.asp'] = good;
    await collectNews({ NEWS: db }, NOW + 1200_000, { get: fakeSite(pages).get });
    expect(await listPosts(db)).toMatchObject({ collectedAt: NOW_SEC + 1200, failedSteps: [] });
  });

  it('진행 중인 이벤트만 새것부터, 상시진행은 뒤에 두고 받아 둔 글과 잇는다', async () => {
    const db = fakeD1();
    await collectNews({ NEWS: db }, NOW, { get: fakeSite(basicSite()).get });
    const { events } = await listEvents(db, NOW);
    // 달에게 소원을 은 10/7 에 끝났다.
    expect(events.map((event) => [event.title, event.postId])).toEqual([
      ['가갸날 잔치', 4893871],
      ['에린 커넥트', null],
    ]);
  });

  it('이벤트 목록에서 빠진 이벤트는 끝난 것으로 본다', async () => {
    const db = fakeD1();
    const pages = basicSite();
    await collectNews({ NEWS: db }, NOW, { get: fakeSite(pages).get });
    pages['/page/news/event_list.asp'] = EVENT_PAGE.replace(
      /<li>\s*<p class="thum"><a href="https:\/\/connect[\s\S]*?<\/li>/,
      '',
    );
    await collectNews({ NEWS: db }, NOW + 600_000, { get: fakeSite(pages).get });
    const { events } = await listEvents(db, NOW + 600_000);
    expect(events.map((event) => event.title)).toEqual(['가갸날 잔치']);
  });
});

describe('새소식 찾기', () => {
  it('분류와 제목으로 거르고 쪽을 나눈다', async () => {
    const db = fakeD1();
    await collectNews({ NEWS: db }, NOW, { get: fakeSite(basicSite()).get });
    expect((await listPosts(db, { category: '이벤트' })).posts.map((post) => post.id)).toEqual([
      4893871,
    ]);
    expect((await listPosts(db, { category: '개발자 노트' })).total).toBe(1);
    expect((await listPosts(db, { q: '이터니티' })).posts.map((post) => post.id)).toEqual([
      4893864,
    ]);
    // % 와 _ 는 글자 그대로 찾는다.
    expect((await listPosts(db, { q: '%' })).total).toBe(0);
    expect((await listPosts(db, { page: 2 })).posts).toEqual([]);
  });

  it('워커가 목록, 글, 이벤트 경로를 열어 두고 모으기는 운영자만 부른다', async () => {
    const db = fakeD1();
    await collectNews({ NEWS: db }, NOW, { get: fakeSite(basicSite()).get });
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

    const list = await call('/news/list?category=공지&page=1');
    expect(list.status).toBe(200);
    expect((await list.json()).posts.map((post) => post.id)).toEqual([4893864, 4893249]);

    const post = await call('/news/post?id=4893864');
    expect((await post.json()).revisions).toHaveLength(1);
    expect((await call('/news/post?id=1')).status).toBe(404);
    expect((await call('/news/post?id=abc')).status).toBe(400);
    expect((await (await call('/news/events')).json()).events.length).toBeGreaterThan(0);

    expect((await call('/news/collect', { method: 'POST' })).status).toBe(401);
    expect((await call('/news/list', { method: 'POST' })).status).toBe(405);
  });

  it('새소식 크론은 공식 홈페이지에만 묻는다', async () => {
    const db = fakeD1();
    const originalFetch = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (input) => {
      asked.push(String(input));
      return new Response(MAINTENANCE_PAGE, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };
    try {
      await worker.scheduled({ cron: NEWS_CRON }, { NEWS: db });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((url) => url.startsWith('https://mabinogi.nexon.com/'))).toBe(true);
  }, 30_000);
});

describe('키트 공지 표시', () => {
  it('샵과 이벤트 글이 새로 오거나 고쳐지면 세고, 공지와 지난 글 채우기는 세지 않는다', async () => {
    const db = fakeD1();
    const pages = basicSite();
    // 둘째 쪽(지난 글 채우기)에 옛 샵 글이 있어도 키트 기록을 다시 읽을 까닭이 아니다.
    pages['/page/news/notice_list.asp?page=2'] = listPage(
      [noticeRow(4893249, '마비노기 복구 서비스 개편 안내')],
      [noticeRow(4880002, '옛 샵 상자', { type: '샵', date: '2012.05.24' })],
    );
    pages['/page/news/notice_view.asp?id=4880002'] = viewPage(
      '[샵] 옛 샵 상자',
      '2012.05.24 14:10',
      '<p>옛 상자</p>',
    );

    // basicSite 의 새 글은 공지 둘과 이벤트(가갸날 잔치) 하나다.
    const first = await collectNews({ NEWS: db }, NOW, { get: fakeSite(pages).get });
    expect(first.added).toBe(5);
    expect(first.kitNotices).toBe(1);
    expect((await getPost(db, 4880002))?.post.category).toBe('샵');

    const quiet = await collectNews({ NEWS: db }, NOW + 600_000, { get: fakeSite(pages).get });
    expect(quiet.kitNotices).toBe(0);

    // 공지 글을 고치는 것은 세지 않고, 이벤트 글을 고치는 것은 센다.
    pages['/page/news/notice_view.asp?id=4893864'] = viewPage(
      '[공지] 10/8(목) 이터니티 새로운 소식',
      '2026.10.08 11:37',
      '<p>고쳤다</p>',
    );
    const noticeEdit = await collectNews({ NEWS: db }, NOW + 1_200_000, {
      get: fakeSite(pages).get,
    });
    expect(noticeEdit).toMatchObject({ edited: 1, kitNotices: 0 });

    pages['/page/news/notice_view.asp?id=4893871'] = viewPage(
      '가갸날 잔치',
      '',
      '<img src="bg2.jpg">',
    );
    const eventEdit = await collectNews({ NEWS: db }, NOW + 1_800_000, {
      get: fakeSite(pages).get,
    });
    expect(eventEdit).toMatchObject({ edited: 1, kitNotices: 1 });
  });
});
