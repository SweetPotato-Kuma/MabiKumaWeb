/**
 * 인챈트 스크롤 이름과 묶음.
 *
 * 게임에는 인챈트마다 따로 있는 스크롤 아이템이 없다. 스크롤은 "인챈트 스크롤" 한 종류이고, 인챈트는
 * 스크롤 하나하나에 붙는 속성이다. 경매장은 그 속성을 이름 뒤에 붙여 "인챈트 스크롤 - 올빼미"
 * 로 보여 준다. 인챈트를 바르면 장비가 전용이 되는 것(personal)은 "전용 인챈트 스크롤" 이다.
 *
 * 이 이름들을 아이템 사전에 넣어 두면 경매장 이름과 같은 모양으로 검색되고 상세가 열린다.
 */

export const SCROLL_CATEGORY = '인챈트 스크롤';
export const SCROLL_BASE = '인챈트 스크롤';
export const PERSONAL_SCROLL_BASE = '전용 인챈트 스크롤';

/** 사전 이름. 전용 인챈트는 전용 스크롤이다. */
export function scrollName(shownName, personal) {
  return `${personal ? PERSONAL_SCROLL_BASE : SCROLL_BASE} - ${shownName}`;
}

/**
 * 이름도 설명도 풀리지 않은 칸. 게임 데이터에 문자열이 빠져 있어 "not found key" 로 남은 것(책 페이지류)과
 * 랭크가 0 인 시험용 칸이다. 스크롤로 나오지 않는다.
 */
export const isPlaceholderEnchant = (def) =>
  def.level < 1 || def.desc.length === 0 || def.desc.some((line) => line.startsWith('not found key'));

/** 바르면 장비가 전용이 되는 인챈트. 효과식의 표시와 설명 문장 둘 중 하나가 말해 준다. */
export const isPersonalEnchant = (def) =>
  def.personal === true || def.desc.some((line) => line.includes('전용으로 만듦'));

/** 한 이름 아래 변형들의 다른 이름(첫 번째 이름)들. 사전 검색에서 이 이름으로도 걸리게 한다. */
export const altNames = (variants) => [...new Set(variants.map((variant) => variant.alt).filter(Boolean))];

/** 데이터의 레벨 1~6 이 F~A 랭크, 7~15 가 9~1 랭크다. src/features/equipment/enchant.ts 의 enchantRank 와 같다. */
export const rankLabel = (level) => (level >= 1 && level <= 6 ? 'FEDCBA'[level - 1] : String(16 - level));

/** 이름 아래 작은 줄. "접미 8 랭크" 처럼, 접두와 접미가 둘 다 있으면 " / " 로 잇는다. */
export function scrollSubtitle(variants) {
  const kinds = variants
    .map((variant) => `${variant.slot === 0 ? '접두' : '접미'} ${rankLabel(variant.level)} 랭크`)
    .join(' / ');
  const alts = altNames(variants);
  return alts.length > 0 ? `${kinds}, 다른 이름 ${alts.join(', ')}` : kinds;
}

/** "전용 인챈트 스크롤 - 올빼미" -> { base: "전용 인챈트 스크롤", enchant: "올빼미" }. 아니면 null. */
export function parseScrollName(name) {
  const match = /^((?:전용 )?인챈트 스크롤) - (.+)$/.exec(name);
  return match ? { base: match[1], enchant: match[2] } : null;
}

/**
 * 인챈트 정의들을 스크롤 이름별로 묶는다. 이름이 같은 접두와 접미, 랭크만 다른 것이 한 이름 아래 모인다.
 * 경매장도 이름은 같고 접두/접미와 랭크가 옵션에 따로 붙는다.
 *
 * @param {{ name: string, alt?: string, slot: 0 | 1, level: number, desc: string[], personal?: boolean, src?: string[], gen?: number }[]} defs
 * @returns {Map<string, object[]>} 사전 이름 -> 변형들(접두 먼저, 높은 랭크 먼저)
 */
export function groupScrolls(defs) {
  const groups = new Map();
  for (const def of defs) {
    if (isPlaceholderEnchant(def)) continue;
    const name = scrollName(def.name, isPersonalEnchant(def));
    const variant = { slot: def.slot, level: def.level, desc: def.desc };
    if (def.alt) variant.alt = def.alt;
    if (def.src?.length) variant.src = def.src;
    if (def.gen) variant.gen = def.gen;
    const list = groups.get(name) ?? [];
    list.push(variant);
    groups.set(name, list);
  }
  for (const list of groups.values()) list.sort((a, b) => a.slot - b.slot || b.level - a.level);
  return groups;
}
