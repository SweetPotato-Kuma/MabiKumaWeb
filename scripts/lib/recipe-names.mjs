/**
 * 제작법에는 나오지만 이름 사전에 없는 아이템 이름을 찾아 사전에 넣을 카테고리를 정한다.
 *
 * 사전은 경매장에 올라온 이름으로 모은다. 경매장에 올라온 적 없는 아이템은 사전에 없어서 카테고리도
 * 카드도 없고, 아이템 정보 화면이 "설명 없음" 으로 뜬다. 남성용과 여성용이 한 쌍인 장비는 한쪽만
 * 경매장에 올라오는 일이 흔하다(랑그히리스 체이서 부츠 남성용 등).
 *
 * 카테고리는 짝의 카테고리를 따른다. 이름의 남성용/여성용만 바꾼 이름이 사전에 있고 그 카테고리가
 * 하나뿐일 때만 넣는다. 번호가 이웃한 아이템에서 짐작하는 방법은 로브와 날개처럼 이웃이 다른
 * 카테고리인 경우가 있어(약 3% 틀림) 자동으로 넣기엔 위험해서 쓰지 않는다.
 */

/** 띄어쓰기와 && 표기 차이를 무시하는 열쇠. 경매장 이름과 게임 이름이 이 정도로 어긋난다. */
export const compactName = (name) => name.replace(/\s+/g, '').replace(/&&/g, '&');

const GENDERS = [
  ['남성용', '여성용'],
  ['여성용', '남성용'],
];

/** 남성용과 여성용을 맞바꾼 이름. 성별 표기가 없으면 null. */
export function counterpartName(name) {
  for (const [from, to] of GENDERS) {
    if (name.includes(from)) return name.replace(from, to);
  }
  return null;
}

/**
 * @param {Iterable<string>} recipeNames 제작법에 나오는 아이템 이름
 * @param {Map<string, Map<string, unknown>>} dictionary 카테고리 -> 이름 -> 레코드
 * @param {Set<string>} excluded "카테고리\u0000이름" 집합. 일부러 뺀 이름은 되살리지 않는다
 * @returns {{ additions: { name: string, category: string }[], unresolved: string[] }}
 */
export function findSiblingAdditions(recipeNames, dictionary, excluded = new Set()) {
  const categoriesByKey = new Map();
  for (const [category, items] of dictionary) {
    for (const name of items.keys()) {
      const key = compactName(name);
      const set = categoriesByKey.get(key);
      if (set) set.add(category);
      else categoriesByKey.set(key, new Set([category]));
    }
  }

  const excludedNames = new Set([...excluded].map((entry) => entry.split('\u0000')[1]));

  const additions = [];
  const unresolved = [];
  for (const name of new Set(recipeNames)) {
    if (categoriesByKey.has(compactName(name)) || excludedNames.has(name)) continue;

    const counterpart = counterpartName(name);
    const categories = counterpart ? categoriesByKey.get(compactName(counterpart)) : undefined;
    if (categories?.size === 1) additions.push({ name, category: [...categories][0] });
    else unresolved.push(name);
  }

  return { additions, unresolved };
}
