/**
 * 키트 확률표의 이름을 게임 데이터의 아이템 번호로 잇는다. 키트 상자와 보상 그림을 붙일 때 쓴다.
 *
 * 확률표 이름은 게임 데이터 이름에 판매용 표기가 덧붙은 것이 많다(2026-10).
 *   `[트렌드] 나이트메어 판타지아 위치 햇`     머리말은 게임 이름에 없다
 *   `낭만 농장 황금 새싹 5개`                  개수는 상품 구성이다
 *   `이름/채팅 지정 색상 변경 포션 (30일)`     기간도 상품 구성이다
 *   `샤말라의 변신 메달 (나오)`                괄호 앞 띄어쓰기가 다르다
 * 그대로, 띄어쓰기를 지운 모양, 위 표기를 뗀 모양 순으로 찾는다.
 */

/** 띄어쓰기를 지우고 게임이 && 로 적는 & 를 하나로 본 비교용 모양. */
export const compactName = (name) => String(name).replace(/\s+/g, '').replace(/&&/g, '&');

/** 확률표 이름에서 판매용 표기를 뗀 후보들. 앞의 것이 먼저다. */
export function kitNameCandidates(name) {
  const base = String(name).trim();
  const out = [base];
  const add = (value) => {
    const next = value.trim();
    if (next && !out.includes(next)) out.push(next);
  };
  const untagged = base.replace(/^\[[^\]]{1,8}\]\s*/, '');
  add(untagged);
  // 장비 상품은 끝에 사양 괄호가 붙는다. "(세공 1 랭크 / 경험치 500%)"
  const unspecced = untagged.replace(/\s*\([^()]*(?:세공|경험치|\/)[^()]*\)$/, '');
  add(unspecced);
  for (const each of [base, untagged, unspecced]) {
    const uncounted = each.replace(/\s*\d+\s*개$/, '');
    add(uncounted);
    add(uncounted.replace(/\s*\(\d+\s*일\)$/, ''));
    add(each.replace(/\s*\(\d+\s*일\)$/, ''));
  }
  return out;
}

/**
 * 인챈트가 붙은 장비 상품은 앞에 인챈트 이름(접두, 접미)이 붙는다. "새겨진 인그레이브드 마리오네트 핸들"
 * 위 후보로 못 찾았을 때만 앞 낱말을 하나, 둘 떼어 본다. 남는 이름이 두 낱말 이상일 때만 뗀다.
 */
export function enchantlessCandidates(name) {
  const out = [];
  for (const candidate of kitNameCandidates(name)) {
    const words = candidate.split(/\s+/);
    for (let drop = 1; drop <= 2 && words.length - drop >= 2; drop += 1) {
      const rest = words.slice(drop).join(' ');
      if (!out.includes(rest)) out.push(rest);
    }
  }
  return out;
}

/**
 * 이름 -> 아이템 번호 표. 같은 이름이 여럿이면 그림이 있는 것(hasImage)을, 그중에서는 번호가 작은 것을 고른다.
 * 띄어쓰기를 지운 모양이 서로 다른 이름 둘과 겹치면 그 열쇠는 버린다. 엉뚱한 그림을 붙이느니 안 붙인다.
 */
export function buildKitNameIndex(items, hasImage = () => true) {
  const exact = new Map();
  const compact = new Map();
  const clashed = new Set();
  const better = (current, id) =>
    current === undefined ||
    (hasImage(id) && !hasImage(current)) ||
    (hasImage(id) === hasImage(current) && Number(id) < Number(current));
  for (const [id, { name }] of items) {
    if (!name) continue;
    if (better(exact.get(name), id)) exact.set(name, id);
    const key = compactName(name);
    const seen = compact.get(key);
    if (seen && seen.name !== name) clashed.add(key);
    else if (!seen || better(seen.id, id)) compact.set(key, { id, name });
  }
  for (const key of clashed) compact.delete(key);
  return { exact, compact };
}

/** 확률표 이름의 아이템 번호. 못 찾으면 null. */
export function resolveKitName(name, index) {
  for (const candidate of [...kitNameCandidates(name), ...enchantlessCandidates(name)]) {
    const id = index.exact.get(candidate) ?? index.compact.get(compactName(candidate))?.id;
    if (id !== undefined) return String(id);
  }
  return null;
}

/**
 * 키트 기록 전체에서 그림을 붙일 아이템 번호. 키트 상자는 키트 이름으로, 보상은 아이템 이름으로 찾는다.
 * 돌려주는 것은 `{ ids, boxOf, itemOf }` 이고, boxOf/itemOf 는 이름 -> 번호(못 찾으면 없음)다.
 */
export function kitIconIds(kits, index) {
  const boxOf = new Map();
  const itemOf = new Map();
  for (const kit of kits) {
    if (!boxOf.has(kit.name)) {
      const id = resolveKitName(kit.name, index);
      if (id) boxOf.set(kit.name, id);
    }
    for (const item of kit.items) {
      if (itemOf.has(item.name)) continue;
      const id = resolveKitName(item.name, index);
      if (id) itemOf.set(item.name, id);
    }
  }
  return { ids: new Set([...boxOf.values(), ...itemOf.values()]), boxOf, itemOf };
}
