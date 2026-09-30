import type { ReactNode } from 'react';

/**
 * 계산기 틀. 새 계산기는 입력 스키마(fields)와 계산 함수(compute)만 적으면 틀(CalculatorView)이 입력칸, 시세
 * 자동 채움, 결과, 복사와 공유 링크, 모바일 하단 바를 모두 그린다. 화면 구조, 시세 연동 방식, 결과 표시가
 * 계산기마다 제각각이 되지 않게 하려는 것이다.
 */

/** 입력 값. 빈 금액 칸(시세 자동)은 null 이다. */
export type FieldValue = number | string | boolean | null;
export type Values = Record<string, FieldValue>;

interface FieldBase {
  /** 주소에 쓰는 이름이자 compute 가 읽는 이름. */
  key: string;
  label: string;
  /** 칸 아래 작은 글씨. 입력에 필요한 말만 적는다. */
  hint?: string;
}

/** 골드 금액. 억, 만 단위 빠른 증가 단추를 둘 수 있다. */
export interface GoldField extends FieldBase {
  type: 'gold';
  default: number | null;
  /** 빠른 증가 단추의 값(예: 100_000_000, 10_000_000). */
  quick?: readonly number[];
  /**
   * 경매장 시세로 자동 채울 아이템 이름. 칸을 비워 두면 그 시세를 쓰고, 직접 넣으면 그 값이 덮어쓴다.
   * 덮어쓴 값만 주소에 담긴다.
   */
  autoFill?: string;
}

export interface NumberField extends FieldBase {
  type: 'number';
  default: number;
  min: number;
  max: number;
  suffix?: string;
}

export interface ToggleField extends FieldBase {
  type: 'toggle';
  default: boolean;
}

export interface ChoiceField extends FieldBase {
  type: 'choice';
  default: string;
  options: readonly { value: string; label: string }[];
}

/** 아이템 이름. 아이템 정보와 같은 초성 검색 자동완성을 쓴다. */
export interface ItemField extends FieldBase {
  type: 'item';
  default: string;
}

export type Field = GoldField | NumberField | ToggleField | ChoiceField | ItemField;

/** 결과의 한 줄. gold 는 설정의 가격 표기로 적는다. 시세가 없어 모르면 null 이다. */
export interface CalcRow {
  label: string;
  gold?: number | null;
  text?: string;
  strong?: boolean;
}

/** 표의 칸. 글이거나 골드 금액이거나, 금액 구간(to 가 null 이면 그 이상)이다. */
export type Cell = string | { gold: number | null } | { goldRange: readonly [number, number | null] };

export interface CalcTable {
  columns: readonly string[];
  rows: readonly Cell[][];
  /** 강조할 줄(가장 유리한 것 등). */
  highlight?: number;
}

export interface CalcResult {
  /** 크게 보여 주는 핵심 숫자 1~2개. 모바일 하단 바에도 들어간다. */
  headline: CalcRow[];
  /** 접을 수 있는 상세 내역. */
  table?: CalcTable;
  details?: CalcRow[];
  /** 결과 옆 ⓘ 에 보이는 계산식. */
  formula: string;
  /** 결과 아래 짧은 주의. 계산이 가정한 것만 적는다. */
  notes?: string[];
}

/** compute 가 시세를 읽는 길. 기준(최저가, 1일 중위)은 틀이 고른 대로 돌려준다. */
export interface CalcContext {
  /** 아이템 시세. 시세가 없거나 아직 받는 중이면 null. */
  quote: (name: string) => number | null;
}

export interface RelatedLink {
  label: string;
  to: string;
}

export interface CalculatorDef {
  id: string;
  title: string;
  /** 목록 카드와 검색엔진용 한 줄 설명. */
  summary: string;
  icon?: ReactNode;
  fields: readonly Field[];
  /** 시세를 받을 아이템 이름. 자동 채움 칸과 compute 가 필요한 것을 모두 돌려준다. */
  quoteNames?: (values: Values) => string[];
  compute: (values: Values, context: CalcContext) => CalcResult;
  /** 이 계산기와 이어지는 화면. 상단 칩으로 보인다. */
  related?: readonly RelatedLink[];
}

/** 기본값으로 채운 입력. */
export function defaultValues(fields: readonly Field[]): Values {
  return Object.fromEntries(fields.map((field) => [field.key, field.default]));
}
