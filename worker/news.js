/**
 * 공식 홈페이지 새소식 기록.
 *
 * 공식 홈페이지의 새소식(공지사항, 개발자 노트)과 진행 중인 이벤트 목록을 읽어 D1(NEWS)에 쌓는다.
 *
 *   - 크론이 10분마다 공지사항과 개발자 노트의 첫 쪽, 이벤트 목록을 읽는다. 처음 보는 글은 본문을 받아 둔다.
 *   - 공식 홈페이지는 글을 고칠 때 새 글을 올리지 않고 올린 글을 그대로 바꾼다. 그래서 올린 지 WATCH_DAYS 일이
 *     안 된 글과 목록 맨 위 고정 글은 오래 다시 읽지 않은 것부터 RECHECK_PER_RUN 개씩 다시 읽고, 본문이 바뀌었으면
 *     판(revision)을 하나 더 남긴다. 화면은 판끼리 비교해 무엇이 바뀌었는지 보여 준다.
 *   - 지난 글은 크론마다 BACKFILL_PAGES_PER_RUN 쪽씩 둘째 쪽부터 거슬러 올라가며 채운다. 목록이 비는 쪽에 닿으면
 *     그 게시판은 다 채운 것이다(news_meta 의 backfill:<board>).
 *   - 공식 홈페이지에는 요청 사이를 GAP_MS 이상 띄운다.
 *
 * 본문은 공식 홈페이지 본문 칸의 HTML 을 고치지 않고 그대로 둔다. 화면에 그릴 때 거른다(src/features/news/sanitize.ts).
 * 표는 migrations-news/0001_news.sql 에 있다.
 */

import { rateLimited, withEdgeCache } from './market.js';
import { collectBanners } from './banners.js';
import { indexPreviews } from './previews.js';

export const NEWS_LIST_PATH = '/news/list';
export const NEWS_POST_PATH = '/news/post';
export const NEWS_EVENTS_PATH = '/news/events';
export const NEWS_COLLECT_PATH = '/news/collect';

/**
 * 새소식 크론. 시세(정각 10분)와 시세 스냅숏(5분 어긋남)과 겹치지 않게 2분 어긋나게 둔다.
 * wrangler.toml 의 [triggers] 와 글자까지 같아야 한다. 워커가 이 글자로 가른다.
 */
export const NEWS_CRON = '2,12,22,32,42,52 * * * *';

export const NEWS_ORIGIN = 'https://mabinogi.nexon.com';

/**
 * 메인 화면은 쿠키가 없으면 이벤트 홍보 화면으로 넘긴다. 홈페이지가 "홈으로" 를 누를 때 심는 쿠키를 같이 보낸다.
 * 목록과 본문 화면에는 필요 없지만 같은 요청 머리로 둔다.
 */
const REQUEST_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; MabiKuma; +https://mabi.spkuma.com)',
  cookie: 'introMovie=1',
};

export const BOARDS = {
  notice: { list: '/page/news/notice_list.asp', view: '/page/news/notice_view.asp' },
  update: { list: '/page/news/update_list.asp', view: '/page/news/update_view.asp' },
};
const BOARD_KEYS = Object.keys(BOARDS);
const EVENT_LIST_PATH = '/page/news/event_list.asp';

/** 화면의 분류. 공지사항 목록의 분류 칸과 개발자 노트. */
export const CATEGORIES = ['공지', '점검', '이벤트', '샵', '개발자 노트'];

/**
 * 키트 판매 공지가 올라오는 분류. 이 분류의 글이 새로 오거나 고쳐지면 키트 기록(kits.js)이 확률 화면을 바로 다시 읽는다.
 * 한 시간을 기다리면 새 키트가 그만큼 늦게 시뮬레이터에 오른다.
 */
export const KIT_CATEGORIES = ['샵', '이벤트'];
const UPDATE_CATEGORY = '개발자 노트';

