/**
 * 게임 데이터의 아이템 분류 필터.
 *
 * 개조(ItemUpgradeDB 의 item_filter), 인챈트(OptionSet 의 AllowItem, BlockItem), 세공 같은 규칙이 아이템을
 * 분류 경로(ItemDB 의 Category, "/equip/righthand/weapon/.../")로 고른다. 식 모양은 이렇다.
 *
 *   * /equip/ *                       글롭. * 는 아무 글자나
 *   * /equip/ * & * /cloth/ *          그리고
 *   a | b                              또는
 *   !a                                 아니고
 *   ( ... )                            묶음
 *
 * 우선순위는 ! > & > | 이다. 대소문자는 가리지 않는다. 빈 식은 아무것도 고르지 않는다.
 */

function tokenize(text) {
  const tokens = [];
  let term = '';
  const flush = () => {
    if (term.trim()) tokens.push({ type: 'term', value: term.trim() });
    term = '';
  };
  for (const char of String(text ?? '')) {
    if ('&|!()'.includes(char)) {
      flush();
      tokens.push({ type: char });
    } else term += char;
  }
  flush();
  return tokens;
}

function globRegExp(glob) {
  const body = glob.replace(/[.+?^${}[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}$`, 'i');
}

/** 식을 함수로. 고를 것이 없으면 null. */
export function compileItemFilter(text) {
  const tokens = tokenize(text);
  if (!tokens.some((token) => token.type === 'term')) return null;
  let position = 0;
  const peek = () => tokens[position];

  function primary() {
    const token = tokens[position++];
    if (!token) return () => false;
    if (token.type === '!') {
      const inner = primary();
      return (value) => !inner(value);
    }
    if (token.type === '(') {
      const inner = either();
      if (peek()?.type === ')') position++;
      return inner;
    }
    if (token.type === 'term') {
      const re = globRegExp(token.value);
      return (value) => re.test(value);
    }
    // 짝이 안 맞는 ) 나 연산자는 건너뛴다.
    return primary();
  }
  function both() {
    let left = primary();
    while (peek()?.type === '&') {
      position++;
      const a = left;
      const b = primary();
      left = (value) => a(value) && b(value);
    }
    return left;
  }
  function either() {
    let left = both();
    while (peek()?.type === '|') {
      position++;
      const a = left;
      const b = both();
      left = (value) => a(value) || b(value);
    }
    return left;
  }

  const match = either();
  return match;
}
