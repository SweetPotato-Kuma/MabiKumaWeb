import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { itemSlug } from '../src/features/auction/itemSlug.mjs';
import { INDEXNOW_KEY, MANIFEST_FILE, fingerprint } from './lib/indexnow.mjs';
import { collectItemPages, escapeHtml, renderItemBody } from './lib/item-pages.mjs';
import { publishedGameData } from './lib/published-game-data.mjs';

const distDir = resolve(process.cwd(), 'dist');
const pageMeta = JSON.parse(
  await readFile(resolve(process.cwd(), 'src/app/pageMeta.json'), 'utf8'),
);

const indexHtml = await readFile(resolve(distDir, 'index.html'), 'utf8');

// GitHub Pages 는 SPA 라우팅을 모르므로, 없는 경로는 404.html 로 떨어진다.
// index.html 을 그대로 복사해두면 새로고침/직접 진입에서도 앱이 뜬다.
await copyFile(resolve(distDir, 'index.html'), resolve(distDir, '404.html'));

// Jekyll 처리 비활성화 (_로 시작하는 에셋 파일이 무시되는 것을 방지)
await writeFile(resolve(distDir, '.nojekyll'), '');

/**
 * 사이트 주소. 커스텀 도메인은 CNAME 한 곳에만 적혀 있으므로 거기서 읽는다.
 * 없으면 github.io 하위 경로로 도는 배포라 주소를 확정할 수 없다. 그때는 canonical 과
 * sitemap 을 만들지 않는다. 틀린 주소를 검색엔진에 알려 주느니 알려 주지 않는 편이 낫다.
 */
const cname = await readFile(resolve(distDir, 'CNAME'), 'utf8').catch(() => '');
const origin = cname.trim() ? `https://${cname.trim()}` : '';

/**
 * 링크를 붙여 넣으면 뜨는 미리보기 그림. 메신저는 상대 주소를 읽지 못하므로 사이트 주소를 알 때만 싣는다.
 * 그림은 public/og-image.png 이고 1200x630 이다. 크기를 적어 두면 첫 공유부터 그림이 뜬다.
 */
