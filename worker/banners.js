/**
 * 공식 홈페이지 메인 화면의 이벤트 배너.
 *
 * 공식 메인은 1920x580 큰 그림 열 장 안팎을 페이드로 넘긴다. 그 목록(순서, 그림, 링크, 제목)을 새소식 크론이 10분마다
 * 읽어 main_banners 표에 통째로 바꿔 둔다. 첫 화면의 배너가 이걸 그대로 넘긴다.
 *
 *   - 메인은 쿠키(introMovie=1)가 없으면 이벤트 홍보 화면으로 넘기므로, nexonPageClient 가 그 쿠키를 같이 보낸다.
 *   - 그림은 배너마다 150KB~1.2MB 라 사본을 두지 않고 공식 주소 그대로 쓴다. 내려가면 다음 수집에서 목록이 바뀐다.
 *   - 메인 구조가 바뀌어 배너를 하나도 못 읽으면 오류를 내고 앞 목록을 그대로 둔다.
 *
 * 표는 migrations-news/0004_banners.sql 에 있다.
 */

import { rateLimited, withEdgeCache } from './market.js';

export const BANNERS_PATH = '/news/banners';
export const MAIN_PATH = '/page/main/index.asp';

const SITE = 'https://mabinogi.nexon.com';
const CACHE_SECONDS = 120;

const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', amp: '&' };

function decode(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function absolute(href) {
  try {
    const url = new URL(decode(href).trim(), SITE);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * 메인 화면에서 [{ id, href, image, kind, title }] 를 순서대로 뽑는다. 말머리와 제목은 옆의 배너 목록에서 같은 링크를
 * 가진 줄의 "[이벤트]가갸날 잔치" 에서 읽는다. 그림이나 링크를 못 읽은 칸은 건너뛴다.
 */
export function parseMainBanners(html) {
  const page = String(html ?? '');
  const start = page.indexOf('<ul class="rolling">');
  if (start < 0) return [];
  const rolling = page.slice(start, page.indexOf('</ul>', start));

  const labels = new Map();
  const listAt = page.indexOf('class="banner_list"');
  if (listAt >= 0) {
    const list = page.slice(listAt, page.indexOf('</ul>', listAt));
    for (const match of list.matchAll(/<li><a href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/li>/g)) {
      const text = decode(match[2].replace(/<[^>]*>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
      const parts = /^\[([^\]]*)\]\s*(.*)$/.exec(text);
      labels.set(
        absolute(match[1]),
        parts ? { kind: parts[1], title: parts[2] } : { kind: null, title: text },
      );
    }
  }

  const out = [];
  for (const item of rolling.split('<li>').slice(1)) {
    const id = /banner_id="(\d+)"/.exec(item)?.[1];
    const href = absolute(/<a href="([^"]*)"/.exec(item)?.[1] ?? '');
    const image = absolute(/data-src="([^"]*)"/.exec(item)?.[1] ?? '');
    if (!id || !href || !image) continue;
    const label = labels.get(href);
    out.push({ id, href, image, kind: label?.kind ?? null, title: label?.title ?? '' });
  }
  return out;
}

/** 메인을 읽어 배너 목록을 통째로 바꾼다. 읽은 배너 수를 돌려준다. 하나도 못 읽으면 오류를 던지고 앞 목록을 둔다. */
export async function collectBanners(db, get, now) {
  const banners = parseMainBanners(await get(MAIN_PATH));
  if (banners.length === 0) throw new Error('메인에서 배너를 읽지 못했습니다.');
  await db.batch([
    db.prepare('DELETE FROM main_banners'),
    ...banners.map((banner, pos) =>
      db
        .prepare(
          `INSERT INTO main_banners (pos, banner_id, href, image, kind, title, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(pos, banner.id, banner.href, banner.image, banner.kind, banner.title, now),
    ),
    db
      .prepare(
        `INSERT INTO news_meta (key, value) VALUES ('banners_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(String(now)),
  ]);
  return banners.length;
}

const NEWS_POST_LINK = /\/page\/news\/(?:notice|event|update)_view\.asp\?(?:.*&)?id=(\d+)/i;

/**
 * 화면이 쓰는 배너 목록. 받아 둔 새소식 글로 가는 배너는 postId 를 달아 화면이 우리 기록으로 잇게 하고, 그 밖의
 * 이벤트 페이지나 외부 주소는 공식 주소(link)로 보낸다. 제목이 없는 배너는 받아 둔 글의 제목을 쓴다.
 */
export async function listBanners(db) {
  const rows = (await db.prepare('SELECT * FROM main_banners ORDER BY pos').all()).results ?? [];
  const ids = [
    ...new Set(rows.map((row) => Number(NEWS_POST_LINK.exec(row.href)?.[1])).filter(Boolean)),
  ];
  const posts = new Map();
  if (ids.length > 0) {
    const found =
      (
        await db
          .prepare(`SELECT id, title FROM news_posts WHERE id IN (${ids.map(() => '?').join(',')})`)
          .bind(...ids)
          .all()
      ).results ?? [];
    for (const post of found) posts.set(post.id, post.title);
  }
  const updated = await db.prepare(`SELECT value FROM news_meta WHERE key = 'banners_at'`).first();
  return {
    banners: rows.map((row) => {
      const postId = Number(NEWS_POST_LINK.exec(row.href)?.[1]) || null;
      const archived = postId !== null && posts.has(postId);
      return {
        id: row.banner_id,
        title: row.title || (archived ? posts.get(postId) : ''),
        kind: row.kind ?? null,
        image: row.image,
        link: row.href,
        postId: archived ? postId : null,
      };
    }),
    updatedAt: updated ? Number(updated.value) : null,
  };
}

function bannersError(name, message, status, cors) {
  return new Response(JSON.stringify({ error: { name, message } }), {
    status,
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** GET /news/banners */
export async function bannersRead(request, env, cors) {
  if (!env.NEWS)
    return bannersError('BANNERS_NOT_CONFIGURED', '배너 기록이 아직 없습니다.', 503, cors);
  if (await rateLimited(request, env)) {
    return bannersError('BANNERS_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }
  const { body, hit } = await withEdgeCache(
    `https://banners.cache${BANNERS_PATH}`,
    () => listBanners(env.NEWS),
    CACHE_SECONDS,
  );
  return new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
      'x-banners-cache': hit ? 'hit' : 'miss',
    },
  });
}
