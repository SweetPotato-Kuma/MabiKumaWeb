import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * 화면의 조건을 주소 쿼리스트링에 담는 목록 화면용 훅.
 *
 * 값이 비었거나(null, 빈 글자, 빈 배열) 기본값이면 주소에서 뺀다. 배열은 같은 키를 여러 번 쓴다(). 그래서 주소가 짧고, 기본 화면은 쿼리가 없다.
 * 조건 하나를 고칠 때마다 뒤로 가기 단계가 쌓이지 않도록 기본은 그 자리를 바꿔 끼운다(replace).
 * 새 단계로 남기려면 `replace: false` 를 넘긴다.
 *
 * 한 조작에서 두 번 부르면 두 번째가 첫 번째를 덮어쓰지 않게 방금 쓴 주소를 들고 이어 간다.
 */
export function useQueryParams() {
  const [params, setParams] = useSearchParams();
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  }, [params]);

  const update = useCallback(
    (changes: Record<string, string | string[] | null>, options: { replace?: boolean } = {}) => {
      const next = new URLSearchParams(latest.current);
      for (const [key, value] of Object.entries(changes)) {
        if (Array.isArray(value)) {
          next.delete(key);
          for (const each of value) if (each) next.append(key, each);
        } else if (value) next.set(key, value);
        else next.delete(key);
      }
      // 바뀐 것이 없으면 주소를 다시 쓰지 않는다. 뒤로 가기 단계도, 다시 그리기도 늘지 않는다.
      if (next.toString() === latest.current.toString()) return;
      latest.current = next;
      setParams(next, { replace: options.replace ?? true });
    },
    [setParams],
  );

  return [params, update] as const;
}

/** 주소의 값이 허용한 것 가운데 하나일 때만 받는다. 낯선 값은 기본값으로 돌린다. */
export function readOneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((each) => each === value) ?? fallback;
}

/** 글자를 치는 동안 주소를 고치기까지 기다리는 시간. 한 글자마다 주소가 바뀌지 않게 한다. */
const TYPING_DELAY_MS = 400;

/**
 * 검색어처럼 타이핑하는 입력칸을 주소의 쿼리 하나에 잇는다.
 *
 * 입력칸은 바로 바뀌고 주소는 타자를 멈춘 뒤에 따라간다. 입력칸이 주소를 곧장 따라가게 하면 한글
 * 조립 중에 값이 되돌려져 글자가 깨진다. 뒤로 가기로 주소가 바뀌면 입력칸도 그 값으로 간다.
 */
export function useQueryTextParam(key: string) {
  const [params, update] = useQueryParams();
  const value = params.get(key) ?? '';
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(
      () => update({ [key]: draft.trim() ? draft : null }),
      TYPING_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [draft, value, key, update]);

  return [draft, setDraft] as const;
}
