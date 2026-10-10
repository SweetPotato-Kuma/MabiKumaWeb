/**
 * 키트(확률형 상품) 확률표 기록.
 *
 * 공식 확률 정보 화면은 지금 파는 키트만 보여 주고, 판매가 끝나면 목록에서 지운다. 지난 확률표는 다시 볼 수
 * 없으므로 보이는 동안 받아 D1(NEWS)의 kits 표에 쌓는다. 한 번 담은 키트는 지우지 않는다.
 *
 *   - 새소식 크론이 공지를 받은 뒤에 부른다(collectKitsIfDue). 키트 공지가 새로 오거나 고쳐졌을 때, 판매 공지는 있는데 그
 *     키트가 아직 기록에 없을 때, 그리고 COLLECT_EVERY_SECONDS 마다 한 번 확률 정보 목록과 판매 중인 키트의 확률표를 읽는다.
 *   - 묶음 가격과 옵션별 적립률은 공식 상점에서 읽어 news_meta의 kit_shop:<id>에 보관한다.
 *   - 판매 기간과 가격의 초기값은 같은 이름의 공지 본문에서 읽는다. 공지는 새소식 기록(news.js)이 이미 받아 두었으므로
 *     공식 홈페이지에 다시 묻지 않는다. 모을 때마다 공지를 다시 읽어 공지가 고쳐지면 따라간다. 공지를 못 찾으면 비워 두고
 *     다음에 다시 찾는다.
 *   - 이 기능 전에 모아 둔 지난 키트는 운영자가 한 번 올린다(POST /kits/import). 이미 있는 키트는 건드리지 않는다.
 *   - 그림 이름 표는 게임 클라이언트가 있어야 만들 수 있어 운영자 PC 가 통째로 올린다(POST /kits/icons).
 *
 * 화면이 받는 모양은 예전 정적 파일과 같다. 목록(GET /kits/index)과 고른 키트 하나(GET /kits/kit?id=).
 * 표는 migrations-news/0002_kits.sql 에 있다.
 */

import { rateLimited, withEdgeCache } from './market.js';
import { KIT_CATEGORIES, getMeta, nexonPageClient, setMeta } from './news.js';

export const KITS_INDEX_PATH = '/kits/index';
export const KITS_KIT_PATH = '/kits/kit';
export const KITS_ICON_PATH = '/kits/icon';
export const KITS_ARCHIVE_PATH = '/kits/archive';
export const KITS_IMPORT_PATH = '/kits/import';
export const KITS_ICONS_PATH = '/kits/icons';
export const KITS_COLLECT_PATH = '/kits/collect';

const PROB_PATH = '/ItemShop/prob.asp';

/**
 * 키트는 목요일 점검 뒤에 바뀌고 2주쯤 판다. 키트 공지를 받으면 그때 바로 모으므로(collectKitsIfDue) 이 간격은 공지 없이 바뀐
 * 확률표를 놓치지 않으려는 보루다.
 */
export const COLLECT_EVERY_SECONDS = 3600;

/** 판매 공지를 찾을 기간. 키트 공지는 판매 시작 무렵에 올라온다. */
const NOTICE_LOOKBACK_DAYS = 120;

/** 화면이 받는 목록과 키트는 이만큼 엣지 캐시에 둔다. 새 키트는 한 시간에 한 번 들어오므로 짧게 둘 까닭이 없다. */
const CACHE_SECONDS = 300;

const BATCH = 50;
const ID_PATTERN = /^[a-z0-9-]{1,80}$/;
const ICON_FILE = /^[\w.-]{1,120}$/;
const ICON_NAME_MAX = 120;

const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', amp: '&' };

