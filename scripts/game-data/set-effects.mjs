/**
 * 세트 효과 표를 만든다. 입력은 클라이언트 내보내기로 만든 표(client-tables.mjs)다.
 *
 * 세트 효과는 장비마다 "효과 키, 최소, 최대" 로 수치가 붙고, 장착한 장비들의 수치 합이 효과의
 * 발동 기준(대개 10) 이상이면 켜진다. 같은 세트의 부위들은 같은 키를 나눠 갖는다.
 *
 *   effects  키 -> { name, desc, need }
 *   items    아이템 이름 -> [[키, 최소, 최대], ...]  품질 조건이 붙은 줄은 끝에 품질이 하나 더 있다.
 *
 * 사이트는 아이템을 이름으로 찾으므로 이름으로 묶는다. 이름이 같은 아이템 번호가 여럿이면(종족별,
 * 이벤트판) 첫 번째 것을 쓴다. 이름 없는 번호는 사전에서 열 수 없으니 뺀다.
 */

/** 문자열 표에서 글을 찾는다. 없는 키(not found key)는 빈 문자열이다. */
function stringLookup(table) {
  const strings = new Map(table.map((entry) => [entry.Id, entry.Str]));
  return (key) => {
    const value = strings.get(key) ?? '';
    return value.startsWith('not found key') ? '' : value;
  };
}

/**
 * 효과 설명. 줄바꿈이 글자 그대로 "\n" 이나 "\\n" 으로 들어 있다. 값을 게임이 따로 채우는
 * 자리({0}, [int:Chorus])는 그 값이 데이터에 없다. 단위째 빼서 "최대 대미지 증가" 로 둔다.
 */
export function cleanSetDesc(text) {
  return text
    .replace(/\\+n/g, '\n')
    .replace(/[ \t]*(?:\{\d+\}|\[int:[^\]]*\])(?:%|초|cm)?/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export function buildSetEffects(resource) {
  const text = stringLookup(resource.StringTable);

  const effects = {};
  for (const row of resource.SetItemDescElementList) {
    if (!row.Key) continue;
    const desc = cleanSetDesc(text(row.Desc ?? ''));
    // 이름이 빠진 효과가 몇 있다. 설명 첫 줄이 곧 효과라 그것을 이름으로 쓴다.
    const name = text(row.Name ?? '') || desc.split('\n')[0] || row.Key;
    effects[row.Key] = { name, desc: desc === name ? '' : desc, need: row.ThresholdCount ?? 0 };
  }

  const nameOf = new Map(resource.ItemList.map((item) => [item.Id, text(item.Name ?? '')]));
  const lines = (elements = [], quality) =>
    elements
      .filter((element) => effects[element.Name])
      .map((element) => {
        const line = [element.Name, element.Min ?? 0, element.Max ?? 0];
        if (quality !== undefined) line.push(quality);
        return line;
      });

  const items = {};
  for (const row of resource.ItemExtendSetItemDescList) {
    const name = nameOf.get(row.Id);
    if (!name || items[name]) continue;
    const set = [
      ...lines(row.Elements),
      ...(row.QualityElements ?? []).flatMap((group) => lines(group.Elements, group.Quality ?? 0)),
    ];
    if (set.length) items[name] = set;
  }

  // 아무 아이템도 쓰지 않는 효과는 싣지 않는다.
  const used = new Set(Object.values(items).flatMap((set) => set.map(([key]) => key)));
  for (const key of Object.keys(effects)) if (!used.has(key)) delete effects[key];

  return { effects, items };
}
