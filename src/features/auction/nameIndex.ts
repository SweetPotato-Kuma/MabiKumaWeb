import { queryOptions, useQuery } from '@tanstack/react-query';
import { normalizeForSearch } from './dictionary';

/**
 * 전체 카테고리 자동완성.
 *
 * 카테고리별 사전 파일은 80개가 넘어 전체를 뒤지려고 다 받을 수는 없다. 수집기가 이름과
 * 카테고리 번호만 담은 names.json 을 따로 떨어뜨려 두고, 여기서 그 한 파일을 받는다.
 * 15,000개 남짓, gzip 120KB 정도라 한 번 받으면 다시 받지 않는다.
 *
 * 빠르게 보이게 하는 핵심은 "매 글자마다 하는 일"을 줄이는 것이다. 띄어쓰기 제거,
 * 소문자화, 초성 추출은 파일을 받았을 때 한 번만 해 두고, 타이핑 때는 문자열 찾기만 한다.
 */

interface RawNameIndex {
  updated: string;
  categories: string[];
  items: [name: string, categoryIndex: number][];
}

export interface NameIndex {
  updated: string;
  categories: string[];
  names: string[];
  /** 이름마다 카테고리 번호. names 와 같은 순서다. */
  categoryOf: number[];
  /** 띄어쓰기를 지우고 소문자로 바꾼 이름. 부분 일치에 쓴다. */
  normalized: string[];
  /** 초성만 뽑은 이름. "ㅅㅅㄷ" 같은 입력에 쓴다. */
  initials: string[];
  /** 같은 이름이 여러 카테고리에 있는지 보기 위한 표. */
  categoriesByName: Map<string, string[]>;
}

export interface NameSuggestion {
  name: string;
  /** 이 이름이 관측된 카테고리. 대부분 하나지만 둘 이상일 수 있다. */
  categories: string[];
}

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
/** 한글 음절 하나에서 초성이 바뀌는 간격. 중성 21개 × 종성 28개. */
const SYLLABLES_PER_INITIAL = 588;
const INITIALS = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/** 자음으로만 된 입력. 초성 검색으로 본다. */
const ONLY_CONSONANTS = /^[ㄱ-ㅎ]+$/;
/** 입력기가 글자를 조립하는 중이면 끝에 낱자가 붙어 온다. "숏ㅅ" 같은 식이다. */
const TRAILING_JAMO = /[ㄱ-ㅎㅏ-ㅣ]$/;

/** 한글 음절은 초성으로 바꾸고 나머지 글자는 그대로 둔다. */
export function toInitials(text: string): string {
  let result = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      result += INITIALS[Math.floor((code - HANGUL_START) / SYLLABLES_PER_INITIAL)];
    } else {
      result += char;
    }
  }
  return result;
}

export function buildNameIndex(raw: RawNameIndex): NameIndex {
  const count = raw.items.length;
  const names = new Array<string>(count);
  const categoryOf = new Array<number>(count);
  const normalized = new Array<string>(count);
  const initials = new Array<string>(count);
  const categoriesByName = new Map<string, string[]>();

  for (let index = 0; index < count; index += 1) {
    const [name, categoryIndex] = raw.items[index];
    const norm = normalizeForSearch(name);
    names[index] = name;
    categoryOf[index] = categoryIndex;
    normalized[index] = norm;
    initials[index] = toInitials(norm);

    const category = raw.categories[categoryIndex];
    const seen = categoriesByName.get(name);
    if (!seen) categoriesByName.set(name, [category]);
    else if (!seen.includes(category)) seen.push(category);
  }

  return { updated: raw.updated, categories: raw.categories, names, categoryOf, normalized, initials, categoriesByName };
}

