import { createHash } from 'node:crypto';

/**
 * IndexNow. 주소가 새로 생기거나 바뀌면 검색엔진에 바로 알린다.
 *
 * 한 곳(api.indexnow.org)에 보내면 참여하는 검색엔진(네이버, Bing 등)이 나눠 받는다. 구글은 참여하지 않는다.
 * 키는 비밀이 아니다. 사이트 루트의 <키>.txt 에 같은 값을 올려 두어 이 사이트의 주인이 보낸 것임을 보인다.
 */
export const INDEXNOW_KEY = '4e5e4fef47c8c2d38f6513004076ef2c';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** 한 번에 보낼 수 있는 주소 수의 상한. */
export const MAX_URLS_PER_REQUEST = 10_000;

/** 무엇이 바뀌었는지 비교하려고 빌드가 함께 올리는 파일. 경로마다 지문을 적는다. */
export const MANIFEST_FILE = 'indexnow.json';

/**
 * 한 쪽의 지문. 제목, 설명, 본문만 본다.
 * HTML 에는 빌드마다 이름이 바뀌는 스크립트 주소가 들어 있어 파일 전체를 보면 매번 다 바뀐 것이 된다.
 * 앱 코드만 고친 배포로 만 개를 다시 알리면 검색엔진이 알림을 믿지 않게 된다.
 */
export function fingerprint(...parts) {
  return createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 12);
}

/**
 * 알릴 경로. 새로 생겼거나 지문이 바뀐 쪽, 그리고 없어진 쪽이다. 없어진 쪽도 알려야 검색엔진이
 * 다시 와서 404 를 보고 색인에서 뺀다. 옛 목록이 없으면(첫 배포) 전부 새 쪽이다.
 *
 * @param {Record<string, string>} previous
 * @param {Record<string, string>} next
 */
export function changedPaths(previous, next) {
  const changed = Object.keys(next).filter((path) => previous[path] !== next[path]);
  const removed = Object.keys(previous).filter((path) => !(path in next));
  return [...changed, ...removed];
}

/** 보낼 본문들. 상한을 넘으면 나눈다. */
export function submissions(origin, urls) {
  const host = new URL(origin).host;
  const batches = [];
  for (let start = 0; start < urls.length; start += MAX_URLS_PER_REQUEST) {
    batches.push({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${origin}/${INDEXNOW_KEY}.txt`,
      urlList: urls.slice(start, start + MAX_URLS_PER_REQUEST),
    });
  }
  return batches;
}