const ogImageTags = origin
  ? [
      `<meta property="og:image" content="${origin}/og-image.png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${escapeHtml(pageMeta.siteName)} 로고" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ]
  : [];

/** 구조화 데이터. 스크립트 안에 </script> 가 끼지 않게 < 를 풀어 적는다. */
function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;
}

/**
 * 사이트 이름. 로고가 그림뿐이고 예전 제목은 영어 이름만 적혀 있어 "마비쿠마" 로 찾으면 걸리지 않았다.
 * 구글은 첫 화면의 WebSite 구조화 데이터로 검색 결과에 띄울 사이트 이름을 정한다.
 * 첫 화면(/)은 경매장으로 넘어가므로 화면별 HTML 에도 같이 싣는다.
 */
const websiteLd = origin
  ? [
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: pageMeta.siteName,
        alternateName: [pageMeta.alternateName, '마비 쿠마'],
        url: `${origin}/`,
        inLanguage: 'ko',
      }),
    ]
  : [];

// 없는 주소(404.html)에도 그림과 사이트 이름을 싣는다. canonical 은 달지 않는다. 없는 주소가 모두
// 첫 화면의 사본으로 읽히면 안 된다. 첫 화면(index.html)은 아래에서 화면별 HTML 과 같은 방식으로 굽는다.
const rootHead = [...ogImageTags, ...websiteLd];
if (rootHead.length) {
  await writeFile(
    resolve(distDir, '404.html'),
    indexHtml.replace('</head>', `  ${rootHead.join('\n    ')}\n  </head>`),
  );
}

/**
 * 경로 하나의 HTML. index.html 의 제목과 설명을 그 경로 것으로 바꾸고, 본문이 있으면 #root 안에 넣는다.
 * 본문은 앱이 뜨면 앱 화면으로 바뀐다.
 */
/** 구운 쪽마다 지문. 다음 배포 때 무엇이 바뀌었는지 IndexNow 로 알리는 데 쓴다(scripts/indexnow.mjs). */
const fingerprints = {};

function renderHtml({ path, title, description, head = [], body = '' }) {
  fingerprints[path] = fingerprint(title, description, body);
  const url = origin ? `${origin}${encodeURI(path)}` : '';
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);

  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(pageMeta.siteName)}" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDescription}" />`,
    ...(url
      ? [`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`]
      : []),
    ...ogImageTags,
    ...head,
  ].join('\n    ');

  return indexHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${safeDescription}" />`,
    )
    .replace('</head>', `  ${tags}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

/**
 * 화면이 뜨자마자 쓸 데이터를 HTML 이 먼저 받게 한다. 앱 코드를 받고 실행하는 동안 파일도 함께
 * 받아 두어, 화면이 그 파일을 부를 때는 이미 와 있다. 복원 시뮬레이터는 누르자마자 시세를 붙여야
 * 해서 시세 파일(src/features/relics/priceFile.ts)을 이렇게 받는다. fetch 와 같은 방식(CORS,
 * 쿠키 없음)이어야 브라우저가 받아 둔 것을 쓴다. CDN 주소를 모르는 빌드에서는 넣지 않는다.
 */
const iconBase = String(process.env.VITE_ICON_BASE_URL ?? '').replace(/\/+$/, '');
const PAGE_PRELOADS = { '/relic-simulator': ['prices/murias-relics.js'] };
const preloadTags = (path) =>
  iconBase
    ? (PAGE_PRELOADS[path] ?? []).map(
        (file) =>
          `<link rel="preload" href="${iconBase}/${file}" as="fetch" crossorigin="anonymous" />`,
      )
    : [];

/**
 * 경로마다 HTML 을 따로 굽는다.
 *
 * 404.html 로 떨어지는 경로는 화면은 떠도 응답 코드가 404 라서 검색엔진이 색인하지 않는다.
 * GitHub Pages 는 /auction 요청에 auction.html 이 있으면 그 파일을 200 으로 내준다.
 * 파일마다 제목과 설명을 그 화면 것으로 바꿔 두면 검색 결과에도 화면별 문구가 뜬다.
 */
for (const page of pageMeta.pages) {
  // 같은 이름의 폴더가 있으면 GitHub Pages 가 /bags 를 /bags/ 로 돌려보낼 수 있다.
  // 그러면 구운 HTML 대신 404 로 떨어진다. 데이터 폴더 이름을 화면 경로와 겹치게 두지 않는다.
  if (await stat(resolve(distDir, page.path.slice(1))).catch(() => null)) {
    throw new Error(`[postbuild] dist${page.path} 폴더가 화면 경로 ${page.path} 와 겹칩니다.`);
  }
  await writeFile(
    resolve(distDir, `${page.path.slice(1)}.html`),
    renderHtml({
      path: page.path,
      title: `${page.title} · ${pageMeta.siteName}`,
      description: page.description,
      head: [...websiteLd, ...preloadTags(page.path)],
    }),
  );
}

/**
 * 첫 화면(/). 구글은 검색 결과에 띄울 사이트 이름(WebSite)과 아이콘을 이 쪽에서만 읽는다.
 * canonical 을 자기 자신으로 달고, 본문에 화면마다 링크를 넣어 자바스크립트를 돌리기 전에도
 * 사이트 안을 따라 들어올 수 있게 한다. 다른 화면 HTML 은 #root 가 비어 링크가 하나도 없었다.
 */
function renderHomeBody() {
  const links = pageMeta.pages.map(
    (page) =>
      `<li><a href="${escapeHtml(encodeURI(page.path))}">${escapeHtml(page.title)}</a>: ${escapeHtml(page.description)}</li>`,
  );
  return [
    `<main style="visibility:hidden;max-width:960px;margin:0 auto;padding:24px 16px;line-height:1.6">`,
    `<h1>${escapeHtml(pageMeta.siteName)}</h1>`,
    `<p>${escapeHtml(pageMeta.defaultDescription)}</p>`,
    '<ul>',
    ...links,
    '</ul>',
    '</main>',
  ].join('\n');
}

await writeFile(
  resolve(distDir, 'index.html'),
  renderHtml({
    path: '/',
    title: pageMeta.defaultTitle,
    description: pageMeta.defaultDescription,
    head: websiteLd,
    body: renderHomeBody(),
  }),
);

/**
 * 아이템마다 HTML 을 굽는다. /item/<slug> 가 item/<slug>.html 로 200 을 받는다.
 *
 * 앱은 아이템 상세를 /item/<slug> 한 경로에서 그린다. 예전처럼 쿼리에 이름을 두면 모든 아이템이
 * /items 한 쪽의 중복으로 읽혀 아이템 이름으로 찾아도 걸리지 않았다. 제목과 설명 문구는 앱이
 * 탭 제목을 바꿀 때 쓰는 것과 같은 pageMeta.json 의 item 을 쓴다.
 */
const itemPrefix = pageMeta.item.pathPrefix;
const itemPath = (name) => `${itemPrefix}${itemSlug(name)}`;
const fill = (template, name) => template.replaceAll('{name}', name);

const published = await publishedGameData();
const [names, recipes] = await Promise.all([
  published.read('items/names.json'),
  published.read('recipes.json'),
]);
const itemPages = collectItemPages(names, recipes);
console.log(`[postbuild] 게임 데이터 ${published.manifest.revision}, 아이템 ${itemPages.length}쪽`);
const known = new Set(itemPages.map((page) => page.name));

if (itemPages.length) {
  const itemDir = resolve(distDir, itemPrefix.slice(1, -1));
  if (pageMeta.pages.some((page) => page.path === itemPrefix.slice(0, -1))) {
    throw new Error(`[postbuild] 아이템 폴더 ${itemPrefix} 가 화면 경로와 겹칩니다.`);
  }
  await mkdir(itemDir, { recursive: true });

  // 만 개가 넘는다. 한 번에 다 열면 파일 핸들이 모자랄 수 있어 나눠 쓴다.
  const BATCH = 200;
  for (let start = 0; start < itemPages.length; start += BATCH) {
    await Promise.all(
      itemPages.slice(start, start + BATCH).map((page) => {
        const path = itemPath(page.name);
        const breadcrumb = origin
          ? [
              jsonLd({
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: pageMeta.siteName, item: `${origin}/` },
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: '아이템 정보',
                    item: `${origin}/items`,
                  },
                  {
                    '@type': 'ListItem',
                    position: 3,
                    name: page.name,
                    item: `${origin}${encodeURI(path)}`,
                  },
                ],
              }),
            ]
          : [];
        const html = renderHtml({
          path,
          title: `${fill(pageMeta.item.title, page.name)} · ${pageMeta.siteName}`,
          description: fill(pageMeta.item.description, page.name),
          head: breadcrumb,
          body: renderItemBody(page, {
            siteName: pageMeta.siteName,
            itemPath: (name) => encodeURI(itemPath(name)),
            known,
          }),
        });
        return writeFile(resolve(itemDir, `${page.slug}.html`), html);
      }),
    );
  }
}

/**
 * 옮겨 간 화면의 예전 주소.
 *
 * GitHub Pages 는 서버 쪽 301 을 걸 수 없다. 그래서 예전 경로에 작은 HTML 을 굽고, 그 안에서
 * 새 주소를 canonical 로 알리고 바로 넘긴다. 구글은 이 둘을 옮겨 간 신호로 읽는다.
 * 쿼리(카테고리, 이름, 장비 조합)를 들고 가야 복사해 둔 링크가 살아서 스크립트로 넘긴다.
 * 스크립트가 없는 곳을 위해 meta refresh 를 noscript 에 둔다. 이쪽은 쿼리를 잃는다.
 * sitemap 에는 새 주소만 싣는다.
 */
function renderRedirect(redirect) {
  const target = pageMeta.pages.find((page) => page.path === redirect.to);
  if (!target)
    throw new Error(
      `[postbuild] ${redirect.from} 가 가리키는 ${redirect.to} 가 pages 에 없습니다.`,
    );
  const title = escapeHtml(`${target.title} · ${pageMeta.siteName}`);
  const to = escapeHtml(redirect.to);
  const canonical = origin ? `\n    <link rel="canonical" href="${origin}${to}" />` : '';

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>${canonical}
    <script>location.replace(${JSON.stringify(redirect.to)} + location.search + location.hash);</script>
    <noscript><meta http-equiv="refresh" content="0; url=${to}" /></noscript>
  </head>
  <body>
    <p>주소가 바뀌었습니다. <a href="${to}">새 주소</a>로 이동합니다.</p>
  </body>
</html>
`;
}

