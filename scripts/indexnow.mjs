import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { INDEXNOW_ENDPOINT, MANIFEST_FILE, changedPaths, submissions } from './lib/indexnow.mjs';

/**
 * 배포 워크플로(.github/workflows/deploy.yml)가 두 번 부른다.
 *
 *   node scripts/indexnow.mjs prepare <목록 파일>
 *     배포 전에 부른다. 지금 올라가 있는 사이트의 indexnow.json 과 방금 빌드한 dist 의 것을 비교해
 *     알릴 주소를 목록 파일에 적는다. 배포가 끝나면 비교할 옛 판이 사라지므로 미리 해 둔다.
 *
 *   node scripts/indexnow.mjs submit <목록 파일>
 *     배포가 끝난 뒤 부른다. 새 쪽과 키 파일이 올라간 다음이어야 검색엔진이 와서 확인할 수 있다.
 *
 * 알리는 일이 실패해도 배포를 실패로 만들지 않는다. 알리지 않아도 검색엔진은 sitemap 으로 결국 찾아온다.
 */
const [command, listFile] = process.argv.slice(2);
if (!['prepare', 'submit'].includes(command) || !listFile) {
  console.error('사용법: node scripts/indexnow.mjs prepare|submit <목록 파일>');
  process.exit(1);
}

if (command === 'prepare') {
  const distDir = resolve(process.cwd(), 'dist');
  const next = JSON.parse(await readFile(resolve(distDir, MANIFEST_FILE), 'utf8').catch(() => 'null'));
  if (!next) {
    console.log('[indexnow] dist 에 목록이 없습니다(CNAME 없는 빌드). 알리지 않습니다.');
    process.exit(0);
  }

  const response = await fetch(`${next.origin}/${MANIFEST_FILE}`).catch(() => null);
  // 404 는 이 기능을 처음 배포할 때다. 전부 새 쪽으로 본다. 그 밖의 실패는 비교할 수 없으니 이번엔 건너뛴다.
  if (!response || (!response.ok && response.status !== 404)) {
    console.warn(`[indexnow] 올라가 있는 목록을 받지 못했습니다(${response?.status ?? '연결 실패'}). 이번 배포는 알리지 않습니다.`);
    process.exit(0);
  }
  const previous = response.ok ? (await response.json()).pages : {};
  const paths = changedPaths(previous, next.pages);
  await writeFile(listFile, paths.map((path) => `${next.origin}${encodeURI(path)}`).join('\n'));
  console.log(`[indexnow] 알릴 주소 ${paths.length}개 (전체 ${Object.keys(next.pages).length}개 중)`);
}

if (command === 'submit') {
  const urls = (await readFile(listFile, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  if (urls.length === 0) {
    console.log('[indexnow] 바뀐 주소가 없습니다.');
    process.exit(0);
  }

  for (const body of submissions(new URL(urls[0]).origin, urls)) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    }).catch((error) => error);
    if (response instanceof Error) {
      console.warn(`[indexnow] ${body.urlList.length}개를 보내지 못했습니다: ${response.message}`);
      continue;
    }
    // 200 은 받음, 202 는 받았고 키 확인은 나중에 한다는 뜻이다. 둘 다 성공이다.
    const detail = response.ok ? '' : ` ${await response.text().catch(() => '')}`;
    console.log(`[indexnow] ${body.urlList.length}개 보냄: ${response.status}${detail}`);
  }
}
