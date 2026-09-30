import { hexToRgb } from '@/features/bags/color';
import {
  EMPTY_OPTION_FILTER,
  isConditionActive,
  nextConditionId,
  type Condition,
  type OptionFilter,
} from './optionFilter';

/**
 * 상세 검색 조건을 주소에 담는 글자로 바꾸고 되돌린다.
 *
 * 주소는 사람이 고쳐 쓰거나 옛 링크가 남을 수 있는 바깥 입력이다. 읽을 때 모양이 맞지 않는 조건은
 * 그 조건만 버리고, 나머지는 살린다. 조건 블록의 id 는 화면 안에서만 뜻이 있어 주소에 싣지 않는다.
 */

/** 한 번에 실을 수 있는 조건 수. 주소가 끝없이 길어지지 않게 자른다. */
const MAX_CONDITIONS = 12;
/** 문구 하나의 최대 길이. */
const MAX_TEXT = 80;

/** 값이 없는 칸(null)은 싣지 않는다. 읽을 때 빈 값으로 돌아온다. */
const omitNull = (_key: string, value: unknown) => (value === null ? undefined : value);

/**
 * 조건을 주소용 글자로. 아직 아무것도 거르지 않는 빈 블록은 뺀다. 조건이 없으면 빈 글자다.
 * 글자가 같으면 같은 조건이라, 화면 상태와 주소를 견주는 데도 쓴다.
 */
export function serializeFilter(filter: OptionFilter): string {
  const conditions = filter.conditions
    .filter(isConditionActive)
    .map(({ id: _id, ...rest }) => rest);
  return conditions.length > 0 ? JSON.stringify(conditions, omitNull) : '';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';

/** 유한한 숫자만. 문자열이나 NaN 은 값 없음이다. */
const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function parseCondition(raw: unknown): Condition | null {
  if (!isRecord(raw)) return null;
  switch (raw.kind) {
    case 'reforge':
      return { id: nextConditionId(), kind: 'reforge', name: text(raw.name), minLevel: numberOrNull(raw.minLevel) };
    case 'enchant':
      return { id: nextConditionId(), kind: 'enchant', prefix: text(raw.prefix), suffix: text(raw.suffix) };
    case 'special': {
      const type = raw.type === 'R' || raw.type === 'S' ? raw.type : '';
      return { id: nextConditionId(), kind: 'special', type, minStep: numberOrNull(raw.minStep) };
    }
    case 'erg':
      return { id: nextConditionId(), kind: 'erg', grade: text(raw.grade), minLevel: numberOrNull(raw.minLevel) };
    case 'color': {
      const hex = text(raw.hex).toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex) || hexToRgb(hex) === null) return null;
      const similarity = numberOrNull(raw.minSimilarity);
      return {
        id: nextConditionId(),
        kind: 'color',
        hex,
        part: text(raw.part),
        minSimilarity: similarity !== null && similarity >= 0 && similarity <= 100 ? similarity : 95,
      };
    }
    case 'relic':
      return {
        id: nextConditionId(),
        kind: 'relic',
        name: text(raw.name),
        minLevel: numberOrNull(raw.minLevel),
        maxLevel: numberOrNull(raw.maxLevel),
      };
    case 'number': {
      const optionType = text(raw.optionType);
      if (!optionType) return null;
      return { id: nextConditionId(), kind: 'number', optionType, min: numberOrNull(raw.min) };
    }
    case 'text': {
      const optionType = text(raw.optionType);
      if (!optionType) return null;
      return { id: nextConditionId(), kind: 'text', optionType, text: text(raw.text) };
    }
    default:
      return null;
  }
}

/** 주소의 글자를 조건으로. 깨졌거나 낯선 것은 버리고, 남는 게 없으면 빈 조건이다. */
export function parseFilter(value: string | null | undefined): OptionFilter {
  if (!value) return EMPTY_OPTION_FILTER;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return EMPTY_OPTION_FILTER;
  }
  if (!Array.isArray(raw)) return EMPTY_OPTION_FILTER;
  const conditions = raw
    .slice(0, MAX_CONDITIONS)
    .map(parseCondition)
    .filter((condition): condition is Condition => condition !== null && isConditionActive(condition));
  return conditions.length > 0 ? { conditions } : EMPTY_OPTION_FILTER;
}
