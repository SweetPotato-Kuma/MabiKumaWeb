import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const pageMeta = JSON.parse(await readFile(resolve(process.cwd(), 'src/app/pageMeta.json'), 'utf8'));

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

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * 경로마다 HTML 을 따로 굽는다.
 *
 * 404.html 로 떨어지는 경로는 화면은 떠도 응답 코드가 404 라서 검색엔진이 색인하지 않는다.
 * GitHub Pages 는 /auction 요청에 auction.html 이 있으면 그 파일을 200 으로 내준다.
 * 파일마다 제목과 설명을 그 화면 것으로 바꿔 두면 검색 결과에도 화면별 문구가 뜬다.
 */
function renderPage(page) {
  const title = escapeHtml(`${page.title} · ${pageMeta.siteName}`);
  const description = escapeHtml(page.description);
  const url = origin ? `${origin}${page.path}` : '';

  const head = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(pageMeta.siteName)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    ...(url ? [`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`] : []),
  ].join('\n    ');

  return indexHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
    .replace('</head>', `  ${head}\n  </head>`);
}

for (const page of pageMeta.pages) {
  // 같은 이름의 폴더가 있으면 GitHub Pages 가 /bags 를 /bags/ 로 돌려보낼 수 있다.
  // 그러면 구운 HTML 대신 404 로 떨어진다. 데이터 폴더 이름을 화면 경로와 겹치게 두지 않는다.
  if (await stat(resolve(distDir, page.path.slice(1))).catch(() => null)) {
    throw new Error(`[postbuild] dist${page.path} 폴더가 화면 경로 ${page.path} 와 겹칩니다.`);
  }
  await writeFile(resolve(distDir, `${page.path.slice(1)}.html`), renderPage(page));
}

if (origin) {
  const urls = pageMeta.pages.map((page) => `  <url><loc>${origin}${page.path}</loc></url>`).join('\n');
  await writeFile(
    resolve(distDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
  await writeFile(resolve(distDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
}

console.log(
  `[postbuild] 404.html, .nojekyll, 화면별 HTML ${pageMeta.pages.length}개` +
    (origin ? ', sitemap.xml, robots.txt 생성 완료' : ' 생성 완료 (CNAME 없음: sitemap 생략)'),
);