function decodeEntities(text) {
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

const plainText = (html) =>
  decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

/** 띄어쓰기와 기호를 지운 비교용 이름. */
export const squash = (text) =>
  String(text)
    .replace(/[\s()[\]·.,:/-]/g, '')
    .toLowerCase();

/** 공개 상품 목록에서만 이름과 상품 번호를 연결한다. 비슷한 이름을 추측하지 않는다. */
export function parseShopProducts(html) {
  const products = new Map();
  for (const [row] of String(html).matchAll(/<li\b[\s\S]*?<\/li>/gi)) {
    const productId = /product_detail\.asp\?product_no=(\d+)/i.exec(row)?.[1];
    const name = plainText(/class=["']txt["'][^>]*>([\s\S]*?)<\/div>/i.exec(row)?.[1] ?? '');
    if (productId && name) products.set(productId, { productId, name });
  }
  return [...products.values()];
}

/** 각 구매 옵션의 원가와 실제 판매가. 모르는 수량/가격이 있으면 일부 옵션만 채택하지 않는다. */
export function parseShopBundles(html) {
  const fields = new Map();
  const radios = [];
  for (const [tag] of String(html).matchAll(/<input\b[^>]*>/gi)) {
    const attr = (key) => new RegExp(`\\b${key}=["']([^"']*)["']`, 'i').exec(tag)?.[1];
    const name = attr('name');
    const value = attr('value');
    if (/^(product_price|sale_price)\d+$/.test(name ?? '')) fields.set(name, value);
    if (name === 'product_no' && attr('type')?.toLowerCase() === 'radio') radios.push(value);
  }
  const labels = new Map(
    [...String(html).matchAll(/<input\b[^>]*>\s*<label\b[^>]*>([\s\S]*?)<\/label>/gi)].map(
      ([row, label]) => [/\bvalue=["'](\d+)["']/i.exec(row)?.[1], plainText(label)],
    ),
  );
  const bundles = radios.map((productId) => {
    const label = labels.get(productId) ?? '';
    const unitsText = /^(\d[\d,]*)\s*개$/.exec(label)?.[1];
    const cash = (key) => {
      const value = fields.get(`${key}${productId}`);
      return /^\d+$/.test(value ?? '') ? Number(value) : NaN;
    };
    const units = unitsText ? Number(unitsText.replace(/,/g, '')) : NaN;
    const regularCash = cash('product_price');
    const saleCash = cash('sale_price');
    if (
      !/^\d+$/.test(productId ?? '') ||
      !Number.isSafeInteger(units) ||
      units < 1 ||
      units > 1000 ||
      !Number.isSafeInteger(regularCash) ||
      !Number.isSafeInteger(saleCash) ||
      saleCash < 1 ||
      regularCash < saleCash
    )
      throw new Error('공식 구매 옵션의 수량 또는 가격을 읽지 못했습니다.');
    return { productId, label, units, regularCash, saleCash };
  });
  if (!bundles.length || !bundles.some((bundle) => bundle.units === 1))
    throw new Error('개별 구매 옵션을 확인하지 못했습니다.');
  if (new Set(radios).size !== radios.length) throw new Error('구매 옵션 번호가 중복됩니다.');
  return bundles;
}

export function parseShopMileage(html) {
  const match = /^\+?(\d+(?:\.\d+)?)\s*%$/.exec(plainText(html));
  const rate = match ? Number(match[1]) : null;
  return rate !== null && rate >= 0 && rate <= 100 ? rate : null;
}

const shopKey = (id) => `kit_shop:${id}`;

/** 기존 키트 크론에서 함께 갱신한다. 지난 기록은 남기고, 실패한 가격을 추정하지 않는다. */
async function collectShopPricing(db, list, get, now, summary) {
  if (!list.length) return;
  let products;
  try {
    products = parseShopProducts(
      await get('/ItemShop/item_list.asp', {
        category_no: '2302',
        orderby_type: '0',
        id: '',
      }),
    );
    if (!products.length) throw new Error('공식 상품 목록을 읽지 못했습니다.');
  } catch (error) {
    summary.pricingErrors.push(String(error instanceof Error ? error.message : error));
    return;
  }
  for (const { seq, name } of list) {
    const matches = products.filter((product) => squash(product.name) === squash(name));
    // 판매 종료 상품, 캐시 상품이 아닌 확률표, 이름이 모호한 상품에는 현행 정책을 붙이지 않는다.
    if (matches.length !== 1) continue;
    try {
      const id = `official-${seq}`;
      const path = `/ItemShop/product_detail.asp?product_no=${matches[0].productId}`;
      const bundles = parseShopBundles(await get(path));
      for (const bundle of bundles) {
        bundle.mileageRatePercent = null;
        bundle.mileageSource = `https://mabinogi.nexon.com/ItemShop/mileage.asp?nismsid=${bundle.productId}`;
        try {
          const response = await get(`/ItemShop/mileage.asp?nismsid=${bundle.productId}`);
          bundle.mileageText = plainText(response).slice(0, 200);
          bundle.mileageRatePercent = parseShopMileage(response);
          if (bundle.mileageRatePercent === null) throw new Error('적립률을 확인하지 못했습니다.');
        } catch (error) {
          summary.pricingErrors.push(
            `${name} (${bundle.label}): ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      const pricing = {
        checkedAt: new Date(now).toISOString(),
        source: `https://mabinogi.nexon.com${path}`,
        bundles,
      };
      const previous = await getMeta(db, shopKey(id));
      if (!previous || JSON.stringify(JSON.parse(previous).bundles) !== JSON.stringify(bundles))
        summary.priced.push(name);
      await db.batch([
        setMeta(db, shopKey(id), JSON.stringify(pricing)),
        db
          .prepare('UPDATE kits SET price = ? WHERE id = ?')
          .bind(bundles.find((bundle) => bundle.units === 1).saleCash, id),
      ]);
    } catch (error) {
      summary.pricingErrors.push(`${name}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

/** 확률 정보 화면의 "확률형 이벤트 상품" 목록. [{ seq, name }] */
export function parseKitList(html) {
  return [...String(html).matchAll(/showEw2\((\d+)\)"[^>]*>([^<]+)</g)].map(([, seq, name]) => ({
    seq,
    name: decodeEntities(name).trim(),
  }));
}

/** "0.1457%" -> 0.001457. 숫자가 아니면 null. */
function parsePercent(text) {
  const value = Number(String(text ?? '').replace(/[%\s,]/g, ''));
  return Number.isFinite(value) && String(text ?? '').trim() !== '' ? value / 100 : null;
}

/** 아이템 이름 뒤에 붙은 "■color:FFF549" 를 떼어 색 목록으로. 8자리 코드의 앞 00 은 화면처럼 뗀다. */
function splitColors(raw) {
  const colors = [...raw.matchAll(/■color:([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})/g)].map(([, code]) =>
    (code.length === 8 && code.startsWith('00') ? code.slice(2) : code).toUpperCase(),
  );
  return {
    name: raw
      .replace(/■color:[0-9A-Fa-f]{6,8}/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    colors,
  };
}

/**
 * 키트 한 개의 확률표. 확률 정보 화면에 탭으로 나뉜 줄이 숨겨져 있다. [등급, 등급 확률, 아이템, 아이템 확률, ...].
 * 등급이 없는 키트는 등급 칸이 "없음" 이다. 등급은 나온 순서대로, 아이템은 등급 자리를 가리킨다.
 */
export function parseKitTable(html, seq) {
  const match = String(html).match(new RegExp(`id="ew_page_html_${seq}"[^>]*value="([^"]*)"`));
  if (!match) return null;
  const grades = [];
  const items = [];
  for (const line of decodeEntities(match[1]).split(/\r?\n/)) {
    const [gradeName = '', gradeChance = '', rawName = '', itemChance = ''] = line.split('\t');
    const chance = parsePercent(itemChance);
    if (!rawName.trim() || chance === null) continue;
    let grade = null;
    const gradeLabel = gradeName.trim();
    if (gradeLabel && gradeLabel !== '없음') {
      grade = grades.findIndex((each) => each.name === gradeLabel);
      if (grade < 0) {
        grade = grades.length;
        grades.push({ name: gradeLabel, chance: parsePercent(gradeChance) });
      }
    }
    const { name, colors } = splitColors(rawName);
    items.push({
      name,
      chance,
      ...(grade === null ? {} : { grade }),
      ...(colors.length ? { colors } : {}),
    });
  }
  return items.length ? { grades, items } : null;
}

/** "2026. 10. 1(목)" -> "2026-10-01". */
function parseKoreanDate(text) {
  const match = String(text).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
}

/** 공지 본문의 판매 가격(캐시)과 기간. 판매 정보가 그림에만 있고 그림 설명(alt)으로 적힌 공지도 있다. */
export function parseNotice(html) {
  const alts = [...String(html).matchAll(/alt="([^"]*)"/g)].map(([, alt]) => alt).join(' ');
  const text = `${plainText(html)} ${decodeEntities(alts)}`;
  const price = text.match(/판매\s*가격\s*:?\s*([\d,]+)\s*캐시/);
  const period = text.match(/판매\s*기간\s*:?\s*([^~]+)~\s*(\d{4}\.\s*\d{1,2}\.\s*\d{1,2})/);
  return {
    price: price ? Number(price[1].replace(/,/g, '')) : null,
    start: period ? parseKoreanDate(period[1]) : null,
    end: period ? parseKoreanDate(period[2]) : null,
  };
}

/** 한국 날짜 "YYYY-MM-DD". */
const kstDate = (now) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);

const KIT_COLUMNS = 'id, name, start, "end", price, first_seen, grades, items, item_count';

/** 받아 둔 공지 한 편의 마지막 판 본문. 없으면 null. */
async function noticeBody(db, id) {
  const row = await db
    .prepare(
      `SELECT r.body FROM news_posts p JOIN news_revisions r ON r.post_id = p.id AND r.rev = p.revisions
       WHERE p.id = ?`,
    )
    .bind(id)
    .first();
  return row ? row.body : null;
}

/**
 * 같은 이름의 판매 공지를 받아 둔 새소식에서 찾아 가격과 기간을 읽는다. 못 찾으면 null.
 * 본문(20KB 안팎)을 모두 읽지 않고 제목만 훑어 한 편을 고른 다음 그 본문만 읽는다. 키트마다 크론마다 부르기 때문이다.
 */
async function noticeInfo(db, name, nowSec) {
  const titles =
    (
      await db
        .prepare(
          `SELECT id, title FROM news_posts
           WHERE board = 'notice' AND deleted_at IS NULL AND posted_at >= ? ORDER BY posted_at DESC`,
        )
        .bind(nowSec - NOTICE_LOOKBACK_DAYS * 86400)
        .all()
    ).results ?? [];
  const wanted = squash(name);
  const notice = titles.find((row) => squash(row.title) === wanted);
  const body = notice ? await noticeBody(db, notice.id) : null;
  return body === null ? null : parseNotice(body);
}

/** 이 시간 안에 올라온 판매 공지의 키트는 확률 화면에 오를 때까지 기다려 본다. */
const WAIT_FOR_SALE_DAYS = 2;

/**
 * 판매 가격이나 기간이 적힌 최근 공지인데 같은 이름의 키트가 아직 기록에 없는가. 공지는 판매 시작보다 먼저 올라오기도
 * 해서 그때는 확률 화면에 그 키트가 없다. 있다면 한 시간을 기다리지 않고 크론마다 확률 화면을 다시 읽는다.
 * WAIT_FOR_SALE_DAYS 가 지나도 안 나타나는 공지(이름이 다른 공지 등)는 더 기다리지 않는다.
 */
export async function hasUnmatchedSaleNotice(db, nowSec) {
  const recent =
    (
      await db
        .prepare(
          `SELECT id, title FROM news_posts
           WHERE board = 'notice' AND deleted_at IS NULL AND posted_at >= ?
             AND category IN (${KIT_CATEGORIES.map(() => '?').join(',')})`,
        )
        .bind(nowSec - WAIT_FOR_SALE_DAYS * 86400, ...KIT_CATEGORIES)
        .all()
    ).results ?? [];
  if (recent.length === 0) return false;
  const known = new Set(
    ((await db.prepare('SELECT name FROM kits').all()).results ?? []).map((row) =>
      squash(row.name),
    ),
  );
  for (const notice of recent) {
    if (known.has(squash(notice.title))) continue;
    const body = await noticeBody(db, notice.id);
    if (body !== null && parseNotice(body).price !== null) return true;
  }
  return false;
}

/**
 * 한 번 모으기. 크론(새소식 크론 안에서 한 시간에 한 번)과 운영자의 POST /kits/collect 가 부른다.
 * options.get 으로 공식 홈페이지에 묻는 함수를 바꾼다(시험).
 */
export async function collectKits(env, now = Date.now(), options = {}) {
  const db = env.NEWS;
  if (!db) return { skipped: 'NEWS 바인딩이 없습니다.' };
  const get = options.get ?? nexonPageClient();
  const nowSec = Math.floor(now / 1000);
  const date = kstDate(now);
  const summary = {
    onSale: 0,
    added: [],
    changed: [],
    filled: [],
    errors: [],
    priced: [],
    pricingErrors: [],
  };

  const list = parseKitList(await get(PROB_PATH));
  summary.onSale = list.length;
  const statements = [];
  for (const { seq, name } of list) {
    try {
      const table = parseKitTable(await get(`${PROB_PATH}?seq=${seq}`), seq);
      if (!table) throw new Error('확률표를 읽지 못했습니다.');
      const id = `official-${seq}`;
      const stored = await db
        .prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE id = ?`)
        .bind(id)
        .first();
      const grades = JSON.stringify(table.grades);
      const items = JSON.stringify(table.items);
      // 가격과 기간은 판매 공지가 정한다. 공지를 고쳐 기간을 늘리거나 가격을 바로잡으면 그대로 따라간다.
      // 공지가 어느 값을 적지 않았거나 공지를 못 찾으면 기록해 둔 값을 그대로 둔다.
      const found = await noticeInfo(db, name, nowSec);
      const before = {
        price: stored?.price ?? null,
        start: stored?.start ?? null,
        end: stored?.end ?? null,
      };
      const info = {
        price: found?.price ?? before.price,
        start: found?.start ?? before.start,
        end: found?.end ?? before.end,
      };
      if (stored && JSON.stringify(info) !== JSON.stringify(before)) summary.filled.push(name);
      if (!stored) {
        statements.push(
          db
            .prepare(
              `INSERT INTO kits (id, name, start, "end", price, first_seen, grades, items, item_count, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
            )
            .bind(
              id,
              name,
              info.start,
              info.end,
              info.price,
              date,
              grades,
              items,
              table.items.length,
              nowSec,
            ),
        );
        summary.added.push(name);
        continue;
      }
      const tableChanged = stored.grades !== grades || stored.items !== items;
      if (tableChanged) summary.changed.push(name);
      if (
        tableChanged ||
        stored.name !== name ||
        stored.price !== info.price ||
        stored.start !== info.start ||
        stored.end !== info.end
      ) {
        statements.push(
          db
            .prepare(
              `UPDATE kits SET name = ?, start = ?, "end" = ?, price = ?, grades = ?, items = ?, item_count = ?,
               updated_at = CASE WHEN ? THEN ? ELSE updated_at END WHERE id = ?`,
            )
            .bind(
              name,
              info.start,
              info.end,
              info.price,
              grades,
              items,
              table.items.length,
              tableChanged ? 1 : 0,
              nowSec,
              id,
            ),
        );
      }
    } catch (error) {
      summary.errors.push(`${name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 지금 파는 키트. 목록을 읽지 못한 때(점검 화면 등)는 앞 목록을 그대로 둔다.
  if (list.length > 0) {
    const current = JSON.stringify(list.map(({ seq }) => `official-${seq}`));
    if ((await getMeta(db, 'kits_current')) !== current)
      statements.push(setMeta(db, 'kits_current', current));
  }
  if (summary.added.length || summary.changed.length || summary.filled.length)
    statements.push(setMeta(db, 'kits_updated', date));
  statements.push(setMeta(db, 'kits_at', nowSec));
  await db.batch(statements);
  await collectShopPricing(db, list, get, now, summary);
  if (summary.priced.length) await db.batch([setMeta(db, 'kits_updated', date)]);
  return summary;
}

/**
 * 모을 때가 되었으면 모은다. 새소식 크론이 공지를 받은 뒤에 부른다. 모으는 때는 셋이다.
 *   - force: 이번 크론에서 키트 공지(KIT_CATEGORIES)가 새로 왔거나 고쳐졌다. 확률표와 가격, 기간을 바로 받는다.
 *   - 판매 공지는 있는데 그 키트가 아직 기록에 없다(hasUnmatchedSaleNotice). 확률 화면에 오를 때까지 크론마다 본다.
 *   - 지난번에 모은 지 COLLECT_EVERY_SECONDS 가 지났다. 공지 없이 바뀐 확률표를 놓치지 않으려는 마지막 보루다.
 * 모았으면 이유(reason)를 결과에 적는다.
 */
export async function collectKitsIfDue(env, now = Date.now(), options = {}) {
  if (!env.NEWS) return { skipped: 'NEWS 바인딩이 없습니다.' };
  const nowSec = Math.floor(now / 1000);
  const last = Number(await getMeta(env.NEWS, 'kits_at')) || 0;
  let reason = null;
  if (options.force) reason = 'notice';
  else if (nowSec - last >= COLLECT_EVERY_SECONDS) reason = 'hourly';
  else if (await hasUnmatchedSaleNotice(env.NEWS, nowSec)) reason = 'waiting';
  if (!reason) return { skipped: 'not due' };
  return { reason, ...(await collectKits(env, now, options)) };
}

async function iconMap(db) {
  const rows = (await db.prepare('SELECT name, file FROM kit_icons').all()).results ?? [];
  return new Map(rows.map((row) => [row.name, row.file]));
}

/** 화면의 키트 목록. 최근에 판매를 시작한 것부터, 시작일을 모르면 처음 받은 날로. */
export async function kitIndex(db) {
  const [rows, icons, current, updated] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, start, "end", price, first_seen, item_count FROM kits
         ORDER BY COALESCE(start, first_seen) DESC, id DESC`,
      )
      .all(),
    iconMap(db),
    getMeta(db, 'kits_current'),
    getMeta(db, 'kits_updated'),
  ]);
  const ids = new Set((rows.results ?? []).map((row) => row.id));
  return {
    updated: updated ?? null,
    current: (current ? JSON.parse(current) : []).filter((id) => ids.has(id)),
    kits: (rows.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      start: row.start ?? null,
      end: row.end ?? null,
      price: row.price ?? null,
      ...(row.first_seen ? { firstSeen: row.first_seen } : {}),
      ...(icons.has(row.name) ? { icon: icons.get(row.name) } : {}),
      count: row.item_count,
    })),
  };
}

function kitOut(row) {
  return {
    id: row.id,
    name: row.name,
    start: row.start ?? null,
    end: row.end ?? null,
    price: row.price ?? null,
    ...(row.first_seen ? { firstSeen: row.first_seen } : {}),
    grades: JSON.parse(row.grades),
    items: JSON.parse(row.items),
  };
}

/** 키트 하나와 그 키트에 나오는 이름의 그림. 없으면 null. */
export async function kitById(db, id) {
  const row = await db.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE id = ?`).bind(id).first();
  if (!row) return null;
  const kit = kitOut(row);
  const pricing = await getMeta(db, shopKey(id));
  const all = await iconMap(db);
  const icons = {};
  for (const name of [kit.name, ...kit.items.map((item) => item.name)])
    if (all.has(name)) icons[name] = all.get(name);
  return { ...kit, ...(pricing ? { pricing: JSON.parse(pricing) } : {}), icons };
}

/** 아이템 이름의 키트 그림 파일. 아이템 정보가 사전에 없는 의장 등의 그림을 채울 때 쓴다. 없으면 null. */
export async function kitIconByName(db, name) {
  const row = await db.prepare('SELECT file FROM kit_icons WHERE name = ?').bind(name).first();
  return row ? { name, file: row.file } : null;
}

/** 기록 전체. 운영자 PC 가 그림 이름 표를 만들 때 키트와 보상 이름을 읽는다. */
export async function kitArchive(db) {
  const rows = (
    await db
      .prepare(`SELECT ${KIT_COLUMNS} FROM kits ORDER BY COALESCE(start, first_seen) DESC, id DESC`)
      .all()
  ).results;
  const pricingRows =
    (await db.prepare("SELECT key, value FROM news_meta WHERE key LIKE 'kit_shop:%'").all())
      .results ?? [];
  const prices = new Map(pricingRows.map(({ key, value }) => [key, JSON.parse(value)]));
  return {
    kits: (rows ?? []).map((row) => ({
      ...kitOut(row),
      ...(prices.has(shopKey(row.id)) ? { pricing: prices.get(shopKey(row.id)) } : {}),
    })),
    icons: Object.fromEntries(await iconMap(db)),
  };
}

const isNullableString = (value) =>
  value === null || value === undefined || typeof value === 'string';

/** 올린 키트 한 개가 화면이 읽을 수 있는 모양인가. */
function validKit(kit) {
  return (
    kit &&
    typeof kit.id === 'string' &&
    ID_PATTERN.test(kit.id) &&
    typeof kit.name === 'string' &&
    kit.name.length > 0 &&
    isNullableString(kit.start) &&
    isNullableString(kit.end) &&
    (kit.price === null || kit.price === undefined || Number.isInteger(kit.price)) &&
    Array.isArray(kit.grades) &&
    Array.isArray(kit.items) &&
    kit.items.length > 0 &&
    kit.items.every((item) => typeof item?.name === 'string' && typeof item.chance === 'number')
  );
}

async function runBatches(db, statements) {
  for (let at = 0; at < statements.length; at += BATCH)
    await db.batch(statements.slice(at, at + BATCH));
}

/**
 * 지난 키트를 한 번 올린다. { kits, current?, updated?, icons? }. 이미 있는 키트는 건드리지 않는다(더하기만).
 * icons 가 있으면 그 이름들의 그림을 더하거나 바꾼다.
 */
export async function importKits(db, body, now = Date.now()) {
  const kits = Array.isArray(body?.kits) ? body.kits : null;
  if (!kits) throw new Error('kits 가 없습니다.');
  const bad = kits.filter((kit) => !validKit(kit)).map((kit) => kit?.id ?? '(id 없음)');
  if (bad.length) throw new Error(`모양이 맞지 않는 키트: ${bad.slice(0, 5).join(', ')}`);
  const nowSec = Math.floor(now / 1000);
  const before = (await db.prepare('SELECT COUNT(*) AS n FROM kits').first())?.n ?? 0;
  const statements = kits.map((kit) =>
    db
      .prepare(
        `INSERT INTO kits (id, name, start, "end", price, first_seen, grades, items, item_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        kit.id,
        kit.name,
        kit.start ?? null,
        kit.end ?? null,
        kit.price ?? null,
        kit.firstSeen ?? null,
        JSON.stringify(kit.grades),
        JSON.stringify(kit.items),
        kit.items.length,
        nowSec,
      ),
  );
  const icons = body.icons && typeof body.icons === 'object' ? Object.entries(body.icons) : [];
  for (const [name, file] of icons)
    if (typeof file === 'string' && ICON_FILE.test(file))
      statements.push(
        db
          .prepare(
            'INSERT INTO kit_icons (name, file) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET file = excluded.file',
          )
          .bind(name, file),
      );
  if (Array.isArray(body.current) && !(await getMeta(db, 'kits_current')))
    statements.push(
      setMeta(db, 'kits_current', JSON.stringify(body.current.filter((id) => ID_PATTERN.test(id)))),
    );
  if (typeof body.updated === 'string' && !(await getMeta(db, 'kits_updated')))
    statements.push(setMeta(db, 'kits_updated', body.updated));
  await runBatches(db, statements);
  const after = (await db.prepare('SELECT COUNT(*) AS n FROM kits').first())?.n ?? 0;
  return { received: kits.length, added: after - before, icons: icons.length };
}

/** 그림 이름 표를 통째로 바꾼다. { icons: { 이름: 파일 } } */
export async function replaceKitIcons(db, body) {
  const icons = body?.icons && typeof body.icons === 'object' ? Object.entries(body.icons) : null;
  if (!icons) throw new Error('icons 가 없습니다.');
  const valid = icons.filter(
    ([name, file]) => name && typeof file === 'string' && ICON_FILE.test(file),
  );
  await runBatches(db, [
    db.prepare('DELETE FROM kit_icons'),
    ...valid.map(([name, file]) =>
      db.prepare('INSERT INTO kit_icons (name, file) VALUES (?, ?)').bind(name, file),
    ),
  ]);
  return { icons: valid.length, skipped: icons.length - valid.length };
}

function kitsError(name, message, status, cors) {
  return new Response(JSON.stringify({ error: { name, message } }), {
    status,
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function json(body, cors, cacheSeconds = 0, hit = null) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
      ...(hit === null ? {} : { 'x-kits-cache': hit ? 'hit' : 'miss' }),
    },
  });
}

/** GET /kits/index, GET /kits/kit?id=, GET /kits/icon?name= */
export async function kitsRead(request, url, env, cors) {
  if (!env.NEWS) return kitsError('KITS_NOT_CONFIGURED', '키트 기록이 아직 없습니다.', 503, cors);
  if (await rateLimited(request, env)) {
    return kitsError('KITS_RATE_LIMITED', '잠시 후 다시 시도해 주세요.', 429, cors);
  }
  if (url.pathname === KITS_INDEX_PATH) {
    const { body, hit } = await withEdgeCache(
      `https://kits.cache${KITS_INDEX_PATH}`,
      () => kitIndex(env.NEWS),
      CACHE_SECONDS,
    );
    return json(body, cors, CACHE_SECONDS, hit);
  }
  if (url.pathname === KITS_ICON_PATH) {
    const name = (url.searchParams.get('name') ?? '').trim();
    if (!name || name.length > ICON_NAME_MAX)
      return kitsError('KITS_BAD_NAME', '아이템 이름이 올바르지 않습니다.', 400, cors);
    const { body, hit } = await withEdgeCache(
      `https://kits.cache${KITS_ICON_PATH}?name=${encodeURIComponent(name)}`,
      () => kitIconByName(env.NEWS, name),
      CACHE_SECONDS,
    );
    if (body === 'null')
      return kitsError('KITS_NO_ICON', '키트 그림이 없는 아이템입니다.', 404, cors);
    return json(body, cors, CACHE_SECONDS, hit);
  }
  const id = url.searchParams.get('id') ?? '';
  if (!ID_PATTERN.test(id))
    return kitsError('KITS_BAD_ID', '키트 번호가 올바르지 않습니다.', 400, cors);
  const { body, hit } = await withEdgeCache(
    `https://kits.cache${KITS_KIT_PATH}?id=${id}`,
    () => kitById(env.NEWS, id),
    CACHE_SECONDS,
  );
  if (body === 'null') return kitsError('KITS_NOT_FOUND', '모아 둔 키트가 아닙니다.', 404, cors);
  return json(body, cors, CACHE_SECONDS, hit);
}

/** 운영자 경로. GET /kits/archive, POST /kits/import, POST /kits/icons, POST /kits/collect */
export async function kitsAdmin(request, url, env, cors) {
  if (!env.NEWS) return kitsError('KITS_NOT_CONFIGURED', '키트 기록이 아직 없습니다.', 503, cors);
  const want = url.pathname === KITS_ARCHIVE_PATH ? 'GET' : 'POST';
  if (request.method !== want) {
    return kitsError('KITS_METHOD_NOT_ALLOWED', `${want} 로 보내 주세요.`, 405, cors);
  }
  try {
    if (url.pathname === KITS_ARCHIVE_PATH) return json(await kitArchive(env.NEWS), cors);
    if (url.pathname === KITS_COLLECT_PATH) return json(await collectKits(env), cors);
    const body = await request.json().catch(() => null);
    if (url.pathname === KITS_IMPORT_PATH) return json(await importKits(env.NEWS, body), cors);
    return json(await replaceKitIcons(env.NEWS, body), cors);
  } catch (error) {
    return kitsError(
      'KITS_BAD_REQUEST',
      error instanceof Error ? error.message : String(error),
      400,
      cors,
    );
  }
}