/** 올린 지 이만큼 안 된 글은 계속 다시 읽는다. */
export const WATCH_DAYS = 7;
/** 한 번에 다시 읽는 글 수. 지켜보는 글이 40개 남짓이라 20분쯤에 한 바퀴 돈다. */
export const RECHECK_PER_RUN = 20;
/** 한 번에 채우는 지난 목록 쪽 수. 한 쪽이 20개라 본문까지 60번쯤 묻는다. */
export const BACKFILL_PAGES_PER_RUN = 3;
/** 운영자가 한 번에 돌릴 때의 쪽 수 상한. */
const BACKFILL_PAGES_MAX = 30;
/** 공식 홈페이지 요청 사이 간격. */
export const GAP_MS = 1000;

/** 목록 한 쪽의 글 수. 새소식 화면이 스크롤 없이 한 화면에 들어오는 수다. */
export const PAGE_SIZE = 10;
const QUERY_MAX = 40;
const CACHE_SECONDS = 60;
const DAY_SECONDS = 86400;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', amp: '&' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
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

/** 태그를 지운 글. 띄어쓰기는 하나로 모은다. */
function textOf(html) {
  return decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** "2026.10.08 11:37", "2026.10.08 11:30:00", "2026.10.08" (한국 시각) -> 유닉스 초. 날짜가 없으면 null. */
export function parseKstTime(text) {
  const match = /(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(
    String(text ?? ''),
  );
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  return Date.UTC(+year, +month - 1, +day, +hour - 9, +minute, +second) / 1000;
}

function absoluteUrl(href) {
  if (!href) return null;
  try {
    return new URL(decodeEntities(href), `${NEWS_ORIGIN}/page/news/`).toString();
  } catch {
    return null;
  }
}

/** 공식 홈페이지에서 그 글을 여는 주소. */
export function sourceUrl(board, id) {
  return `${NEWS_ORIGIN}${(BOARDS[board] ?? BOARDS.notice).view}?id=${id}`;
}

/**
 * 공지사항이나 개발자 노트 목록 한 쪽. [{ id, title, category, author, postedAt, pinned }]
 *
 * 목록은 board_common01 칸 둘로 되어 있다. "board_common01 notice" 는 모든 쪽 맨 위에 되풀이되는 고정 글이고,
 * 그다음 칸이 그 쪽의 글이다. hasBoard 는 목록 틀이 있었는지다. 점검 화면처럼 틀이 없는 응답을 빈 쪽으로 읽어
 * 지난 글 채우기를 끝내 버리지 않게 한다.
 */
export function parseBoardList(html, board) {
  const viewFile = BOARDS[board].view.split('/').pop();
  const rows = [];
  const seen = new Set();
  const blocks = String(html).split('<div class="board_common01').slice(1);
  for (const block of blocks) {
    const pinned = block.startsWith(' notice"');
    const listEnd = block.indexOf('</ul>');
    const items = (listEnd < 0 ? block : block.slice(0, listEnd)).split(/<li[\s>]/).slice(1);
    for (const item of items) {
      const anchor = new RegExp(
        `<a href="(?:/page/news/)?${viewFile.replace('.', '\\.')}\\?id=(\\d+)"[^>]*>([\\s\\S]*?)</a>`,
      ).exec(item);
      if (!anchor) continue;
      const id = Number(anchor[1]);
      if (seen.has(id)) continue;
      seen.add(id);
      const type = textOf(/<div class="type">([\s\S]*?)<\/div>/.exec(item)?.[1]);
      rows.push({
        id,
        title: textOf(anchor[2]),
        category: board === 'update' ? UPDATE_CATEGORY : type || '공지',
        author: textOf(/<dd>([\s\S]*?)<\/dd>/.exec(item)?.[1]) || null,
        postedAt: parseKstTime(/<span class="date">([^<]*)<\/span>/.exec(item)?.[1]),
        pinned,
      });
    }
  }
  return { rows, hasBoard: blocks.length > 0 };
}

/** 목록의 마지막 쪽 번호. 개발자 노트는 공지사항의 쪽 수를 그대로 적어 두므로 끝을 가르는 데 쓰지 않는다. */
export function parsePageMax(html) {
  const match = /var page_max\s*=\s*(\d+)/.exec(String(html));
  return match ? Number(match[1]) : null;
}

const VIEW_START = '<div class="board_view01">';
const BODY_START = '<dd class="view_cont_wrap">';

/**
 * 글 한 편. { title, postedAt, body } 이거나, 지워진 글이면 { missing: true }, 읽을 수 없으면 null.
 * body 는 본문 칸(view_cont_wrap) 안의 HTML 그대로다. 아래의 주소 복사, 공유 단추 칸은 뺀다.
 */
export function parseView(html) {
  const page = String(html);
  if (page.includes('게시물을 찾을 수 없습니다')) return { missing: true };
  const start = page.indexOf(VIEW_START);
  if (start < 0) return null;
  const end = page.indexOf('<!-- //view -->', start);
  const view = page.slice(start, end < 0 ? undefined : end);
  const bodyStart = view.indexOf(BODY_START);
  if (bodyStart < 0) return null;
  let body = view.slice(bodyStart + BODY_START.length);
  const linkAt = body.indexOf('<dd class="link">');
  body =
    linkAt >= 0 ? body.slice(0, linkAt) : body.slice(0, Math.max(0, body.lastIndexOf('</dd>')));
  body = body
    .trim()
    .replace(/<\/dd>$/, '')
    .trim();
  return {
    title: textOf(/<dt>([\s\S]*?)<\/dt>/.exec(view)?.[1]),
    postedAt: parseKstTime(/<span class="date">([^<]*)<\/span>/.exec(view)?.[1]),
    body,
  };
}

/** 이벤트 목록. [{ link, postId, title, summary, thumb, period, startsAt, endsAt }] */
export function parseEventList(html) {
  const page = String(html);
  const start = page.indexOf('<div class="board_event">');
  if (start < 0) return { events: [], hasBoard: false };
  const listEnd = page.indexOf('</ul>', start);
  const section = page.slice(start, listEnd < 0 ? undefined : listEnd);
  const events = [];
  for (const item of section.split(/<li[\s>]/).slice(1)) {
    const href = /<a href="([^"]+)"/.exec(item)?.[1];
    const link = absoluteUrl(href);
    const title = textOf(/<dt>([\s\S]*?)<\/dt>/.exec(item)?.[1]);
    if (!link || !title) continue;
    const period = textOf(/<p class="date">([\s\S]*?)<\/p>/.exec(item)?.[1]);
    const [from, to] = period.split('~');
    events.push({
      link,
      // 새소식 글만 번호로 잇는다. 게임 가이드(guide_view.asp) 같은 다른 게시판 글도 이벤트 칸에 걸린다.
      postId:
        Number(/\/page\/news\/(?:notice|event|update)_view\.asp\?id=(\d+)/.exec(href ?? '')?.[1]) ||
        null,
      title,
      summary: textOf(/<p class="cont">([\s\S]*?)<\/p>/.exec(item)?.[1]) || null,
      thumb: absoluteUrl(/<img src="([^"]+)"/.exec(item)?.[1]),
      period: period || null,
      startsAt: parseKstTime(from),
      endsAt: to ? parseKstTime(to) : null,
    });
  }
  return { events, hasBoard: true };
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 판을 가르는 해시. 제목이나 본문 어느 쪽이 바뀌어도 새 판이다. */
export function revisionHash(view) {
  return sha256Hex(`${view.title}\n${view.body.replace(/\r\n/g, '\n')}`);
}

