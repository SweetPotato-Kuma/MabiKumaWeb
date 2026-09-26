import { describe, expect, it } from 'vitest';
import { relicGradeOf, summarizeMurias, summarizeOtherRelics } from './prices';

const murias = (value: string, price: number) => ({
  item_name: '무리아스의 유물',
  auction_price_per_unit: price,
  item_option: [{ option_type: '무리아스 유물', option_value: value }],
});

describe('summarizeMurias', () => {
  it('옵션과 레벨로 묶어 가장 싼 값과 매물 수를 센다', () => {
    const summary = summarizeMurias([
      murias('오버 드라이브 폭발 공격 대미지 700% 증가 (최대 700%)', 300_000_000),
      murias('오버 드라이브 폭발 공격 대미지 700% 증가 (최대 700%)', 250_000_000),
      murias('오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 80_000_000),
      murias('플레임 버스트 대미지 450% 증가 (최대 450%)', 120_000_000),
      { item_name: '무리아스의 유물(이데아)', auction_price_per_unit: 134_000_000, item_option: null },
      { item_name: '무리아스의 유물(이데아)', auction_price_per_unit: 135_000_000 },
      { item_name: '무리아스의 유물', auction_price_per_unit: 1, item_option: null },
      { item_name: '와드네', auction_price_per_unit: 5 },
    ]);

    expect(summary.listed).toBe(5);
    expect(summary.unread).toBe(1);
    expect(summary.idea).toEqual({ lowest: 134_000_000, count: 2 });
    expect(summary.rows.map((row) => row.name)).toEqual([
      '오버 드라이브 폭발 공격 대미지',
      '플레임 버스트 대미지',
    ]);
    const [overdrive] = summary.rows;
    expect(overdrive.count).toBe(3);
    expect(overdrive.levels[9]).toEqual({ lowest: 250_000_000, count: 2 });
    expect(overdrive.levels[6]).toEqual({ lowest: 80_000_000, count: 1 });
    expect(overdrive.levels[0]).toBeNull();
    expect(overdrive.cheapest).toEqual({ price: 80_000_000, level: 7 });
  });
});

describe('summarizeOtherRelics', () => {
  it('이름 끝의 종류를 떼고 이름별로 묶는다', () => {
    const rows = summarizeOtherRelics([
      { item_name: '와드네(특급)', auction_price_per_unit: 32_000_000 },
      { item_name: '와드네(특급)', auction_price_per_unit: 30_000_000 },
      { item_name: '와드네(이데아)', auction_price_per_unit: 215_000 },
      { item_name: '큰 분노 (이데아)', auction_price_per_unit: 100_000 },
      { item_name: '무리아스의 유물', auction_price_per_unit: 1 },
    ]);
    expect(rows.map((row) => row.name)).toEqual(['와드네', '큰 분노']);
    expect(rows[0].grades).toEqual({
      normal: null,
      special: { lowest: 30_000_000, count: 2, itemName: '와드네(특급)' },
      idea: { lowest: 215_000, count: 1, itemName: '와드네(이데아)' },
    });
    expect(rows[1].grades.idea?.itemName).toBe('큰 분노 (이데아)');
  });

  it('relicGradeOf', () => {
    expect(relicGradeOf('진실의 컵')).toEqual({ name: '진실의 컵', grade: 'normal' });
    expect(relicGradeOf('마법의 솥 (이데아)')).toEqual({ name: '마법의 솥', grade: 'idea' });
  });
});
