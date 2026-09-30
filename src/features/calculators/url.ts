import { defaultValues, type Field, type Values } from './schema';

/**
 * 계산기 입력을 주소 쿼리스트링으로 옮기고 되돌린다. 스키마 하나로 모든 계산기가 같은 규칙을 쓴다.
 *
 * 기본값과 같은 입력은 주소에서 뺀다. 그래서 공유 링크가 짧고, 기본 화면의 주소에는 쿼리가 없다.
 * 주소는 사람이 고쳐 쓰거나 옛 링크일 수 있어 읽을 때 칸마다 검증한다. 모르는 값은 기본값으로 돌리고
 * 나머지는 살린다.
 */

const MAX_TEXT = 100;
/** 금액 칸의 상한. 이보다 크면 계산이 읽을 수 없는 숫자가 된다. */
export const MAX_GOLD = 1e15;

function readNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** 주소에서 입력을 읽는다. */
export function readValues(fields: readonly Field[], params: URLSearchParams): Values {
  const values = defaultValues(fields);
  for (const field of fields) {
    const raw = params.get(field.key);
    if (raw === null) continue;
    switch (field.type) {
      case 'gold': {
        const value = readNumber(raw);
        if (value !== null && value >= 0 && value <= MAX_GOLD) values[field.key] = Math.floor(value);
        break;
      }
      case 'number': {
        const value = readNumber(raw);
        if (value !== null) values[field.key] = Math.min(field.max, Math.max(field.min, Math.round(value)));
        break;
      }
      case 'toggle':
        if (raw === '1') values[field.key] = true;
        else if (raw === '0') values[field.key] = false;
        break;
      case 'choice':
        if (field.options.some((option) => option.value === raw)) values[field.key] = raw;
        break;
      case 'item':
        values[field.key] = raw.slice(0, MAX_TEXT);
        break;
    }
  }
  return values;
}

/** 입력을 주소에 쓴다. 기본값과 같은 칸은 뺀다. base 의 다른 쿼리(탭 등)는 그대로 둔다. */
export function writeValues(
  fields: readonly Field[],
  values: Values,
  base: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const field of fields) {
    const value = values[field.key];
    next.delete(field.key);
    if (value === field.default || value === null || value === undefined) continue;
    if (field.type === 'toggle') next.set(field.key, value ? '1' : '0');
    else if (value !== '') next.set(field.key, String(value));
  }
  return next;
}