/**
 * 공식 홈페이지에 묻는 함수. 요청 사이를 gapMs 이상 띄운다. 페이지는 EUC-KR 이라 응답 머리의 charset 으로 푼다.
 */
export function nexonPageClient({ gapMs = GAP_MS, wait = sleep } = {}) {
  const decoders = new Map();
  let last = 0;
  return async function get(path, fields) {
    const pause = last + gapMs - Date.now();
    if (pause > 0) await wait(pause);
    try {
      const response = await fetch(NEWS_ORIGIN + path, {
        headers: fields
          ? { ...REQUEST_HEADERS, 'content-type': 'application/x-www-form-urlencoded' }
          : REQUEST_HEADERS,
        ...(fields ? { method: 'POST', body: new URLSearchParams(fields).toString() } : {}),
        redirect: 'manual',
      });
      if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
      const charset =
        /charset=([\w-]+)/i.exec(response.headers.get('content-type') ?? '')?.[1] ?? 'euc-kr';
      const key = charset.toLowerCase();
      if (!decoders.has(key)) decoders.set(key, new TextDecoder(key));
      return decoders.get(key).decode(await response.arrayBuffer());
    } finally {
      last = Date.now();
    }
  };
}

const listPath = (board, page) =>
  page > 1 ? `${BOARDS[board].list}?page=${page}` : BOARDS[board].list;
