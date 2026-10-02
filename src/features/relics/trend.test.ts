import { describe, expect, it } from 'vitest';
import type { RelicSeriesResponse } from '@/features/market/api';
import { trendByLevel } from './trend';

const NAME = '오버 드라이브 폭발 공격 대미지';
const L7 = `${NAME} 490% 증가 (최대 700%)`;
const L10 = `${NAME} 700% 증가 (최대 700%)`;
// 이름 앞부분이 같고 최대치가 다른 옵션.
const OTHER_MAX = `${NAME} 70% 증가 (최대 100%)`;
const OTHER_NAME = `${NAME} 증폭 35% 증가 (최대 50%)`;
const row = { name: NAME, max: 700, unit: '%' };

const series: Pick<RelicSeriesResponse, 'daily' | 'recent'> = {
  daily: [
    [L7, '2026-09-25', 3, 3, 1_000_000, 3_000_000, 5_000_000, 9_000_000],
    [L7, '2026-09-24', 1, 2, 2_000_000, 2_000_000, 2_000_000, 4_000_000],
    [L10, '2026-09-25', 1, 1, 9_000_000, 9_000_000, 9_000_000, 9_000_000],
    [OTHER_MAX, '2026-09-25', 2, 2, 1, 1, 1, 2],
    [OTHER_NAME, '2026-09-25', 2, 2, 1, 1, 1, 2],
  ],
  recent: [
    [L7, 1_000_000, 1, '2026-09-25T02:59:00.000Z'],
    [OTHER_NAME, 5, 1, '2026-09-25T02:58:00.000Z'],
    [L10, 9_000_000, 1, '2026-09-25T02:57:00.000Z'],
  ],
};

describe('유물 옵션 거래가를 레벨로 나눈다', () => {
  it('문장을 레벨로 읽어 레벨마다 날짜별 요약과 최근 거래를 모은다', () => {
    const levels = trendByLevel(series, row);

    expect(levels).toHaveLength(10);
    expect(levels[6].daily.map((day) => day.date)).toEqual(['2026-09-24', '2026-09-25']);
    expect(levels[6].daily[1]).toEqual({ date: '2026-09-25', n: 3, qty: 3, lo: 1_000_000, mid: 3_000_000, hi: 5_000_000, avg: 3_000_000 });
    expect(levels[6].recent).toEqual([{ price: 1_000_000, qty: 1, at: '2026-09-25T02:59:00.000Z' }]);
    expect(levels[9].recent[0].price).toBe(9_000_000);
  });

  it('이름이 다르거나 최대치가 다른 옵션의 문장은 섞지 않는다', () => {
    const levels = trendByLevel(series, row);
    const all = levels.flatMap((level) => level.daily);

    expect(all.every((day) => day.lo > 1)).toBe(true);
    expect(levels.flatMap((level) => level.recent).map((trade) => trade.price)).not.toContain(5);
  });

  it('거래가 없던 레벨은 빈 값이고, 응답이 없어도 열 칸이다', () => {
    const levels = trendByLevel(series, row);

    expect(levels[0]).toEqual({ daily: [], recent: [] });
    expect(trendByLevel(undefined, row)).toHaveLength(10);
  });

  it('같은 레벨 문장이 둘이어도 같은 날은 하나로 합친다', () => {
    const levels = trendByLevel(
      {
        daily: [
          [`${NAME} 70% 증가 (최대 700%)`, '2026-09-25', 1, 1, 100, 100, 100, 100],
          [`${NAME} 70.0% 증가 (최대 700%)`, '2026-09-25', 1, 3, 50, 50, 50, 150],
        ],
        recent: [],
      },
      row,
    );

    expect(levels[0].daily).toHaveLength(1);
    expect(levels[0].daily[0]).toMatchObject({ n: 2, qty: 4, lo: 50, hi: 100, avg: 63 });
  });
});
