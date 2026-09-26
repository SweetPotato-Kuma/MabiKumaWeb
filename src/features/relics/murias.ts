import type { ItemOption } from '@/features/auction/types';

/**
 * 무리아스의 유물 옵션 해석.
 *
 * 유물 하나에 스킬 옵션이 한 줄 붙는다. 넥슨 API 는 이를 문장 하나로 준다.
 *   "오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)"
 * 옵션마다 1~10레벨이 있고, 레벨마다 최대치의 10분의 1씩 똑같이 오른다. 그래서 수치와 최대치만
 * 있으면 레벨이 나온다. 700% 가 최대인 옵션은 70% 가 1레벨, 490% 가 7레벨이다.
 *
 * 옵션마다 최대치와 단위(%, 초, 단위 없음)가 달라 수치로 찾으려면 옵션마다 표를 외워야 한다.
 * 레벨로 바꿔 두면 "오버 드라이브 7레벨 이상" 처럼 레벨만 알고도 찾을 수 있다.
 */

/** 유물이 들어 있는 경매장 카테고리. 무리아스와 그 밖의 유물이 함께 있다. */
export const RELIC_CATEGORY = '유물';

/** 무리아스의 유물 스킬 옵션의 option_type. */
export const MURIAS_OPTION_TYPE = '무리아스 유물';

export const MURIAS_RELIC_NAME = '무리아스의 유물';

export const RELIC_MAX_LEVEL = 10;

export const RELIC_LEVELS: readonly number[] = Array.from(
  { length: RELIC_MAX_LEVEL },
  (_, index) => index + 1,
);

/** 옵션 하나의 크기. 레벨마다의 수치를 이것으로 셈한다. */
export interface RelicScale {
  /** 10레벨 수치. */
  max: number;
  /** "%", "초", 또는 빈 문자열. */
  unit: string;
}

export interface RelicOption extends RelicScale {
  /** 스킬과 효과. "오버 드라이브 폭발 공격 대미지". */
  name: string;
  /** 이름 뒤에 오는 말. "증가", "추가". 없으면 빈 문자열. */
  verb: string;
  value: number;
  level: number;
}

/**
 * 수치 한 개와 단위, 증감 말, 괄호 안의 최대치. 이름 쪽에도 숫자가 들어갈 수 있어
 * ("속성 에너지 4개 소모") 이름은 짧게 잡고, 끝에서부터 맞춘다.
 */
const PATTERN =
  /^(.*?)(\d+(?:\.\d+)?)\s*(%|초)?\s*(증가|추가|감소)?\s*\(최대\s*(\d+(?:\.\d+)?)\s*(%|초)?\)\s*$/;

/**
 * 수치가 몇 레벨인지. 레벨 L 은 최대치의 L/10 까지다. 소수 수치(0.35)의 계산 오차로 7 이 7.0000001
 * 이 되지 않게 소수 셋째 자리에서 한 번 반올림하고 올린다. 1~10 을 벗어나면 끝으로 붙인다.
 */
export function relicLevel(value: number, max: number): number | null {
  if (!(value > 0) || !(max > 0)) return null;
  const steps = Math.round(((value * RELIC_MAX_LEVEL) / max) * 1000) / 1000;
  return Math.min(RELIC_MAX_LEVEL, Math.max(1, Math.ceil(steps)));
}

/** 그 레벨의 수치. 7레벨, 최대 700 이면 490. */
export function relicValueAt(scale: RelicScale, level: number): number {
  return Math.round(((scale.max * level) / RELIC_MAX_LEVEL) * 1000) / 1000;
}

/** "490%", "3.5초", "0.35". */
export function formatRelicValue(scale: RelicScale, value: number): string {
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}${scale.unit}`;
}

/** "오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)" 를 읽는다. 모양이 다르면 null. */
export function parseRelicOption(text: string | null | undefined): RelicOption | null {
  const match = PATTERN.exec(text?.trim() ?? '');
  if (!match) return null;
  const name = match[1].trim();
  const value = Number(match[2]);
  const max = Number(match[5]);
  const level = relicLevel(value, max);
  if (!name || level === null) return null;
  return { name, verb: match[4] ?? '', value, max, unit: match[3] ?? match[6] ?? '', level };
}

export function isRelicOption(option: ItemOption): boolean {
  return option.option_type === MURIAS_OPTION_TYPE;
}

/** 매물에 붙은 무리아스 유물 옵션. 없거나 읽지 못하면 null. */
export function relicOptionOf(item: { item_option?: ItemOption[] | null }): RelicOption | null {
  const option = (item.item_option ?? []).find(isRelicOption);
  return option ? parseRelicOption(option.option_value) : null;
}

/**
 * 그 옵션의 매물을 경매장에서 보는 주소. 레벨을 주면 그 레벨만 본다. 경매장 화면이 주소에서
 * 조건을 읽는다(AuctionPage 의 readOptionFilter).
 */
export function muriasAuctionPath(name: string, level?: number): string {
  const params = new URLSearchParams({ category: RELIC_CATEGORY, relic: name });
  if (level !== undefined) {
    params.set('relicMin', String(level));
    params.set('relicMax', String(level));
  }
  return `/auction?${params.toString()}`;
}

/** 그 유물의 매물을 경매장에서 보는 주소. 이름 그대로 찾는다. */
export function relicAuctionPath(itemName: string): string {
  return `/auction?${new URLSearchParams({ category: RELIC_CATEGORY, keyword: itemName }).toString()}`;
}
