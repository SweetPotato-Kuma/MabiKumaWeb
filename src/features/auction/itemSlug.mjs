/**
 * 아이템 이름과 아이템 한 장의 주소(/item/<slug>) 사이를 오간다.
 *
 * 빌드(scripts/postbuild.mjs)가 이 이름으로 아이템마다 HTML 파일을 굽고, 앱은 같은 규칙으로
 * 주소를 만들고 읽는다. 두 곳이 한 함수를 써야 구운 파일과 앱의 링크가 어긋나지 않는다.
 * 그래서 빌드 스크립트가 바로 읽을 수 있는 .mjs 로 둔다.
 *
 * 주소가 곧 파일 이름이라 윈도우에서도 만들 수 있는 글자만 남긴다. 이름에는 : / ? % & 같은
 * 글자가 섞여 있다. 한글, 영숫자, 괄호, 하이픈, 마침표는 그대로 두어 주소를 읽을 수 있게 하고,
 * 띄어쓰기는 _ 로, 나머지는 UTF-8 바이트마다 ~XX 로 적는다. 되돌릴 수 있어야 주소만 보고
 * 이름을 안다. 이름에 _ 나 ~ 가 있어도 ~XX 로 적히므로 겹치지 않는다.
 */

const KEEP = /^[가-힣0-9A-Za-z().-]$/;
const ESCAPE = /^~[0-9A-F]{2}/;

/** @param {string} name */
export function itemSlug(name) {
  let slug = '';
  for (const char of name) {
    if (char === ' ') slug += '_';
    else if (KEEP.test(char)) slug += char;
    else {
      for (const byte of new TextEncoder().encode(char)) {
        slug += `~${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    }
  }
  return slug;
}

/** @param {string} slug */
export function itemNameFromSlug(slug) {
  let name = '';
  /** @type {number[]} */
  let bytes = [];
  const flush = () => {
    if (bytes.length === 0) return;
    name += new TextDecoder().decode(new Uint8Array(bytes));
    bytes = [];
  };

  for (let index = 0; index < slug.length; ) {
    if (ESCAPE.test(slug.slice(index, index + 3))) {
      bytes.push(Number.parseInt(slug.slice(index + 1, index + 3), 16));
      index += 3;
      continue;
    }
    flush();
    name += slug[index] === '_' ? ' ' : slug[index];
    index += 1;
  }
  flush();
  return name;
}
