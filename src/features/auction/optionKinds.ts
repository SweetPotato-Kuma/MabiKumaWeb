import { isEquipmentCategory } from '@/features/equipment/api';
import { RELIC_CATEGORY } from '@/features/relics/murias';
import { leavesOfGroupKey } from './categoryTree';
import { QUICK_CONDITIONS, RELIC_QUICK_CONDITION, type ConditionKind } from './optionFilter';

/** 장비에 붙는 옵션 다섯 가지. 장비가 아닌 카테고리에는 붙지 않는다. */
const EQUIPMENT_KINDS: readonly ConditionKind[] = QUICK_CONDITIONS.map((quick) => quick.kind);

/**
 * 카테고리에서 바로 고를 수 있게 둘 자주 쓰는 옵션 종류.
 *
 * - 카테고리를 고르지 않았으면 모두 둔다. 조건만 넣고 찾을 수도 있다.
 * - 장비 카테고리는 세공, 인챈트, 특별 개조, 에르그, 색상.
 * - 유물 카테고리는 무리아스 유물 옵션 하나. 세공은 붙지 않아 쓸모가 없다.
 * - 묶음은 하위 카테고리에 하나라도 붙는 종류를 모두 둔다.
 * - 그 밖의 카테고리(포션, 도면 등)는 비운다. 불러온 매물에 있는 옵션(catalogKinds)과 이미 건 조건(usedKinds)은
 *   카테고리와 상관없이 남겨, 보이던 조건이 갑자기 사라지지 않게 한다.
 */
export function offeredKinds(
  category: string,
  catalogKinds: Iterable<ConditionKind> = [],
  usedKinds: Iterable<ConditionKind> = [],
): ConditionKind[] {
  const wanted = new Set<ConditionKind>([...catalogKinds, ...usedKinds]);
  const leaves = leavesOfGroupKey(category) ?? (category ? [category] : null);
  if (leaves === null) {
    EQUIPMENT_KINDS.forEach((kind) => wanted.add(kind));
    wanted.add('relic');
  } else {
    if (leaves.some(isEquipmentCategory)) EQUIPMENT_KINDS.forEach((kind) => wanted.add(kind));
    if (leaves.includes(RELIC_CATEGORY)) wanted.add('relic');
  }
  const ordered = [RELIC_QUICK_CONDITION, ...QUICK_CONDITIONS].map((quick) => quick.kind);
  return ordered.filter((kind) => wanted.has(kind));
}
