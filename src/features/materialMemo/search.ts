import { normalizeForSearch } from '@/features/auction/dictionary';
import { isInitialsOnly, toInitials } from '@/features/auction/nameIndex';
import { CONVERSION_SKILL, type RecipeBook } from '@/features/crafting/recipes';

/** 목표로 고를 수 있는 아이템. 제작법이 하나라도 있는 것(금속 변환만 있는 것은 뺀다). */
export interface CraftableEntry {
  itemId: number;
  name: string;
  normalized: string;
  initials: string;
}

/**
 * 이름이 같은 아이템이 여럿이면(거래 가능한 것과 불가한 것) 제작법이 있는 첫 번호를 쓴다.
 * 아이템 정보 화면이 이름으로만 아이템을 알기 때문에 같은 이름은 한 줄이다.
 */
export function craftableEntries(book: RecipeBook): CraftableEntry[] {
  const seen = new Set<string>();
  const entries: CraftableEntry[] = [];
  for (const recipe of book.recipes) {
    if (recipe.skill === CONVERSION_SKILL) continue;
    const name = book.itemName(recipe.item);
    if (seen.has(name)) continue;
    seen.add(name);
    const normalized = normalizeForSearch(name);
    entries.push({ itemId: recipe.item, name, normalized, initials: toInitials(normalized) });
  }
  return entries;
}

/**
 * 입력에 맞는 아이템. 앞글자가 맞는 것을 먼저, 그 안에서는 짧은 이름을 먼저 보여 준다.
 * 자음만 쳤으면 초성으로 찾는다.
 */
export function searchCraftable(
  entries: readonly CraftableEntry[],
  keyword: string,
  limit = 20,
): CraftableEntry[] {
  const needle = normalizeForSearch(keyword);
  if (!needle) return [];
  const byInitials = isInitialsOnly(needle);
  const starts: CraftableEntry[] = [];
  const contains: CraftableEntry[] = [];
  for (const entry of entries) {
    const at = (byInitials ? entry.initials : entry.normalized).indexOf(needle);
    if (at === 0) starts.push(entry);
    else if (at > 0) contains.push(entry);
  }
  starts.sort((a, b) => a.normalized.length - b.normalized.length);
  return [...starts, ...contains].slice(0, limit);
}

/** 입력한 이름과 정확히 같은 아이템. 띄어쓰기와 대소문자는 가리지 않는다. */
export function findCraftable(
  entries: readonly CraftableEntry[],
  text: string,
): CraftableEntry | undefined {
  const needle = normalizeForSearch(text);
  return needle ? entries.find((entry) => entry.normalized === needle) : undefined;
}