for (const redirect of pageMeta.redirects) {
  if (await stat(resolve(distDir, redirect.from.slice(1))).catch(() => null)) {
    throw new Error(
      `[postbuild] dist${redirect.from} 폴더가 예전 경로 ${redirect.from} 와 겹칩니다.`,
    );
  }
  await writeFile(resolve(distDir, `${redirect.from.slice(1)}.html`), renderRedirect(redirect));
}

/**
 * sitemap 은 화면과 아이템을 파일 둘로 나누고 sitemap.xml 을 그 둘의 목록으로 둔다.
 * 파일 하나에 5만 개까지 실을 수 있지만, 나눠 두면 서치 콘솔에서 아이템 쪽이 얼마나 색인됐는지 따로 보인다.
 * robots.txt 가 예전부터 sitemap.xml 을 가리켜 왔으므로 이름은 그대로 둔다.
 */
if (origin) {
  const urlset = (paths) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
      .map((path) => `  <url><loc>${escapeHtml(`${origin}${encodeURI(path)}`)}</loc></url>`)
      .join('\n')}\n</urlset>\n`;
  const sitemaps = [
    ['sitemap-pages.xml', ['/', ...pageMeta.pages.map((page) => page.path)]],
    ...(itemPages.length
      ? [['sitemap-items.xml', itemPages.map((page) => itemPath(page.name))]]
      : []),
  ];
  for (const [file, paths] of sitemaps) await writeFile(resolve(distDir, file), urlset(paths));
  await writeFile(
    resolve(distDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps
      .map(([file]) => `  <sitemap><loc>${origin}/${file}</loc></sitemap>`)
      .join('\n')}\n</sitemapindex>\n`,
  );
  await writeFile(
    resolve(distDir, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
  );

  // IndexNow 키 파일과 쪽별 지문. 키 파일은 검색엔진이 알림을 보낸 곳이 이 사이트인지 확인하는 데 쓴다.
  await writeFile(resolve(distDir, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);
  await writeFile(resolve(distDir, MANIFEST_FILE), JSON.stringify({ origin, pages: fingerprints }));
}

console.log(
  `[postbuild] 404.html, .nojekyll, 화면별 HTML ${pageMeta.pages.length}개, 아이템 HTML ${itemPages.length}개, 옮긴 주소 ${pageMeta.redirects.length}개` +
    (origin ? ', sitemap.xml, robots.txt 생성 완료' : ' 생성 완료 (CNAME 없음: sitemap 생략)'),
);
