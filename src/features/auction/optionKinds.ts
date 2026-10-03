import {
  conditionLabel,
  kindOfOptionType,
  newCondition,
  type CatalogEntry,
  type Condition,
  type ConditionKind,
  type OptionFilter,
} from './optionFilter';
import { optionTypesFor } from './optionTypes';

/** 상세 검색에서 더할 수 있는 옵션 하나. */
export interface OptionChoice {
  /** 화면 이름이자 조건 칸 이름(conditionLabel). 같은 이름은 한 번만 둔다. */
  label: string;
  kind: ConditionKind;
  optionType: string;
  /** 불러온 매물 가운데 이 옵션이 있는 수. 불러온 것이 없으면 비어 있다. */
  count?: number;
  /** 값이 여러 칸(이름, 레벨, 구분 값)으로 나뉘는 옵션. 목록 위쪽 "주요 옵션" 에 모은다. */
  main: boolean;
}

/** 주요 옵션의 순서. 장비 옵션을 먼저 두고, 그 밖의 아이템 옵션을 뒤에 둔다. */
const MAIN_ORDER = [
  '세공',
  '인챈트',
  '특별 개조',
  '에르그',
  '색상',
  '세트 효과',
  '무리아스 유물',
  '펫 정보',
  '에코스톤 고유 능력',
  '에코스톤 각성 능력',
  '토템 효과',
  '토템 추가 옵션',
  '토템 강화 제한',
];

const isMain = (kind: ConditionKind) => kind !== 'number' && kind !== 'text';

const mainRank = (label: string) => {
  const at = MAIN_ORDER.indexOf(label);
  return at < 0 ? MAIN_ORDER.length : at;
};

/** 한 옵션으로 만들 조건 칸의 이름. 조건 칸과 목록이 같은 이름을 쓰게 조건을 만들어 본다. */
const labelOf = (kind: ConditionKind, optionType: string) => conditionLabel(newCondition({ kind, optionType }));

/**
 * 상세 검색에서 고를 수 있는 옵션.
 *
 * 고른 카테고리에 붙는 옵션(optionTypesFor)과 불러온 매물에 있는 옵션(catalog)을 합친다. 이미 칸이 있는 옵션은
 * 뺀다. 칸 하나에 줄을 더해 여러 조건을 건다. 주요 옵션을 정한 순서로 먼저, 나머지를 가나다순으로 둔다.
 */
export function optionChoices(
  category: string,
  catalog: CatalogEntry[],
  conditions: readonly Condition[],
): OptionChoice[] {
  const byLabel = new Map<string, OptionChoice>();
  const put = (kind: ConditionKind, optionType: string, count?: number) => {
    const label = labelOf(kind, optionType);
    const known = byLabel.get(label);
    if (known) {
      if (count !== undefined) known.count = (known.count ?? 0) + count;
      return;
    }
    byLabel.set(label, { label, kind, optionType, count, main: isMain(kind) });
  };
  // 불러온 매물에서 값으로 가른 종류(숫자인지 문구인지)를 먼저 믿는다.
  for (const entry of catalog) put(entry.kind, entry.optionType, entry.count);
  for (const type of optionTypesFor(category)) put(kindOfOptionType(type), type);

  const used = new Set(conditions.map(conditionLabel));
  return [...byLabel.values()]
    .filter((choice) => !used.has(choice.label))
    .sort(
      (a, b) =>
        Number(b.main) - Number(a.main) ||
        (a.main ? mainRank(a.label) - mainRank(b.label) : 0) ||
        a.label.localeCompare(b.label, 'ko'),
    );
}

/**
 * 상세 검색에서 고를 수 있는 옵션이 있는지. 카테고리에 붙는 옵션이 없고(뷰티 쿠폰 등) 불러온 매물에 걸 만한
 * 옵션도 없고 이미 건 조건도 없으면 열어 볼 이유가 없다.
 */
export function hasDetailOptions(category: string, catalog: CatalogEntry[], value: OptionFilter): boolean {
  return value.conditions.length > 0 || optionChoices(category, catalog, value.conditions).length > 0;
}
