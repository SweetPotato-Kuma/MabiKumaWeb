import { normalizeForSearch } from '@/features/auction/dictionary';
import {
  isInitialsOnly,
  searchNames,
  toInitials,
  type NameIndex,
} from '@/features/auction/nameIndex';

/**
 * 목표로 고를 아이템 이름 찾기. 아이템 사전의 이름 목록에서 먼저 찾고, 제작법 데이터에만 있는 이름
 * (경매장에 오른 적 없는 재료)을 뒤에 붙인다. 제작할 수 있는지는 가리지 않는다.
 */
export function searchItemNames(
  index: NameIndex | null | undefined,
  bookNames: readonly string[],
  keyword: string,
  limit = 20,
): string[] {
  const needle = normalizeForSearch(keyword);
  if (!needle) return [];
  const found = index ? searchNames(index, keyword, { limit }).map((each) => each.name) : [];
  if (found.length >= limit) return found;

  const byInitials = isInitialsOnly(needle);
  const seen = new Set(found);
  const extra: string[] = [];
  for (const name of bookNames) {
    if (seen.has(name)) continue;
    const text = normalizeForSearch(name);
    if ((byInitials ? toInitials(text) : text).includes(needle)) extra.push(name);
  }
  extra.sort((a, b) => a.length - b.length);
  return [...found, ...extra].slice(0, limit);
}

/** 입력한 이름과 같은 아이템 이름. 띄어쓰기와 대소문자는 가리지 않는다. 없으면 undefined. */
export function resolveItemName(
  index: NameIndex | null | undefined,
  bookNames: readonly string[],
  text: string,
): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (index?.categoriesByName.has(trimmed)) return trimmed;
  const needle = normalizeForSearch(trimmed);
  const fromIndex = index
    ? searchNames(index, trimmed, { limit: 50 }).find(
        (each) => normalizeForSearch(each.name) === needle,
      )?.name
    : undefined;
  return fromIndex ?? bookNames.find((name) => normalizeForSearch(name) === needle);
}
