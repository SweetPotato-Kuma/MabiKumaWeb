/**
 * 공식 미리보기. 아이템 이름 -> 공식 그림이나 영상.
 *
 * 키트(샵)와 이벤트 글에는 "신규 아이템 미리보기" 갤러리가 있다. 이름 목록(ul.img_g_list)의 N 번째 줄이 N 번째 칸
 * (div.img_g.g_N)의 그림이나 영상이다. 새소식 기록(news.js)이 받아 둔 본문에서 그 짝을 뽑아 item_previews 표에 둔다.
 * 아이템 정보 화면이 이름으로 찾아 의장 아이템의 공식 모습을 보여 준다.
 *
 *   - 새 글과 고친 글은 본문을 받을 때마다 색인한다(indexPreviews). 이 기능 전의 글은 운영자가 한 번 훑는다(rebuildPreviews).
 *   - 그림(평균 170KB)은 크론이 조금씩 R2 에 사본을 만든다(mirrorPreviews). 공식 쪽이 지워도 남기려는 것이다.
 *     영상(평균 6.6MB, 전체 10GB 안팎)은 사본을 두지 않고 공식 주소로 재생한다.
 *   - 한 칸에 이름 둘이 묶인 줄("A(남성용), B(여성용)")은 이름마다 같은 그림으로 색인한다.
 *
 * 표는 migrations-news/0003_previews.sql 에 있다.
 */

import { rateLimited, withEdgeCache } from './market.js';

/** 공식 쪽에 요청 사이를 띄우는 간격(밀리초). news.js 의 GAP_MS 와 같다. */
const GAP_MS = 1000;

export const PREVIEW_PATH = '/news/preview';
export const PREVIEW_REBUILD_PATH = '/news/previews/rebuild';
export const PREVIEW_MIRROR_PATH = '/news/previews/mirror';

const SITE = 'https://mabinogi.nexon.com';

/** 크론마다 사본을 만드는 그림 수. 1,100장 남짓이라 하루 남짓 걸린다. */
export const MIRROR_PER_RUN = 6;
/** 운영자가 한 번에 만드는 그림 수 상한. */
const MIRROR_MAX = 40;
/** 사본 만들기를 이만큼 실패한 그림은 그만둔다. 화면은 공식 주소를 그대로 쓴다. */
export const MAX_ATTEMPTS = 3;
/** 없다는 답도 이만큼 캐시한다. 새 키트가 올라오면 이 시간 안에 보인다. */
const CACHE_SECONDS = 600;
/** 한 번에 훑는 글 수. 본문이 20KB 안팎이라 크게 잡지 않는다. */
const REBUILD_BATCH = 8;
const NAME_MAX = 120;

