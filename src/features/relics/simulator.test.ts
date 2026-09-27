import { describe, expect, it } from 'vitest';
import { RELIC_MAX_LEVEL } from './murias';
import { lastTradesByRow, summarizeMurias } from './prices';
import { drawPrice, drawRelic, MURIAS_RELIC_POOL, RELIC_OUTCOMES } from './simulator';

/** 정해 둔 값을 차례로 내놓는 난수. */
const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

const murias = (value: string, price: number) => ({
  item_name: '무리아스의 유물',
  auction_price_per_unit: price,
  item_option: [{ option_type: '무리아스 유물', option_value: value }],
});

describe('drawRelic', () => {
  it('옵션과 레벨을 따로 고른다', () => {
    const draw = drawRelic(3, sequence(0, 0.999_999));
    expect(draw).toEqual({ no: 3, option: MURIAS_RELIC_POOL[0], level: RELIC_MAX_LEVEL });
  });

  it('난수의 구간마다 옵션과 레벨이 하나씩 똑같이 돌아간다', () => {
    const options = new Set<string>();
    const levels = new Set<number>();
    for (let option = 0; option < MURIAS_RELIC_POOL.length; option += 1) {
      for (let level = 0; level < RELIC_MAX_LEVEL; level += 1) {
        const draw = drawRelic(
          1,
          sequence((option + 0.5) / MURIAS_RELIC_POOL.length, (level + 0.5) / RELIC_MAX_LEVEL),
        );
        options.add(draw.option.name);
        levels.add(draw.level);
      }
    }
    expect(options.size).toBe(MURIAS_RELIC_POOL.length);
    expect([...levels].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(RELIC_OUTCOMES).toBe(MURIAS_RELIC_POOL.length * RELIC_MAX_LEVEL);
  });

  it('옵션 이름이 겹치지 않는다', () => {
    expect(new Set(MURIAS_RELIC_POOL.map((option) => option.name)).size).toBe(
      MURIAS_RELIC_POOL.length,
    );
  });
});

describe('drawPrice', () => {
  const overDrive = MURIAS_RELIC_POOL.find(
    (option) => option.name === '오버 드라이브 폭발 공격 대미지',
  )!;
  const summary = summarizeMurias([
    murias('오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 95_000_000),
    murias('오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 80_000_000),
  ]);
  const rowsByKey = new Map(summary.rows.map((row) => [row.key, row]));
  const trades = lastTradesByRow([
    ['오버 드라이브 폭발 공격 대미지 560% 증가 (최대 700%)', 200_000_000, '2026-09-25T03:00:00Z'],
  ]);

  it('그 레벨의 지금 최저가를 쓴다', () => {
    expect(drawPrice({ option: overDrive, level: 7 }, rowsByKey, trades)).toEqual({
      price: 80_000_000,
      source: 'listing',
    });
  });

  it('매물이 없으면 최종 거래가를, 그것도 없으면 null 을 준다', () => {
    expect(drawPrice({ option: overDrive, level: 8 }, rowsByKey, trades)).toEqual({
      price: 200_000_000,
      source: 'trade',
    });
    expect(drawPrice({ option: overDrive, level: 1 }, rowsByKey, trades)).toBeNull();
  });
});
