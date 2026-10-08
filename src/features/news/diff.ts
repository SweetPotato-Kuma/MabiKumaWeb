/**
 * 새소식 판 비교. 본문 HTML 을 읽는 글 줄로 바꿔 줄끼리 비교하고, 바뀐 줄 안에서는 낱말끼리 비교한다.
 *
 * HTML 을 그대로 비교하면 글자는 같은데 꾸밈(style)만 바뀐 곳까지 잡힌다. 방문자가 알고 싶은 것은 읽는 글이
 * 어떻게 바뀌었는지라 글로 바꿔 비교한다. 그림은 파일 이름으로 한 줄을 만든다. 그림만 바꾼 이벤트 글도 잡힌다.
 */

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
]);

/** 본문 HTML -> 읽는 글 줄. 빈 줄은 뺀다. */
export function htmlToLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const element of [...doc.body.querySelectorAll('script, style, noscript, template')])
    element.remove();
  const out: string[] = [];
  let current = '';
  const flush = () => {
    const line = current.replace(/\s+/g, ' ').trim();
    if (line) out.push(line);
    current = '';
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    if (tag === 'br') {
      flush();
      return;
    }
    if (tag === 'img') {
      flush();
      const src = element.getAttribute('src') ?? '';
      const file = src.split(/[?#]/)[0].split('/').pop() ?? '';
      out.push(`[그림] ${file || element.getAttribute('alt') || ''}`.trim());
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) flush();
    for (const child of [...element.childNodes]) walk(child);
    if (block) flush();
  };
  walk(doc.body);
  flush();
  return out;
}

export type DiffKind = 'same' | 'add' | 'del';

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/**
 * 가장 긴 공통 부분열로 두 목록을 비교한다. 앞뒤의 같은 부분을 먼저 떼어 표를 작게 만든다.
 * 공지 한 편은 길어야 수백 줄이라 표로 충분하다.
 */
function diffSequences<T>(before: T[], after: T[]): { kind: DiffKind; value: T }[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start])
    start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1;
    endAfter -= 1;
  }
  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const middle: { kind: DiffKind; value: T }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      middle.push({ kind: 'same', value: a[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      middle.push({ kind: 'del', value: a[i] });
      i += 1;
    } else {
      middle.push({ kind: 'add', value: b[j] });
      j += 1;
    }
  }
  while (i < a.length) middle.push({ kind: 'del', value: a[i++] });
  while (j < b.length) middle.push({ kind: 'add', value: b[j++] });
  return [
    ...before.slice(0, start).map((value) => ({ kind: 'same' as const, value })),
    ...middle,
    ...before.slice(endBefore).map((value) => ({ kind: 'same' as const, value })),
  ];
}

export function diffLines(before: string[], after: string[]): DiffLine[] {
  return diffSequences(before, after).map(({ kind, value }) => ({ kind, text: value }));
}

export interface WordPiece {
  text: string;
  changed: boolean;
}

/** 바뀐 줄 한 쌍을 낱말끼리 비교한다. 띄어쓰기도 한 조각으로 두어 줄 끝 낱말이 띄어쓰기 때문에 달라 보이지 않게 한다. */
export function diffWords(
  before: string,
  after: string,
): { before: WordPiece[]; after: WordPiece[] } {
  const split = (text: string) => text.match(/\S+|\s+/g) ?? [];
  const pieces = diffSequences(split(before), split(after));
  const side = (keep: DiffKind) => {
    const out: WordPiece[] = [];
    for (const { kind, value } of pieces) {
      if (kind !== 'same' && kind !== keep) continue;
      const changed = kind !== 'same';
      const last = out.at(-1);
      if (last && last.changed === changed) last.text += value;
      else out.push({ text: value, changed });
    }
    return out;
  };
  return { before: side('del'), after: side('add') };
}

/** 두 줄이 낱말로 얼마나 겹치는가(0~1). 같은 낱말 수의 두 배를 두 줄의 낱말 수 합으로 나눈다. */
function similarity(before: string, after: string): number {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  if (a.length + b.length === 0) return 1;
  const same = diffSequences(a, b).filter((piece) => piece.kind === 'same').length;
  return (2 * same) / (a.length + b.length);
}

/** 이만큼 겹치면 한 줄을 고친 것으로 보고 짝지어 낱말 단위로 칠한다. */
const PAIR_SIMILARITY = 0.4;

/**
 * 지운 줄마다 순서를 지키며 가장 먼저 나오는 비슷한 더한 줄을 짝짓는다. [지운 줄 번호, 더한 줄 번호] 목록.
 * 한 줄을 고치면서 아래에 줄을 더하는 일이 흔해 수가 달라도 짝을 찾는다.
 */
function pairLines(dels: string[], adds: string[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let from = 0;
  dels.forEach((del, d) => {
    for (let a = from; a < adds.length; a += 1) {
      if (similarity(del, adds[a]) >= PAIR_SIMILARITY) {
        pairs.set(d, a);
        from = a + 1;
        return;
      }
    }
  });
  return pairs;
}

export type DiffRow =
  | { kind: 'same'; text: string }
  | { kind: 'del' | 'add'; text: string; pieces?: WordPiece[] }
  | { kind: 'skip'; count: number };

/**
 * 화면에 보일 줄. 바뀐 곳 앞뒤로 context 줄만 남기고 나머지 같은 줄은 "같은 줄 n개" 한 줄로 접는다.
 * 지운 줄과 더한 줄 가운데 비슷한 것끼리 짝지어 낱말 단위로 칠한다. 짝이 없는 줄은 줄째로 칠한다.
 */
export function diffRows(lines: DiffLine[], context = 2): DiffRow[] {
  const near = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.kind === 'same') return;
    for (
      let k = Math.max(0, index - context);
      k <= Math.min(lines.length - 1, index + context);
      k += 1
    )
      near[k] = true;
  });

  const rows: DiffRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.kind === 'same') {
      if (near[index]) {
        rows.push({ kind: 'same', text: line.text });
        index += 1;
        continue;
      }
      let count = 0;
      while (index < lines.length && lines[index].kind === 'same' && !near[index]) {
        count += 1;
        index += 1;
      }
      rows.push({ kind: 'skip', count });
      continue;
    }
    const dels: string[] = [];
    const adds: string[] = [];
    while (index < lines.length && lines[index].kind === 'del') dels.push(lines[index++].text);
    while (index < lines.length && lines[index].kind === 'add') adds.push(lines[index++].text);
    const pairs = pairLines(dels, adds);
    const addPieces = new Map<number, WordPiece[]>();
    dels.forEach((text, d) => {
      const a = pairs.get(d);
      if (a === undefined) {
        rows.push({ kind: 'del', text });
        return;
      }
      const words = diffWords(text, adds[a]);
      addPieces.set(a, words.after);
      rows.push({ kind: 'del', text, pieces: words.before });
    });
    adds.forEach((text, a) => {
      const pieces = addPieces.get(a);
      rows.push(pieces ? { kind: 'add', text, pieces } : { kind: 'add', text });
    });
  }
  return rows;
}