/** 사전은 빌드 산출물과 함께 올라가므로 앱의 base 경로를 따른다. */
function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/items/${path}`;
}

/**
 * 이름 인덱스. 한 번 받아 전처리까지 끝낸 것을 계속 쓴다.
 * 파일이 없는 빌드에서는 null 을 돌려 자동완성만 빠지고 검색은 그대로 된다.
 * 찾기를 누른 순간 아직 받는 중이면 끝날 때까지 기다려야 해서 옵션을 따로 꺼내 둔다.
 */
export const itemNameIndexQueryOptions = queryOptions({
  queryKey: ['itemDictionary', 'names'],
  queryFn: async ({ signal }): Promise<NameIndex | null> => {
    const response = await fetch(assetUrl('names.json'), { signal });
    if (!response.ok) return null;
    return buildNameIndex((await response.json()) as RawNameIndex);
  },
  staleTime: Infinity,
  gcTime: Infinity,
  retry: false,
});

export function useItemNameIndexQuery() {
  return useQuery(itemNameIndexQueryOptions);
}

interface SearchOptions {
  /** 비우면 전체. 고르면 그 카테고리 이름만 본다. */
  category?: string;
  limit?: number;
}

/**
 * 입력에 맞는 이름을 고른다.
 *
 * 앞글자가 맞는 것을 먼저, 그 안에서는 짧은 이름을 먼저 보여 준다. "숏" 을 치면
 * "숏 소드" 가 "주방장 숏 소드" 보다 위에 와야 한다. 중간에 들어 있는 것은 그 뒤에
 * 원래 순서대로 붙인다.
 */
export function searchNames(index: NameIndex, keyword: string, options: SearchOptions = {}): NameSuggestion[] {
  const limit = options.limit ?? 20;
  const categoryIndex = options.category ? index.categories.indexOf(options.category) : -1;
  const restrict = Boolean(options.category);

  // 카테고리를 골랐는데 인덱스에 없는 카테고리면 보여 줄 것이 없다.
  if (restrict && categoryIndex < 0) return [];

  let needle = normalizeForSearch(keyword);

  // 아무것도 안 쳤으면 카테고리를 골랐을 때만 앞에서부터 보여 준다. 전체에서는 비운다.
  if (!needle) {
    if (!restrict) return [];
    const picked: NameSuggestion[] = [];
    for (let i = 0; i < index.names.length && picked.length < limit; i += 1) {
      if (index.categoryOf[i] === categoryIndex) picked.push(toSuggestion(index, i));
    }
    return picked;
  }

  const byInitials = ONLY_CONSONANTS.test(needle);

  // 조립 중인 낱자는 떼고 찾는다. 안 그러면 한 글자 칠 때마다 목록이 비었다 찼다 한다.
  if (!byInitials && TRAILING_JAMO.test(needle)) {
    needle = needle.slice(0, -1);
    if (!needle) return [];
  }

  const haystacks = byInitials ? index.initials : index.normalized;
  const starts: number[] = [];
  const contains: number[] = [];

  for (let i = 0; i < haystacks.length; i += 1) {
    if (restrict && index.categoryOf[i] !== categoryIndex) continue;
    const at = haystacks[i].indexOf(needle);
    if (at === 0) starts.push(i);
    else if (at > 0 && contains.length < limit) contains.push(i);
  }

  starts.sort((a, b) => index.normalized[a].length - index.normalized[b].length || a - b);

  const result: NameSuggestion[] = [];
  const seen = new Set<string>();
  for (const i of [...starts, ...contains]) {
    const name = index.names[i];
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(toSuggestion(index, i));
    if (result.length >= limit) break;
  }
  return result;
}

/** 자음으로만 된 입력인지. 초성 검색 여부를 가를 때 쓴다. */
export function isInitialsOnly(text: string): boolean {
  return ONLY_CONSONANTS.test(text);
}

export interface ResolvedSearch {
  keyword: string;
  category: string;
  /**
   * 넥슨 keyword-search 로 나눠 보낼 검색어. 전체 검색일 때만 채운다.
   * 비어 있으면 keyword 를 그대로 한 번 보낸다.
   */
  keywords?: string[];
  /** 걸린 이름이 너무 많아 keywords 를 다 보내지 못했다. */
  keywordsTruncated?: boolean;
}

/**
 * 찾기를 눌렀을 때 실제로 보낼 검색어를 다듬는다.
 *
 * 입력기가 조립 중인 끝 낱자를 떼고, 초성 "ㅅㅅㄷ" 은 사전에서 가장 맞는 이름으로
 * 바꾼다(넥슨은 초성을 400 으로 거절한다). 바뀐 검색어는 입력칸에도 보인다.
 *
 * 전체 검색이면 planKeywordSearch 로 넥슨에 보낼 검색어를 정한다. 카테고리를 골랐으면
 * 그 목록을 받아 화면에서 거르므로(초성도 거기서 처리한다) 검색어를 바꾸지 않는다.
 *
 * 초성인데 사전에 맞는 이름이 없으면 null. 넥슨에 보내 봐야 400 이다.
 */
export function resolveSearch(
  index: NameIndex | null | undefined,
  input: { keyword: string; category: string },
): ResolvedSearch | null {
  let keyword = input.keyword.trim();
  const initialsOnly = isInitialsOnly(normalizeForSearch(keyword));

  if (!initialsOnly && TRAILING_JAMO.test(keyword)) keyword = keyword.slice(0, -1).trim();

  if (input.category || !keyword) return { keyword, category: input.category };
  if (!index) return initialsOnly ? null : { keyword, category: input.category };

  if (initialsOnly) {
    const [top] = searchNames(index, keyword, { limit: 1 });
    if (!top) return null;
    keyword = top.name;
  }

  const plan = planKeywordSearch(index, splitTerms(keyword));
  return plan ? { keyword, category: input.category, ...plan } : { keyword, category: input.category };
}

/** 검색어를 단어로 쪼갠다. 쉼표든 공백이든 구분자로 보고, 띄어쓰기는 지운 채로 비교한다. */
export function splitTerms(keyword: string): string[] {
  return keyword
    .split(/[,\s]+/)
    .map((term) => normalizeForSearch(term))
    .filter(Boolean);
}

/** 한 번 찾을 때 keyword-search 를 몇 번까지 나눠 부를지. 넥슨 호출량을 지킨다. */
export const MAX_KEYWORD_SEARCHES = 8;
/** keyword-search 가 쉼표로 받는 단어 수. */
const MAX_KEYWORD_WORDS = 10;

/**
 * 이름 일부로 전체를 찾을 때 넥슨에 무엇을 보낼지 정한다.
 *
 * 넥슨 keyword-search 는 단어 단위로만 맞춘다. "우유" 로는 "딸기우유" 와 "우유식빵" 이
 * 안 걸리고, 붙여 쓴 "꿀우유" 로는 "향기로운 꿀 우유" 가 안 걸린다. 쉼표로 여러 단어를
 * 넣으면 모두 들어간 것만 준다(OR 이 아니다).
 *
 * 그래서 사전에서 띄어쓰기를 무시하고 검색어가 들어 있는 이름을 모두 찾고, 이름마다
 * 넥슨이 알아듣는 말(searchKeyOf)로 바꾼 뒤 같은 것끼리 묶어 한 번씩 보낸다.
 *   "우유"   → "우유"(우유, 브리움 우유, 향기로운 꿀 우유 …), "딸기우유", "우유식빵"
 *   "꿀우유" → "꿀 우유"
 * 이름을 많이 묶는 말부터 MAX_KEYWORD_SEARCHES 개까지만 보낸다.
 *
 * 사전에 걸리는 이름이 없으면 null. 새로 나온 아이템일 수 있으니 입력 그대로 보낸다.
 */
export function planKeywordSearch(
  index: NameIndex,
  terms: string[],
): { keywords: string[]; keywordsTruncated: boolean } | null {
  if (terms.length === 0 || terms.length > MAX_KEYWORD_WORDS) return null;

  const namesByKey = new Map<string, number>();
  const seen = new Set<string>();
  for (let i = 0; i < index.names.length; i += 1) {
    const name = index.names[i];
    if (seen.has(name)) continue;
    seen.add(name);
    if (!terms.every((term) => index.normalized[i].includes(term))) continue;
    const key = searchKeyOf(name, terms);
    if (key) namesByKey.set(key, (namesByKey.get(key) ?? 0) + 1);
  }
  if (namesByKey.size === 0) return null;

  const keywords = [...namesByKey.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .slice(0, MAX_KEYWORD_SEARCHES)
    .map(([key]) => key);
  return { keywords, keywordsTruncated: namesByKey.size > keywords.length };
}

/**
 * 이 이름을 넥슨 keyword-search 로 찾으려면 무엇을 보내야 하는지.
 *
 * 검색어 단어마다 이름 속에서 걸친 단어를 통째로 잘라 이름의 띄어쓰기대로 되살리고,
 * 쉼표로 잇는다. "향기로운 꿀 우유" 에서 "꿀우유" 는 "꿀 우유", "딸기우유" 에서 "우유" 는
 * "딸기우유" 다. 결과를 합칠 때 매물이 어느 검색어 몫인지 가르는 데도 쓴다.
 * 단어 하나라도 이름에 없으면 null.
 */
export function searchKeyOf(name: string, terms: string[]): string | null {
  const bare = name.replace(/^@/, '');
  const spans: string[] = [];
  for (const term of terms) {
    const span = wordSpan(bare, term);
    if (span === null) return null;
    if (!spans.includes(span)) spans.push(span);
  }
  return spans.join(',');
}

/**
 * 띄어쓰기를 지운 term 이 name 에 걸친 단어들. 넥슨은 단어 단위로 맞추므로 걸친
 * 단어는 통째로 넓힌다. 들어 있지 않으면 null.
 */
function wordSpan(name: string, term: string): string | null {
  const at = normalizeForSearch(name).indexOf(term);
  if (at < 0) return null;
  // 띄어쓰기를 지운 위치를 원래 이름의 위치로 되돌린다.
  let start = 0;
  let end = name.length;
  let seen = 0;
  for (let i = 0; i < name.length; i += 1) {
    if (/\s/.test(name[i])) continue;
    if (seen === at) start = i;
    seen += 1;
    if (seen === at + term.length) {
      end = i + 1;
      break;
    }
  }
  while (start > 0 && !/\s/.test(name[start - 1])) start -= 1;
  while (end < name.length && !/\s/.test(name[end])) end += 1;
  return name.slice(start, end).replace(/\s+/g, ' ');
}

function toSuggestion(index: NameIndex, i: number): NameSuggestion {
  const name = index.names[i];
  return { name, categories: index.categoriesByName.get(name) ?? [index.categories[index.categoryOf[i]]] };
}
