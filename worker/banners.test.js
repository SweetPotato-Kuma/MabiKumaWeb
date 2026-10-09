// @vitest-environment node
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker from './worker.js';
import { collectBanners, listBanners, parseMainBanners } from './banners.js';

/** D1 흉내. news.test.js 와 같다. 표는 배포에 쓰는 마이그레이션 파일로 만든다. */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_news.sql', '0004_banners.sql'])
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

const IMG = 'https://ssl.nexon.com/s2/game/mabinogi/MabiWeb/event/2026';

/** 공식 메인의 배너 부분을 줄인 것. 흐르는 배너 목록(rolling)과 옆의 제목 목록(banner_list)이 따로 있다. */
const slide = (id, href, image) => `
  <li><div class="vis01" style="display:none" banner_id="${id}"><a href="${href}" target="" data-a2s-code="main_banner_click" data-a2s-id="${id}"><img class="lazy" src="https://ssl.nexon.com/blit_gray.gif" data-src="${image}" alt=""></a></div></li>`;
const label = (href, text) => `
  <li><a href="${href}" target="">${text}</a></li>`;

const MAIN_PAGE = `<html><body>
  <ul class="rolling">
    ${slide('4893871', '/page/news/event_view.asp?id=4893871', `${IMG}/1008_hangul/mainb_hangul.jpg`)}
    ${slide('4893844', '/page/event/2026/0922_moon/index.asp', `${IMG}/0922_moon/mainb_moon.jpg`)}
    ${slide('4892915', 'https://connect.mabinogi.nexon.com/', 'http://ssl.nexon.com/connect/mainb_connect.jpg')}
    ${slide('4890316', '/page/archive/guide_view.asp?id=4892986&num=2', `${IMG}/seal/mainb_seal.jpg`)}
  </ul>
  <div class="banner_list_wrap"><div class="banner_list"><ul>
    ${label('/page/news/event_view.asp?id=4893871', '[이벤트]가갸날 잔치')}
    ${label('/page/event/2026/0922_moon/index.asp', '[업데이트]달에게 소원을 이벤트')}
    ${label('https://connect.mabinogi.nexon.com/', '[업데이트]에린 커넥트')}
  </ul><a href="javascript:void(0);" class="btn_close_bn_list">닫기</a></div></div>
</body></html>`;

describe('메인 배너 읽기', () => {
  it('배너를 보이는 순서대로 읽고 옆 목록에서 말머리와 제목을 붙인다', () => {
    const banners = parseMainBanners(MAIN_PAGE);
    expect(banners.map((banner) => [banner.id, banner.kind, banner.title])).toEqual([
      ['4893871', '이벤트', '가갸날 잔치'],
      ['4893844', '업데이트', '달에게 소원을 이벤트'],
      ['4892915', '업데이트', '에린 커넥트'],
      ['4890316', null, ''],
    ]);
    expect(banners[0]).toMatchObject({
      href: 'https://mabinogi.nexon.com/page/news/event_view.asp?id=4893871',
      image: `${IMG}/1008_hangul/mainb_hangul.jpg`,
    });
  });

  it('상대 주소는 공식 주소로 바꾸고 http 그림은 https 로 올린다', () => {
    const banners = parseMainBanners(MAIN_PAGE);
    expect(banners[1].href).toBe('https://mabinogi.nexon.com/page/event/2026/0922_moon/index.asp');
    expect(banners[2].href).toBe('https://connect.mabinogi.nexon.com/');
    expect(banners[2].image).toBe('https://ssl.nexon.com/connect/mainb_connect.jpg');
    expect(banners[3].href).toBe(
      'https://mabinogi.nexon.com/page/archive/guide_view.asp?id=4892986&num=2',
    );
  });

  it('배너 목록이 없는 화면(점검, 홍보 화면)은 빈 목록이다', () => {
    expect(parseMainBanners('<html><body>점검 중입니다</body></html>')).toEqual([]);
    expect(parseMainBanners(null)).toEqual([]);
  });
});

describe('배너 모으기와 목록', () => {
  const NOW = 1_790_000_000;

  it('목록을 통째로 바꾸고, 못 읽으면 앞 목록을 그대로 둔다', async () => {
    const db = fakeD1();
    expect(await collectBanners(db, async () => MAIN_PAGE, NOW)).toBe(4);
    expect((await listBanners(db)).banners.map((banner) => banner.id)).toEqual([
      '4893871',
      '4893844',
      '4892915',
      '4890316',
    ]);

    const fewer = MAIN_PAGE.replace(
      slide('4893844', '/page/event/2026/0922_moon/index.asp', `${IMG}/0922_moon/mainb_moon.jpg`),
      '',
    );
    await collectBanners(db, async () => fewer, NOW + 600);
    expect((await listBanners(db)).banners).toHaveLength(3);

    await expect(
      collectBanners(db, async () => '<html>점검 중</html>', NOW + 1200),
    ).rejects.toThrow('배너를 읽지');
    const kept = await listBanners(db);
    expect(kept.banners).toHaveLength(3);
    expect(kept.updatedAt).toBe(NOW + 600);
  });

  it('받아 둔 새소식 글로 가는 배너만 postId 를 달고, 제목이 없으면 그 글의 제목을 쓴다', async () => {
    const db = fakeD1();
    db.sqlite
      .prepare(
        `INSERT INTO news_posts (id, board, category, title, posted_at, first_seen, checked_at, revisions, body_hash)
         VALUES (4893871, 'notice', '이벤트', '가갸날 잔치', 1, 0, 0, 1, 'h'), (4892986, 'notice', '공지', '모험가의 인장 상점 리뉴얼', 1, 0, 0, 1, 'h')`,
      )
      .run();
    await collectBanners(db, async () => MAIN_PAGE, NOW);
    const { banners } = await listBanners(db);
    expect(banners[0]).toMatchObject({ postId: 4893871, title: '가갸날 잔치', kind: '이벤트' });
    // 이벤트 페이지와 외부 주소는 공식 주소로 보낸다.
    expect(banners[1]).toMatchObject({
      postId: null,
      link: 'https://mabinogi.nexon.com/page/event/2026/0922_moon/index.asp',
    });
    expect(banners[2]).toMatchObject({ postId: null, link: 'https://connect.mabinogi.nexon.com/' });
    // guide_view 는 새소식 글이 아니라서 받아 둔 제목을 끌어오지 않는다.
    expect(banners[3]).toMatchObject({ postId: null, title: '' });
  });

  it('GET /news/banners 로 읽고 다른 방식은 거절한다', async () => {
    const db = fakeD1();
    await collectBanners(db, async () => MAIN_PAGE, NOW);
    const env = { NEWS: db, ALLOWED_ORIGINS: 'https://mabi.spkuma.com' };
    const call = (method) =>
      worker.fetch(
        new Request('https://api.example/news/banners', {
          method,
          headers: { Origin: 'https://mabi.spkuma.com' },
        }),
        env,
      );
    const ok = await call('GET');
    expect(ok.status).toBe(200);
    expect((await ok.json()).banners).toHaveLength(4);
    expect((await call('POST')).status).toBe(405);
  });
});
