import type { ItemOption } from '@/features/auction/types';
import { MURIAS_RELIC_NAME, RELIC_LEVELS, relicOptionOf, type RelicScale } from './murias';

/**
 * 유물 시세 모아 보기. 유물 카테고리의 판매 중 매물을 무리아스의 유물은 옵션과 레벨로,
 * 그 밖의 유물은 종류(일반, 특급, 이데아)로 묶어 가장 싼 값과 매물 수를 센다.
 */

interface PricedItem {
  item_name: string;
  auction_price_per_unit: number;
  item_option?: ItemOption[] | null;
}

/** 한 칸의 값. 그 칸에 든 매물 중 가장 싼 개당 가격과 매물 수. */
export interface PriceCell {
  lowest: number;
  count: number;
}

export interface MuriasRow extends RelicScale {
  /** 표의 키. 이름이 같고 최대치가 다른 옵션이 생겨도 줄이 섞이지 않게 둘을 잇는다. */
  key: string;
  name: string;
  verb: string;
  count: number;
  /** 레벨과 상관없이 가장 싼 매물의 가격과 그 레벨. */
  cheapest: { price: number; level: number };
  /** 1레벨부터 10레벨까지. 매물이 없는 레벨은 null. */
  levels: (PriceCell | null)[];
}

export interface MuriasSummary {
  rows: MuriasRow[];
  /** 무리아스의 유물 매물 수. 옵션이 없는 이데아는 빼고 센다. */
  listed: number;
  /** 옵션을 읽지 못해 표에 넣지 못한 매물 수. 화면에 따로 적는다. */
  unread: number;
  /** 옵션이 붙지 않은 "무리아스의 유물(이데아)". */
  idea: PriceCell | null;
}

const IDEA = /\s*\(이데아\)\s*$/;
const SPECIAL = /\s*\(특급\)\s*$/;

const addTo = (cell: PriceCell | null, price: number): PriceCell =>
  cell
    ? { lowest: Math.min(cell.lowest, price), count: cell.count + 1 }
    : { lowest: price, count: 1 };

const isMurias = (name: string) => name.startsWith(MURIAS_RELIC_NAME);

export function summarizeMurias(items: readonly PricedItem[]): MuriasSummary {
  const rows = new Map<string, MuriasRow>();
  let listed = 0;
  let unread = 0;
  let idea: PriceCell | null = null;

  for (const item of items) {
    if (!isMurias(item.item_name)) continue;
    const price = item.auction_price_per_unit;
    const relic = relicOptionOf(item);
    if (!relic) {
      if (IDEA.test(item.item_name)) idea = addTo(idea, price);
      else {
        listed += 1;
        unread += 1;
      }
      continue;
    }
    listed += 1;
    const key = `${relic.name}\u0000${relic.max}${relic.unit}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        name: relic.name,
        verb: relic.verb,
        max: relic.max,
        unit: relic.unit,
        count: 0,
        cheapest: { price, level: relic.level },
        levels: RELIC_LEVELS.map(() => null),
      };
      rows.set(key, row);
    }
    row.count += 1;
    if (price < row.cheapest.price) row.cheapest = { price, level: relic.level };
    row.levels[relic.level - 1] = addTo(row.levels[relic.level - 1], price);
  }

  return {
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    listed,
    unread,
    idea,
  };
}

/** 그 밖의 유물의 종류. 이름 끝의 "(특급)", "(이데아)" 로 가른다. */
export type RelicGrade = 'normal' | 'special' | 'idea';

export const RELIC_GRADES: { key: RelicGrade; label: string }[] = [
  { key: 'normal', label: '일반' },
  { key: 'special', label: '특급' },
  { key: 'idea', label: '이데아' },
];

export interface OtherRelicRow {
  /** 종류를 뗀 이름. "와드네". */
  name: string;
  count: number;
  grades: Record<RelicGrade, (PriceCell & { itemName: string }) | null>;
}

/** "와드네(특급)" → { name: "와드네", grade: "special" }. "큰 분노 (이데아)" 처럼 띄어 오기도 한다. */
export function relicGradeOf(itemName: string): { name: string; grade: RelicGrade } {
  if (IDEA.test(itemName)) return { name: itemName.replace(IDEA, '').trim(), grade: 'idea' };
  if (SPECIAL.test(itemName)) return { name: itemName.replace(SPECIAL, '').trim(), grade: 'special' };
  return { name: itemName.trim(), grade: 'normal' };
}

/** 무리아스의 유물이 아닌 유물을 이름별로 묶는다. */
export function summarizeOtherRelics(items: readonly PricedItem[]): OtherRelicRow[] {
  const rows = new Map<string, OtherRelicRow>();
  for (const item of items) {
    if (isMurias(item.item_name)) continue;
    const { name, grade } = relicGradeOf(item.item_name);
    let row = rows.get(name);
    if (!row) {
      row = { name, count: 0, grades: { normal: null, special: null, idea: null } };
      rows.set(name, row);
    }
    row.count += 1;
    const cell = addTo(row.grades[grade], item.auction_price_per_unit);
    row.grades[grade] = { ...cell, itemName: item.item_name };
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
