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
}

/**
 * 상세 검색에서 고를 수 있는 옵션 전부. 매물에 붙는 옵션은 훨씬 많지만(내구력, 남은 거래 횟수 등) 시세를 가르는
 * 옵션만 둔다. 고를 거리가 많으면 정작 찾는 옵션이 묻혔다.
 */
export const DETAIL_OPTION_LABELS: readonly string[] = [
  '무리아스 유물',
  '밸런스',
  '색상',
  '세공',
  '세트 효과',
  '에르그',
  '에코스톤 각성 능력',
  '에코스톤 고유 능력',
  '에코스톤 등급',
  '인챈트',
  '토템 추가 옵션',
  '토템 효과',
  '특별 개조',
  '펫 정보',
];

/** 한 옵션으로 만들 조건 칸의 이름. 조건 칸과 목록이 같은 이름을 쓰게 조건을 만들어 본다. */
const labelOf = (kind: ConditionKind, optionType: string) => conditionLabel(newCondition({ kind, optionType }));

/**
 * 상세 검색에서 고를 수 있는 옵션.
 *
 * 고른 카테고리에 붙는 옵션(optionTypesFor)과 불러온 매물에 있는 옵션(catalog) 가운데 DETAIL_OPTION_LABELS 에 든
 * 것만 가나다순으로 둔다. 이미 칸이 있는 옵션은 뺀다. 칸 하나에 줄을 더해 여러 조건을 건다.
 */
export function optionChoices(
  category: string,
  catalog: CatalogEntry[],
  conditions: readonly Condition[],
): OptionChoice[] {
  const byLabel = new Map<string, OptionChoice>();
  const put = (kind: ConditionKind, optionType: string) => {
    const label = labelOf(kind, optionType);
    if (DETAIL_OPTION_LABELS.includes(label) && !byLabel.has(label)) byLabel.set(label, { label, kind, optionType });
  };
  // 불러온 매물에서 값으로 가른 종류(숫자인지 문구인지)를 먼저 믿는다.
  for (const entry of catalog) put(entry.kind, entry.optionType);
  for (const type of optionTypesFor(category)) put(kindOfOptionType(type), type);

  const used = new Set(conditions.map(conditionLabel));
  return [...byLabel.values()]
    .filter((choice) => !used.has(choice.label))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

/**
 * 상세 검색에서 고를 수 있는 옵션이 있는지. 카테고리에 붙는 옵션이 없고(뷰티 쿠폰 등) 불러온 매물에 걸 만한
 * 옵션도 없고 이미 건 조건도 없으면 열어 볼 이유가 없다.
 */
export function hasDetailOptions(category: string, catalog: CatalogEntry[], value: OptionFilter): boolean {
  return value.conditions.length > 0 || optionChoices(category, catalog, value.conditions).length > 0;
}