/** 찾는 열쇠. 말머리("[트렌드]")를 떼고 공백을 하나로 줄인다. */
export function previewKey(name) {
  return String(name ?? '')
    .replace(/^\s*\[[^\]]*\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

const plain = (html) =>
  decode(String(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

function mediaUrl(value) {
  try {
    const url = new URL(decode(value).trim(), SITE);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * 한 칸에 이름 둘이 묶인 줄("A(남성용), B(여성용)")을 쉼표와 띄어쓰기로 나눈다. 괄호 안의 쉼표는 나누지 않는다.
 * "얼굴 장식 슬롯 전용 아이템(귀걸이, 마스크)" 는 한 이름이다. 쉼표 뒤에 띄어쓰기가 없는 "쉼표,붙은이름" 도 나누지 않는다.
 */
export function splitNames(label) {
  const text = String(label).trim();
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0 && /\s/.test(text[at + 1] ?? '')) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * 글 본문의 갤러리에서 [{ name, kind, src }] 를 뽑는다. 갤러리가 없거나 N 번째 칸에 그림도 영상도 없는 줄은 건너뛴다.
 * 이름이 둘 묶인 줄은 둘 다 담는다.
 */
export function parseGallery(body) {
  const html = String(body ?? '');
  if (!html.includes('img_g_list')) return [];

  const panels = new Map();
  for (const match of html.matchAll(
    /<div[^>]*class="img_g g_(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]*class="img_g g_\d+"|<!--\s*리스트|<ul[^>]*img_g_list)/g,
  )) {
    const chunk = match[2];
    const video =
      /<video\b[^>]*?\ssrc="([^"]+)"/i.exec(chunk) ?? /<source\b[^>]*?\ssrc="([^"]+)"/i.exec(chunk);
    const image = /<img\b[^>]*?\ssrc="([^"]+)"/i.exec(chunk);
    const src = mediaUrl((video ?? image)?.[1] ?? '');
    if (src) panels.set(Number(match[1]), { kind: video ? 'video' : 'image', src });
  }

  // 스타일 시트에도 img_g_list 가 나오므로 글자가 아니라 ul 태그를 찾는다. 목록이 여럿(겟잇 뷰티 박스)이면
  // 이어서 번호를 매긴다. 칸 번호가 목록을 가로질러 이어지기 때문이다.
  const rows = [...html.matchAll(/<ul[^>]*img_g_list[^>]*>([\s\S]*?)<\/ul>/gi)].flatMap((list) => [
    ...list[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi),
  ]);
  const out = [];
  rows.forEach((row, index) => {
    const panel = panels.get(index + 1);
    const label = /<span[^>]*class="txt"[^>]*>([\s\S]*?)<\/span>/i.exec(row[1]);
    if (!panel || !label) return;
    for (const name of splitNames(plain(label[1]))) {
      if (name.length <= NAME_MAX) out.push({ name, ...panel });
    }
  });
  return out;
}

/**
 * 글 하나를 색인한다. 같은 이름이 있으면 더 최근 글의 것으로 바꾼다. 주소가 달라지면 사본 표시를 지워 다시 만든다.
 * 갤러리가 없는 글은 아무것도 하지 않는다. 더한 이름 수를 돌려준다.
 */
export async function indexPreviews(db, { postId, title, postedAt, body }) {
  const found = parseGallery(body);
  if (found.length === 0) return 0;
  const statements = found.map((item) =>
    db
      .prepare(
        `INSERT INTO item_previews (key, name, kind, src, post_id, title, posted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           name = excluded.name, kind = excluded.kind, post_id = excluded.post_id, title = excluded.title,
           posted_at = excluded.posted_at,
           mirror = CASE WHEN item_previews.src = excluded.src THEN item_previews.mirror ELSE NULL END,
           attempts = CASE WHEN item_previews.src = excluded.src THEN item_previews.attempts ELSE 0 END,
           src = excluded.src
         WHERE excluded.posted_at >= item_previews.posted_at`,
      )
      .bind(previewKey(item.name), item.name, item.kind, item.src, postId, title, postedAt),
  );
  // 한 번에 보내는 문장 수를 나눈다. 갤러리 하나가 140줄을 넘기도 한다.
  for (let at = 0; at < statements.length; at += 50) await db.batch(statements.slice(at, at + 50));
  return found.length;
}

/**
 * 받아 둔 글의 마지막 판을 번호 순으로 훑어 색인한다(이 기능 전의 글을 한 번 채울 때). after 보다 큰 번호부터
 * REBUILD_BATCH 개. 다음에 이어 부를 번호(없으면 null)와 이번에 더한 이름 수를 돌려준다.
 */
export async function rebuildPreviews(db, after = 0) {
  const rows =
    (
      await db
        .prepare(
          `SELECT p.id, p.title, p.posted_at, r.body FROM news_posts p
           JOIN news_revisions r ON r.post_id = p.id AND r.rev = p.revisions
           WHERE p.id > ? AND r.body LIKE '%img_g_list%' ORDER BY p.id LIMIT ?`,
        )
        .bind(after, REBUILD_BATCH)
        .all()
    ).results ?? [];
  let indexed = 0;
  for (const row of rows) {
    indexed += await indexPreviews(db, {
      postId: row.id,
      title: row.title,
      postedAt: row.posted_at,
      body: row.body,
    });
  }
  return {
    posts: rows.length,
    indexed,
    next: rows.length === REBUILD_BATCH ? rows.at(-1).id : null,
  };
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * 사본이 없는 그림 limit 장을 R2 에 올린다. 최근 글의 그림부터. 공식 쪽에는 요청 사이를 gapMs 띄운다.
 * 실패하면 attempts 를 올리고 다음으로 간다. 어느 장도 다른 장을 막지 않는다.
 */
export async function mirrorPreviews(
  env,
  { limit = MIRROR_PER_RUN, gapMs = GAP_MS, wait = sleep } = {},
) {
  const db = env.NEWS;
  if (!db || !env.ICONS) return { skipped: 'NEWS 나 ICONS 바인딩이 없습니다.' };
  const rows =
    (
      await db
        .prepare(
          `SELECT key, src FROM item_previews WHERE kind = 'image' AND mirror IS NULL AND attempts < ?
           ORDER BY posted_at DESC, key LIMIT ?`,
        )
        .bind(MAX_ATTEMPTS, Math.min(limit, MIRROR_MAX))
        .all()
    ).results ?? [];
  // 같은 주소를 쓰는 이름(남성용, 여성용 묶음)은 주소 하나로 보고 한 번만 받는다. 사본과 실패 횟수도 주소 단위다.
  const sources = [...new Set(rows.map((row) => row.src))];
  const summary = { tried: sources.length, mirrored: 0, failed: 0 };
  for (const [index, src] of sources.entries()) {
    try {
      if (index > 0) await wait(gapMs);
      const response = await fetch(src, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; MabiKuma)' },
      });
      const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!response.ok || !EXTENSIONS[type]) throw new Error(`${response.status} ${type}`);
      const bytes = await response.arrayBuffer();
      const key = `previews/${(await sha256Hex(src)).slice(0, 24)}.${EXTENSIONS[type]}`;
      await env.ICONS.put(key, bytes, {
        httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
      });
      await db
        .prepare('UPDATE item_previews SET mirror = ? WHERE src = ? AND mirror IS NULL')
        .bind(key, src)
        .run();
      summary.mirrored += 1;
    } catch {
      await db
        .prepare('UPDATE item_previews SET attempts = attempts + 1 WHERE src = ?')
        .bind(src)
        .run();
      summary.failed += 1;
    }
  }
  const left = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM item_previews WHERE kind = 'image' AND mirror IS NULL AND attempts < ?`,
    )
    .bind(MAX_ATTEMPTS)
    .first();
  return { ...summary, left: left?.n ?? 0 };
}

/** 이름으로 찾는다. 화면이 쓰는 모양으로 돌려준다. 없으면 null. */
export async function findPreview(db, name, imageBase = '') {
  const row = await db
    .prepare('SELECT name, kind, src, mirror, post_id, title FROM item_previews WHERE key = ?')
    .bind(previewKey(name))
    .first();
  if (!row) return null;
  const base = String(imageBase ?? '').replace(/\/+$/, '');
  return {
    name: row.name,
    kind: row.kind,
    url: row.mirror && base ? `${base}/${row.mirror}` : row.src,
    postId: row.post_id,
    title: row.title,
  };
}

function previewError(name, message, status, cors) {
  return new Response(JSON.stringify({ error: { name, message } }), {
    status,
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** GET /news/preview?name= */
export async function previewRead(request, url, env, cors) {
  if (!env.NEWS)
    return previewError('PREVIEW_NOT_CONFIGURED', '미리보기 기록이 아직 없습니다.', 503, cors);
  const name = (url.searchParams.get('name') ?? '').trim().slice(0, NAME_MAX);
  if (!name) return previewError('PREVIEW_NAME_REQUIRED', '아이템 이름이 없습니다.', 400, cors);
  if (await rateLimited(request, env)) {
    return previewError('PREVIEW_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }
  const { body, hit } = await withEdgeCache(
    `https://previews.cache${PREVIEW_PATH}?key=${encodeURIComponent(previewKey(name))}`,
    () => findPreview(env.NEWS, name, env.ICON_BASE_URL),
    CACHE_SECONDS,
  );
  if (body === 'null')
    return previewError('PREVIEW_NOT_FOUND', '공식 미리보기가 없는 아이템입니다.', 404, cors);
  return new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
      'x-preview-cache': hit ? 'hit' : 'miss',
    },
  });
}

/** 운영자 경로. POST /news/previews/rebuild?after= , POST /news/previews/mirror?n= */
export async function previewAdmin(request, url, env, cors) {
  if (!env.NEWS)
    return previewError('PREVIEW_NOT_CONFIGURED', '미리보기 기록이 아직 없습니다.', 503, cors);
  if (request.method !== 'POST')
    return previewError('PREVIEW_METHOD_NOT_ALLOWED', 'POST 로 보내 주세요.', 405, cors);
  const number = (key, fallback) => {
    const value = Number(url.searchParams.get(key));
    return Number.isInteger(value) && value >= 0 ? value : fallback;
  };
  const result =
    url.pathname === PREVIEW_REBUILD_PATH
      ? await rebuildPreviews(env.NEWS, number('after', 0))
      : await mirrorPreviews(env, { limit: number('n', MIRROR_PER_RUN) });
  return new Response(JSON.stringify(result), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
