/**
 * 심볼, 도면, 옷본. 거래량이 많고 이름이 비슷해서 다른 매물 사이에 섞이면 훑기 어렵다. 방문자가 설정에서
 * 제외를 켜면 경매장 결과에서 기본으로 숨긴다.
 */
const SYMBOL_WORDS = ['심볼', '도면', '옷본'] as const;

/** 아이템 이름에 심볼, 도면, 옷본 가운데 하나가 들어 있는지. 띄어쓰기는 상관없다. */
export function isSymbolItem(name: string): boolean {
  const compact = name.replace(/\s+/g, '');
  return SYMBOL_WORDS.some((word) => compact.includes(word));
}

/**
 * 검색어가 이 단어를 직접 말하는지. "심볼" 을 찾는 사람에게 심볼을 숨기면 결과가 텅 빈다.
 * 그때는 제외 설정이 켜져 있어도 숨기지 않는다.
 */
export function searchesSymbolItems(keyword: string): boolean {
  return isSymbolItem(keyword);
}
