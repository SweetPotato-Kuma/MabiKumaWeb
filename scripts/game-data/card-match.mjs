/**
 * 경매장 이름 하나에 맞는 게임 아이템이 여럿일 때, 경매장 카테고리를 보고 하나를 고른다.
 *
 * 이름만으로 고르면 틀린 카드가 붙는다(2026-09). 검 "간장" 에 음식 간장의 그림과 설명이 붙어 검
 * 목록에 간장(음식)이 들어간 것처럼 보였고, 둔기 "곰 인형" 에는 장난감 인형 설명이 붙을 수 있었다.
 * 경매장 이름 1,700개 남짓이 게임 아이템 둘 이상과 이름이 같다.
 *
 * 게임 데이터에는 경매장 카테고리가 없다. 대신 카테고리마다 "이름이 하나뿐이라 틀릴 수 없는"
 * 아이템들에서 그 카테고리의 모양을 배운다. 그리고 후보를 아래 순서로 견준다.
 *
 *   1. 장비인지가 카테고리와 맞는가. 검 카테고리면 장비 후보, 음식 카테고리면 장비가 아닌 후보.
 *   2. 출처 표와 장비 종류가 그 카테고리에서 얼마나 흔한가. 한손 검 카테고리면 OHSword 가 흔하다.
 *   3. 설명이 있는가. 빈 설명보다 있는 설명이 낫다.
 *   4. 아이템 번호가 그 카테고리 아이템들의 번호와 가까운가. 게임은 비슷한 물건에 이웃한 번호를 준다.
 *      음식 "황금 사과"(50013) 는 음식들 곁에, 유물 "황금 사과"(12241~) 는 유물들 곁에 있다.
 *   5. 그래도 같으면 먼저 나온 것.
 *
 * 등급만 다른 같은 물건(파도의 진정 최상급과 하급 같은 것)은 경매장 이름으로 구분되지 않으므로
 * 무엇을 골라도 된다. 위 순서는 그 사이에서 설명이 있는 쪽을 고르는 정도의 뜻만 있다.
 */

/**
 * @typedef {{ id: number, description: string, source: string, equipType: string, equippable: boolean }} Candidate
 */

const signatureOf = (candidate) => `${candidate.source}|${candidate.equipType}`;

/** 정렬된 번호 목록에서 x 와 가장 가까운 번호까지의 거리. */
function nearestDistance(sortedIds, x) {
  let lo = 0;
  let hi = sortedIds.length - 1;
  let best = Infinity;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    best = Math.min(best, Math.abs(sortedIds[mid] - x));
    if (sortedIds[mid] < x) lo = mid + 1;
    else hi = mid - 1;
  }
  return best;
}

/**
 * @param {Map<string, Candidate[]>} candidates 게임 데이터의 이름 -> 후보들
 * @param {Map<string, Iterable<string>>} dictionary 경매장 카테고리 -> 그 카테고리에서 본 이름들
 */
export function createCardMatcher(candidates, dictionary) {
  const categoriesOf = new Map();
  for (const [category, names] of dictionary) {
    for (const name of names) {
      const list = categoriesOf.get(name);
      if (list) list.push(category);
      else categoriesOf.set(name, [category]);
    }
  }

  // 카테고리의 모양. 이름이 한 카테고리에만 있고 후보도 하나뿐인 것만 센다.
  const profiles = new Map();
  for (const [name, categories] of categoriesOf) {
    const found = candidates.get(name);
    if (categories.length !== 1 || !found || found.length !== 1) continue;
    const [candidate] = found;
    let profile = profiles.get(categories[0]);
    if (!profile) {
      profile = { count: 0, equippable: 0, signatures: new Map(), ids: [] };
      profiles.set(categories[0], profile);
    }
    profile.count++;
    if (candidate.equippable) profile.equippable++;
    const signature = signatureOf(candidate);
    profile.signatures.set(signature, (profile.signatures.get(signature) ?? 0) + 1);
    profile.ids.push(candidate.id);
  }
  for (const profile of profiles.values()) profile.ids.sort((a, b) => a - b);

  /** 견줄 값들. 앞에 있을수록 먼저 본다. 클수록 낫다. */
  function scoreOf(candidate, index, profile) {
    const hasDescription = candidate.description.trim() ? 1 : 0;
    if (!profile) return [0, 0, hasDescription, 0, -index];
    const equipCategory = profile.equippable * 2 >= profile.count;
    return [
      candidate.equippable === equipCategory ? 1 : 0,
      (profile.signatures.get(signatureOf(candidate)) ?? 0) / profile.count,
      hasDescription,
      -Math.log10(1 + nearestDistance(profile.ids, candidate.id)),
      -index,
    ];
  }

  return {
    /** @returns {Candidate | null} */
    pick(name, category) {
      const found = candidates.get(name);
      if (!found || found.length === 0) return null;
      if (found.length === 1) return found[0];

      const profile = profiles.get(category);
      let best = null;
      let bestScore = null;
      found.forEach((candidate, index) => {
        const score = scoreOf(candidate, index, profile);
        if (!bestScore || isBetter(score, bestScore)) {
          best = candidate;
          bestScore = score;
        }
      });
      return best;
    },
  };
}

function isBetter(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
