import type { DailySummary, RelicSeriesResponse } from '@/features/market/api';
import { parseRelicOption, RELIC_LEVELS, type RelicScale } from './murias';

/**
 * 유물 옵션 하나의 거래가 추이를 레벨로 나눈다.
 *
 * 워커는 옵션 문장("오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)")마다 거래가를 준다. 문장 하나가 레벨 하나이므로
 * 문장을 읽어 레벨을 구하고, 이름과 최대치가 이 옵션 줄과 같은 문장만 모은다. 앞부분이 같은 다른 옵션의 문장이
 * 섞여 들어오는 것을 여기서 거른다.
 */

/** 거래 한 건. 최근 거래 목록의 한 줄이다. */
export interface RelicTrade {
  price: number;
  qty: number;
  /** 거래 시각(ISO). */
  at: string;
}

export interface LevelTrend {
  /** 날짜별 요약. 오래된 날부터. 거래가 없던 날은 없다. */
  daily: DailySummary[];
  /** 최근 거래. 새것부터. */
  recent: RelicTrade[];
}

const emptyTrend = (): LevelTrend => ({ daily: [], recent: [] });

/** 1레벨부터 10레벨까지 레벨마다의 추이. 거래가 없던 레벨도 빈 값으로 둔다. */
export function trendByLevel(
  series: Pick<RelicSeriesResponse, 'daily' | 'recent'> | undefined,
  row: Pick<RelicScale, 'max' | 'unit'> & { name: string },
): LevelTrend[] {
  const levels = RELIC_LEVELS.map(emptyTrend);
  if (!series) return levels;
  const levelOf = (text: string): number | null => {
    const relic = parseRelicOption(text);
    if (!relic || relic.name !== row.name || relic.max !== row.max || relic.unit !== row.unit) return null;
    return relic.level;
  };

  for (const [text, date, n, qty, lo, mid, hi, total] of series.daily) {
    const level = levelOf(text);
    if (level === null) continue;
    const trend = levels[level - 1];
    // 같은 레벨에 문장이 둘 걸려도(수치 표기만 다른 경우) 같은 날이면 하나로 합친다.
    const same = trend.daily.find((each) => each.date === date);
    if (same) {
      const merged = same.qty + qty;
      const sum = same.avg * same.qty + total;
      same.n += n;
      same.lo = Math.min(same.lo, lo);
      same.hi = Math.max(same.hi, hi);
      same.mid = Math.round((same.mid + mid) / 2);
      same.qty = merged;
      same.avg = merged > 0 ? Math.round(sum / merged) : 0;
      continue;
    }
    trend.daily.push({ date, n, qty, lo, hi, mid, avg: qty > 0 ? Math.round(total / qty) : 0 });
  }
  for (const trend of levels) trend.daily.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const [text, price, qty, at] of series.recent) {
    const level = levelOf(text);
    if (level === null) continue;
    levels[level - 1].recent.push({ price, qty, at });
  }
  return levels;
}
