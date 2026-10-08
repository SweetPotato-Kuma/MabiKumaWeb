/**
 * 공식 홈페이지 본문 HTML 을 우리 화면에 그릴 수 있게 거른다.
 *
 * 워커는 본문을 받은 그대로 두므로(판 비교의 원본이다) 그릴 때 여기서 거른다.
 *   - 스크립트, 스타일 시트, 폼, 다른 페이지를 품는 틀은 지운다. 틀은 유튜브 영상만 남긴다.
 *   - on* 속성과 javascript: 주소를 지운다.
 *   - 상대 주소를 공식 홈페이지 주소로 바꾸고, 받아 둔 새소식 글로 가는 링크는 우리 기록(/news?id=)으로 잇는다.
 *   - 무채색 글자색, 밝은 바탕색, 글꼴 지정을 지운다. 공식 홈페이지는 흰 바탕에 검은 글자를 박아 두어
 *     다크 모드에서 글자가 사라진다. 빨강, 파랑처럼 뜻이 있는 색은 남긴다.
 */

const ORIGIN = 'https://mabinogi.nexon.com';
const BASE = `${ORIGIN}/page/news/`;

const DROP_TAGS = [
  'script',
  'style',
  'link',
  'meta',
  'base',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'noscript',
  'template',
];

const EMBED_HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/;
const NEWS_LINK =
  /^https?:\/\/mabinogi\.nexon\.com\/page\/news\/(?:notice|update|event)_view\.asp\?(?:.*&)?id=(\d+)/i;
const URL_ATTRS = ['href', 'src', 'poster', 'background'];

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NAMED: Record<string, Rgb> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 },
  silver: { r: 192, g: 192, b: 192 },
  dimgray: { r: 105, g: 105, b: 105 },
  darkgray: { r: 169, g: 169, b: 169 },
  lightgray: { r: 211, g: 211, b: 211 },
  whitesmoke: { r: 245, g: 245, b: 245 },
};

/** CSS 색 값. 읽을 수 없으면 null. */
export function parseColor(value: string): Rgb | null {
  let text = value.trim().toLowerCase();
  if (NAMED[text]) return NAMED[text];
  // HTML 의 color, bgcolor 속성은 # 없이 적기도 한다.
  if (/^[0-9a-f]{6}$/.test(text)) text = `#${text}`;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits =
      hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(text);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  return null;
}

/** 채도가 거의 없는 색(검정, 회색, 흰색). */
function isNeutral({ r, g, b }: Rgb): boolean {
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
}

function lightness({ r, g, b }: Rgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const COLOR_TOKEN = /#[0-9a-f]{3}(?:[0-9a-f]{3})?\b|rgba?\([^)]*\)|\b[a-z]+\b/gi;

/** background 줄임 값에서 색 하나를 찾는다. */
function findColor(value: string): Rgb | null {
  for (const token of value.replace(/url\([^)]*\)/gi, ' ').match(COLOR_TOKEN) ?? []) {
    const color = parseColor(token);
    if (color) return color;
  }
  return null;
}

/** 지울 바탕색. 밝은 바탕은 다크 모드에서 섬이 되고, 무채색 바탕은 테마 바탕과 부딪친다. */
function dropsBackground(value: string): boolean {
  const color = findColor(value);
  return color !== null && (isNeutral(color) || lightness(color) > 0.75);
}

function dropsColor(value: string): boolean {
  const color = parseColor(value);
  return color !== null && isNeutral(color);
}

/** style 속성을 걸러 다시 쓴다. 바탕을 남겼으면 그 위의 글자색도 남긴다. */
function cleanStyle(style: string): string {
  const declarations = style
    .split(';')
    .map((part) => {
      const at = part.indexOf(':');
      return at < 0
        ? null
        : { name: part.slice(0, at).trim().toLowerCase(), value: part.slice(at + 1).trim() };
    })
    .filter((each): each is { name: string; value: string } => each !== null && each.name !== '');
  const keepsBackground = declarations.some(
    ({ name, value }) =>
      (name === 'background' || name === 'background-color') && !dropsBackground(value),
  );
  return declarations
    .filter(({ name, value }) => {
      if (/expression\(|javascript:/i.test(value)) return false;
      if (name === 'font-family') return false;
      if (name === 'position' && /fixed|sticky/i.test(value)) return false;
      if (name === 'color') return keepsBackground || !dropsColor(value);
      if (name === 'background' || name === 'background-color') return !dropsBackground(value);
      return true;
    })
    .map(({ name, value }) => `${name}: ${value}`)
    .join('; ');
}

function absolute(value: string): string | null {
  const text = value.trim();
  if (/^(javascript|vbscript|data):/i.test(text)) return null;
  try {
    return new URL(text, BASE).toString();
  } catch {
    return null;
  }
}

/** 받아 둔 새소식 글로 가는 공식 홈페이지 링크면 그 글 번호. */
export function newsLinkId(href: string): number | null {
  const match = NEWS_LINK.exec(href);
  return match ? Number(match[1]) : null;
}

function cleanElement(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith('on') || name === 'srcset' || name === 'formaction') {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (URL_ATTRS.includes(name)) {
      const url = absolute(attribute.value);
      if (url) element.setAttribute(attribute.name, url);
      else element.removeAttribute(attribute.name);
    }
  }

  const style = element.getAttribute('style');
  if (style !== null) {
    const cleaned = cleanStyle(style);
    if (cleaned) element.setAttribute('style', cleaned);
    else element.removeAttribute('style');
  }

  const tag = element.tagName.toLowerCase();
  if (tag === 'font') {
    const color = element.getAttribute('color');
    if (color && dropsColor(color)) element.removeAttribute('color');
    element.removeAttribute('face');
  }
  for (const attribute of ['bgcolor', 'background']) {
    const value = element.getAttribute(attribute);
    if (value !== null && (attribute === 'background' || dropsBackground(value)))
      element.removeAttribute(attribute);
  }

  if (tag === 'a') {
    const href = element.getAttribute('href');
    const id = href ? newsLinkId(href) : null;
    if (id !== null) {
      element.setAttribute('href', `/news?id=${id}`);
      element.removeAttribute('target');
    } else if (href) {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
  if (tag === 'img') element.setAttribute('loading', 'lazy');
}

/** 본문 HTML 을 걸러 다시 HTML 로. */
export function sanitizeNewsHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const tag of DROP_TAGS)
    for (const element of [...doc.body.querySelectorAll(tag)]) element.remove();
  for (const frame of [...doc.body.querySelectorAll('iframe')]) {
    const src = absolute(frame.getAttribute('src') ?? '');
    let host = '';
    try {
      host = src ? new URL(src).hostname : '';
    } catch {
      host = '';
    }
    if (!src || !EMBED_HOSTS.test(host)) frame.remove();
  }
  for (const element of [...doc.body.querySelectorAll('*')]) cleanElement(element);
  return doc.body.innerHTML;
}