const viewPath = (board, id) => `${BOARDS[board].view}?id=${id}`;

export async function getMeta(db, key) {
  const row = await db.prepare('SELECT value FROM news_meta WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export function setMeta(db, key, value) {
  return db
    .prepare(
      'INSERT INTO news_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .bind(key, String(value));
}

/** 글 한 편을 처음 받아 넣는다. 받지 못했으면 false. */
async function addPost(db, get, board, row, now) {
  const view = parseView(await get(viewPath(board, row.id)));
  if (!view || view.missing) return false;
  const hash = await revisionHash(view);
  await db.batch([
    db
      .prepare(
        `INSERT INTO news_posts (id, board, category, title, author, posted_at, first_seen, checked_at, revisions, body_hash, pinned)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        row.id,
        board,
        row.category,
        row.title || view.title,
        row.author,
        view.postedAt ?? row.postedAt ?? now,
        now,
        now,
        hash,
        row.pinned ? 1 : 0,
      ),
    db
      .prepare(
        'INSERT OR IGNORE INTO news_revisions (post_id, rev, title, body, hash, seen_at) VALUES (?, 1, ?, ?, ?, ?)',
      )
      .bind(row.id, view.title, view.body, hash, now),
  ]);
  await indexPreviewsSafely(db, {
    postId: row.id,
    title: row.title || view.title,
    postedAt: view.postedAt ?? row.postedAt ?? now,
    body: view.body,
  });
  return true;
}

/**
 * 갤러리가 있는 글이면 미리보기를 색인한다. 색인이 실패해도 글 받기는 그대로 이어 가야 하므로 오류는 삼킨다.
 * 못 한 색인은 운영자의 다시 훑기(previews.js rebuildPreviews)가 메운다.
 */
async function indexPreviewsSafely(db, post) {
  try {
    await indexPreviews(db, post);
  } catch (error) {
    console.log(JSON.stringify({ previews: post.postId, error: String(error) }));
  }
}

/**
 * 받아 둔 글을 다시 읽는다. 'edited'(새 판), 'same', 'deleted'(지워짐), 'unreadable' 가운데 하나.
 * 지웠다가 되살린 글은 deleted_at 을 지운다.
 */
async function recheckPost(db, get, post, now) {
  const view = parseView(await get(viewPath(post.board, post.id)));
  if (!view) {
    await db.prepare('UPDATE news_posts SET checked_at = ? WHERE id = ?').bind(now, post.id).run();
    return 'unreadable';
  }
  if (view.missing) {
    await db
      .prepare(
        'UPDATE news_posts SET checked_at = ?, deleted_at = COALESCE(deleted_at, ?) WHERE id = ?',
      )
      .bind(now, now, post.id)
      .run();
    return 'deleted';
  }
  const hash = await revisionHash(view);
  if (hash === post.body_hash) {
    await db
      .prepare('UPDATE news_posts SET checked_at = ?, deleted_at = NULL WHERE id = ?')
      .bind(now, post.id)
      .run();
    return 'same';
  }
  const rev = post.revisions + 1;
  await db.batch([
    db
      .prepare(
        'INSERT OR IGNORE INTO news_revisions (post_id, rev, title, body, hash, seen_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(post.id, rev, view.title, view.body, hash, now),
    db
      .prepare(
        'UPDATE news_posts SET revisions = ?, body_hash = ?, edited_at = ?, checked_at = ?, deleted_at = NULL WHERE id = ?',
      )
      .bind(rev, hash, now, now, post.id),
  ]);
  await indexPreviewsSafely(db, {
    postId: post.id,
    title: view.title,
    postedAt: post.posted_at,
    body: view.body,
  });
  return 'edited';
}

const RECHECK_COLUMNS = 'id, board, category, revisions, body_hash, posted_at';

/**
 * 목록에서 읽은 줄을 넣는다. 처음 보는 글은 본문을 받고, 목록의 제목이나 분류가 바뀐 글은 그 자리에서 다시 읽는다.
 * 다시 읽은 글은 checked 에 넣어 같은 실행에서 두 번 읽지 않게 한다.
 * live 면 키트 공지(KIT_CATEGORIES)가 새로 오거나 고쳐진 것을 summary.kitNotices 로 센다. 지난 글 채우기(live 아님)는 세지 않는다.
 * 지난 키트 공지를 채울 때마다 키트 기록을 다시 읽을 까닭이 없다.
 */
async function ingestRows(db, get, board, rows, now, summary, checked, live = true) {
  if (rows.length === 0) return;
  const ids = rows.map((row) => row.id);
  const known = new Map(
    (
      (
        await db
          .prepare(
            `SELECT ${RECHECK_COLUMNS}, title FROM news_posts WHERE id IN (${ids.map(() => '?').join(',')})`,
          )
          .bind(...ids)
          .all()
      ).results ?? []
    ).map((row) => [row.id, row]),
  );
  for (const row of rows) {
    const stored = known.get(row.id);
    if (!stored) {
      if (await addPost(db, get, board, row, now)) {
        summary.added += 1;
        if (live && KIT_CATEGORIES.includes(row.category)) summary.kitNotices += 1;
      }
      checked.add(row.id);
      continue;
    }
    if (stored.title === row.title && stored.category === row.category) continue;
    await db
      .prepare('UPDATE news_posts SET title = ?, category = ? WHERE id = ?')
      .bind(row.title, row.category, row.id)
      .run();
    if (checked.has(row.id)) continue;
    checked.add(row.id);
    const outcome = await recheckPost(db, get, stored, now);
    if (outcome === 'edited') {
      summary.edited += 1;
      if (live && KIT_CATEGORIES.includes(row.category)) summary.kitNotices += 1;
    }
  }
}

/** 고정 글 표시를 이번 첫 쪽에 맞춘다. 고정에서 풀린 글은 기간이 지났으면 더 다시 읽지 않는다. */
function markPinned(db, board, pinnedIds) {
  const marks = pinnedIds.map(() => '?').join(',');
  return [
    db
      .prepare(
        `UPDATE news_posts SET pinned = 0 WHERE board = ? AND pinned = 1${marks ? ` AND id NOT IN (${marks})` : ''}`,
      )
      .bind(board, ...pinnedIds),
    ...(marks
      ? [db.prepare(`UPDATE news_posts SET pinned = 1 WHERE id IN (${marks})`).bind(...pinnedIds)]
      : []),
  ];
}

async function collectEvents(db, get, now) {
  const { events, hasBoard } = parseEventList(await get(EVENT_LIST_PATH));
  if (!hasBoard) throw new Error('이벤트 목록 틀이 없습니다.');
  await db.batch([
    ...events.map((event) =>
      db
        .prepare(
          `INSERT INTO news_events (link, post_id, title, summary, thumb, period, starts_at, ends_at, first_seen, last_seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(link) DO UPDATE SET post_id = excluded.post_id, title = excluded.title, summary = excluded.summary,
             thumb = excluded.thumb, period = excluded.period, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
             last_seen = excluded.last_seen`,
        )
        .bind(
          event.link,
          event.postId,
          event.title,
          event.summary,
          event.thumb,
          event.period,
          event.startsAt,
          event.endsAt,
          now,
          now,
        ),
    ),
    setMeta(db, 'events_at', now),
  ]);
  return events.length;
}

/**
 * 한 번 모으기. 크론과 운영자의 POST /news/collect 가 부른다. 단계마다 따로 실패한다. 한 단계가 막혀도
 * 다음 단계는 간다. options.backfillPages 로 이번에 채울 지난 쪽 수를, options.get 으로 묻는 함수를 바꾼다.
 */
export async function collectNews(env, now = Date.now(), options = {}) {
  const db = env.NEWS;
  if (!db) return { skipped: 'NEWS 바인딩이 없습니다.' };
  const get = options.get ?? nexonPageClient();
  const nowSec = Math.floor(now / 1000);
  const summary = {
    added: 0,
    edited: 0,
    kitNotices: 0,
    rechecked: 0,
    deleted: 0,
    events: null,
    banners: null,
    backfill: {},
    errors: [],
  };
  const checked = new Set();
  const failedSteps = [];
  const fail = (step, error) => {
    failedSteps.push(step);
    summary.errors.push(`${step}: ${error instanceof Error ? error.message : error}`);
  };

  for (const board of BOARD_KEYS) {
    try {
      const { rows, hasBoard } = parseBoardList(await get(listPath(board, 1)), board);
      if (!hasBoard) throw new Error('목록 틀이 없습니다.');
      await ingestRows(db, get, board, rows, nowSec, summary, checked);
      await db.batch(
        markPinned(
          db,
          board,
          rows.filter((row) => row.pinned).map((row) => row.id),
        ),
      );
    } catch (error) {
      fail(board, error);
    }
  }

  try {
    summary.events = await collectEvents(db, get, nowSec);
  } catch (error) {
    fail('events', error);
  }

  // 공식 메인의 이벤트 배너. 첫 화면의 배너가 넘기는 목록이다.
  try {
    summary.banners = await collectBanners(db, get, nowSec);
  } catch (error) {
    fail('banners', error);
  }

  try {
    const due = await db
      .prepare(
        `SELECT ${RECHECK_COLUMNS} FROM news_posts
         WHERE deleted_at IS NULL AND (posted_at >= ? OR pinned = 1) AND checked_at < ?
         ORDER BY checked_at ASC LIMIT ?`,
      )
      .bind(nowSec - WATCH_DAYS * DAY_SECONDS, nowSec, RECHECK_PER_RUN)
      .all();
    for (const post of due.results ?? []) {
      if (checked.has(post.id)) continue;
      checked.add(post.id);
      const outcome = await recheckPost(db, get, post, nowSec);
      summary.rechecked += 1;
      if (outcome === 'edited') {
        summary.edited += 1;
        if (KIT_CATEGORIES.includes(post.category)) summary.kitNotices += 1;
      }
      if (outcome === 'deleted') summary.deleted += 1;
    }
  } catch (error) {
    fail('recheck', error);
  }

  let budget = Math.max(
    0,
    Math.min(options.backfillPages ?? BACKFILL_PAGES_PER_RUN, BACKFILL_PAGES_MAX),
  );
  let nextBoard = Number(await getMeta(db, 'backfill_next_board')) || 0;
  const inactive = new Set();
  while (budget > 0 && inactive.size < BOARD_KEYS.length) {
    const board = BOARD_KEYS[nextBoard % BOARD_KEYS.length];
    nextBoard = (nextBoard + 1) % BOARD_KEYS.length;
    if (inactive.has(board)) continue;
    try {
      const state = await getMeta(db, `backfill:${board}`);
      if (state === 'done') {
        inactive.add(board);
        continue;
      }
      const page = Number(state) || 2;
      budget -= 1;
      const { rows, hasBoard } = parseBoardList(await get(listPath(board, page)), board);
      if (!hasBoard) throw new Error(`${page}쪽에 목록 틀이 없습니다.`);
      const own = rows.filter((row) => !row.pinned);
      if (own.length === 0) {
        await setMeta(db, `backfill:${board}`, 'done').run();
        summary.backfill[board] = 'done';
        inactive.add(board);
        continue;
      }
      await ingestRows(db, get, board, own, nowSec, summary, checked, false);
      await setMeta(db, `backfill:${board}`, page + 1).run();
      summary.backfill[board] = page;
    } catch (error) {
      inactive.add(board);
      fail(`backfill ${board}`, error);
    }
  }
  await db.batch([
    setMeta(db, 'backfill_next_board', nextBoard),
    setMeta(db, 'attempted_at', nowSec),
    setMeta(db, 'failed_steps', JSON.stringify(failedSteps)),
    ...(summary.errors.length === 0 ? [setMeta(db, 'collected_at', nowSec)] : []),
  ]);
  return summary;
}

function newsError(name, message, status, cors) {
  return new Response(JSON.stringify({ error: { name, message } }), {
    status,
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function cachedJson(body, hit, cors) {
  return new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
      'x-news-cache': hit ? 'hit' : 'miss',
    },
  });
}

const POST_COLUMNS =
  'id, board, category, title, author, posted_at, first_seen, edited_at, revisions, pinned, deleted_at';

function postOut(row) {
  return {
    id: row.id,
    board: row.board,
    category: row.category,
    title: row.title,
    author: row.author ?? null,
    postedAt: row.posted_at,
    firstSeen: row.first_seen,
    editedAt: row.edited_at ?? null,
    revisions: row.revisions,
    pinned: row.pinned === 1,
    deletedAt: row.deleted_at ?? null,
  };
}

async function collectState(db) {
  const rows = (await db.prepare('SELECT key, value FROM news_meta').all()).results ?? [];
  const meta = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const backfill = Object.fromEntries(
    BOARD_KEYS.map((board) => {
      const state = meta[`backfill:${board}`];
      return [board, state === 'done' ? 'done' : Number(state) || 1];
    }),
  );
  return {
    collectedAt: Number(meta.collected_at) || null,
    attemptedAt: Number(meta.attempted_at) || null,
    failedSteps: JSON.parse(meta.failed_steps || '[]'),
    eventsAt: Number(meta.events_at) || null,
    backfill,
  };
}

/** LIKE 의 %, _ 를 글자 그대로 찾게 한다. */
const likeEscape = (text) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * 글 목록. category 가 비면 모두, edited 면 고친 적 있는 글만 고친 시각 순으로. 제목만 찾는다.
 * 본문 HTML 까지 LIKE 로 훑으면 한 번에 수백 MB 를 읽는다.
 */
export async function listPosts(db, { category = '', q = '', edited = false, page = 1 } = {}) {
  const where = [];
  const params = [];
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (q) {
    where.push("title LIKE ? ESCAPE '\\'");
    params.push(`%${likeEscape(q)}%`);
  }
  if (edited) where.push('revisions > 1');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = edited ? 'edited_at DESC, id DESC' : 'posted_at DESC, id DESC';
  const [list, count, state] = await Promise.all([
    db
      .prepare(
        `SELECT ${POST_COLUMNS} FROM news_posts ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
      )
      .bind(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .all(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM news_posts ${clause}`)
      .bind(...params)
      .first(),
    collectState(db),
  ]);
  return {
    posts: (list.results ?? []).map(postOut),
    total: count?.total ?? 0,
    page,
    size: PAGE_SIZE,
    ...state,
  };
}

/** 글 한 편과 모든 판. 판이 없으면 null. */
export async function getPost(db, id) {
  const row = await db
    .prepare(`SELECT ${POST_COLUMNS} FROM news_posts WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) return null;
  const revisions = await db
    .prepare('SELECT rev, title, body, seen_at FROM news_revisions WHERE post_id = ? ORDER BY rev')
    .bind(id)
    .all();
  return {
    post: postOut(row),
    revisions: (revisions.results ?? []).map((rev) => ({
      rev: rev.rev,
      title: rev.title,
      body: rev.body,
      seenAt: rev.seen_at,
    })),
    source: sourceUrl(row.board, row.id),
  };
}

/**
 * 진행 중인 이벤트. 마지막 이벤트 목록에 있었고 끝나는 시각이 지나지 않은 것. 목록 순서(새것부터, 상시진행은 뒤)대로.
 * archived 는 이벤트 글을 받아 두었는지다. 화면은 받아 둔 글이면 우리 기록으로, 아니면 공식 홈페이지로 잇는다.
 */
export async function listEvents(db, now = Date.now()) {
  const nowSec = Math.floor(now / 1000);
  const eventsAt = Number(await getMeta(db, 'events_at')) || 0;
  const rows = await db
    .prepare(
      `SELECT e.link, e.post_id, e.title, e.summary, e.thumb, e.period, e.starts_at, e.ends_at, p.id AS archived
       FROM news_events e LEFT JOIN news_posts p ON p.id = e.post_id
       WHERE e.last_seen >= ? AND (e.ends_at IS NULL OR e.ends_at > ?)
       ORDER BY e.starts_at IS NULL, e.starts_at DESC, e.first_seen DESC`,
    )
    .bind(eventsAt, nowSec)
    .all();
  return {
    events: (rows.results ?? []).map((row) => ({
      link: row.link,
      postId: row.archived ?? null,
      title: row.title,
      summary: row.summary ?? null,
      thumb: row.thumb ?? null,
      period: row.period ?? null,
      startsAt: row.starts_at ?? null,
      endsAt: row.ends_at ?? null,
    })),
    eventsAt: eventsAt || null,
  };
}

/** GET /news/list?category=&q=&edited=1&page= */
export async function newsList(request, url, env, cors) {
  if (!env.NEWS) return newsError('NEWS_NOT_CONFIGURED', '새소식 기록이 아직 없습니다.', 503, cors);
  const requestedCategory = url.searchParams.get('category') ?? '';
  const category = CATEGORIES.includes(requestedCategory) ? requestedCategory : '';
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, QUERY_MAX);
  const edited = url.searchParams.get('edited') === '1';
  const requestedPage = Number(url.searchParams.get('page'));
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;

  if (await rateLimited(request, env)) {
    return newsError('NEWS_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }
  const cacheKey = new URL(`https://news.cache${NEWS_LIST_PATH}`);
  cacheKey.searchParams.set('category', category);
  cacheKey.searchParams.set('q', q);
  cacheKey.searchParams.set('edited', edited ? '1' : '0');
  cacheKey.searchParams.set('page', String(page));
  const { body, hit } = await withEdgeCache(
    cacheKey.toString(),
    () => listPosts(env.NEWS, { category, q, edited, page }),
    CACHE_SECONDS,
  );
  return cachedJson(body, hit, cors);
}

/** GET /news/post?id= */
export async function newsPost(request, url, env, cors) {
  if (!env.NEWS) return newsError('NEWS_NOT_CONFIGURED', '새소식 기록이 아직 없습니다.', 503, cors);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0)
    return newsError('NEWS_BAD_ID', '글 번호가 올바르지 않습니다.', 400, cors);
  if (await rateLimited(request, env)) {
    return newsError('NEWS_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }
  const { body, hit } = await withEdgeCache(
    `https://news.cache${NEWS_POST_PATH}?id=${id}`,
    () => getPost(env.NEWS, id),
    CACHE_SECONDS,
  );
  if (body === 'null') return newsError('NEWS_NOT_FOUND', '받아 둔 글이 아닙니다.', 404, cors);
  return cachedJson(body, hit, cors);
}

/** GET /news/events */
export async function newsEvents(request, env, cors, now = Date.now()) {
  if (!env.NEWS) return newsError('NEWS_NOT_CONFIGURED', '새소식 기록이 아직 없습니다.', 503, cors);
  if (await rateLimited(request, env)) {
    return newsError('NEWS_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }
  const { body, hit } = await withEdgeCache(
    `https://news.cache${NEWS_EVENTS_PATH}`,
    () => listEvents(env.NEWS, now),
    CACHE_SECONDS,
  );
  return cachedJson(body, hit, cors);
}

/** POST /news/collect?pages= (운영자). 크론을 기다리지 않고 한 번 모으거나 지난 글을 더 많이 채울 때 쓴다. */
export async function newsCollect(url, env, cors) {
  if (!env.NEWS) return newsError('NEWS_NOT_CONFIGURED', '새소식 기록이 아직 없습니다.', 503, cors);
  const requested = Number(url.searchParams.get('pages'));
  const backfillPages =
    Number.isInteger(requested) && requested >= 0 ? requested : BACKFILL_PAGES_PER_RUN;
  const summary = await collectNews(env, Date.now(), { backfillPages });
  return new Response(JSON.stringify(summary), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
