import { readValues, writeValues } from './url';
import type { Field, Values } from './schema';

/**
 * 계산기마다 "내 설정" 으로 기억해 둘 입력.
 *
 * 입력은 주소에 담겨 공유 링크가 같은 결과를 만든다. 그런데 메뉴로 다시 들어오면 주소에 쿼리가 없어 모두 기본값으로 돌아가,
 * 직접 넣은 쿠폰 값이나 멤버십 여부를 매번 다시 넣어야 했다. 판매가처럼 쓸 때마다 달라지는 값은 기억하지 않고,
 * 계산기가 remember 로 표시한 칸(내가 산 쿠폰 값, 멤버십 등)만 이 브라우저에 남긴다.
 *
 * 주소에 값이 있으면 그것이 이긴다(공유 링크를 연 사람의 저장값이 링크의 값을 덮으면 안 된다). 저장은 사용자가 직접
 * 고칠 때만 한다. 링크를 열었다고 내 설정을 바꾸지 않는다. 저장 형식은 주소의 쿼리와 같아 읽을 때 같은 검증을 거친다.
 */

const storageKey = (id: string) => `mabikuma:calc:${id}`;

const rememberedFields = (fields: readonly Field[]) => fields.filter((field) => field.remember);

function readStored(id: string): URLSearchParams {
  try {
    return new URLSearchParams(window.localStorage.getItem(storageKey(id)) ?? '');
  } catch {
    // 저장소가 막힌 브라우저(시크릿 모드 등)에서는 기억하지 않는다.
    return new URLSearchParams();
  }
}

/**
 * 주소로 읽은 입력 위에, 주소에 없는 기억 칸의 저장값을 얹는다.
 * 저장값이 없거나 읽을 수 없으면 기본값 그대로다.
 */
export function withRemembered(
  id: string,
  fields: readonly Field[],
  values: Values,
  params: URLSearchParams,
): Values {
  const remembered = rememberedFields(fields);
  if (remembered.length === 0) return values;
  const stored = readStored(id);
  const fromStore = readValues(remembered, stored);
  const next = { ...values };
  for (const field of remembered) {
    if (params.has(field.key) || !stored.has(field.key)) continue;
    next[field.key] = fromStore[field.key];
  }
  return next;
}

/** 기억 칸의 지금 값을 저장한다. 기본값과 같은 칸은 저장하지 않아 지운 것과 같다. */
export function remember(id: string, fields: readonly Field[], values: Values): void {
  const remembered = rememberedFields(fields);
  if (remembered.length === 0) return;
  try {
    const text = writeValues(remembered, values).toString();
    if (text === '') window.localStorage.removeItem(storageKey(id));
    else window.localStorage.setItem(storageKey(id), text);
  } catch {
    // 저장하지 못해도 이 화면에서는 그대로 쓴다.
  }
}

/** 시험에서 저장값을 비운다. */
export function forgetRememberedForTest(id: string): void {
  try {
    window.localStorage.removeItem(storageKey(id));
  } catch {
    // 막혀 있으면 지울 것도 없다.
  }
}
