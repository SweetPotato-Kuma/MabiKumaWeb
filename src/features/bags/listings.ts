import type { BagChannelResult } from './api';
import { hexToRgb, similarity } from './color';

/** 원하는 색을 어느 파트와 비교할지. 'any' 는 세 파트 중 가장 가까운 것. */
export type PartMode = 'any' | 0 | 1 | 2;

export interface BagListing {
  key: string;
  name: string;
  channel: number;
  npc: string;
  colors: string[];
  price: number | null;
  priceType: string | null;
  /** 원하는 색과 비슷한 정도(0~100). 색을 고르지 않았으면 null. */
  score: number | null;
  /** 가장 비슷했던 파트 번호(0 = 파트 A). 색을 고르지 않았으면 null. */
  matchedPart: number | null;
}

interface ListingOptions {
  /** 비우면 모든 주머니. */
  bagName: string;
  /** "#ffffff" 같은 색. 비우면 색으로 비교하지 않는다. */
  color: string | null;
  part: PartMode;
}

/**
 * 채널별로 받은 결과를 한 줄씩 펼쳐, 원하는 색에 가까운 순으로 늘어놓는다.
 *
 * 류트 한 서버가 2만 줄 남짓이라 매번 전부 다시 계산해도 몇 ms 면 끝난다. 그래서 주머니나
 * 색을 바꿀 때 다시 받지 않고 여기서 다시 거른다.
 */
export function buildListings(channels: readonly BagChannelResult[], options: ListingOptions): BagListing[] {
  const target = options.color ? hexToRgb(options.color) : null;
  const rows: BagListing[] = [];

  for (const result of channels) {
    for (const seller of result.npcs) {
      (seller.bags ?? []).forEach((bag, index) => {
        if (options.bagName && bag.n !== options.bagName) return;

        let score: number | null = null;
        let matchedPart: number | null = null;
        if (target) {
          const parts = options.part === 'any' ? bag.c.map((_, part) => part) : [options.part];
          for (const part of parts) {
            const rgb = bag.c[part] ? hexToRgb(bag.c[part]) : null;
            if (!rgb) continue;
            const value = similarity(target, rgb);
            if (score === null || value > score) {
              score = value;
              matchedPart = part;
            }
          }
          // 고른 파트가 없는 주머니는 비교할 수 없어 뺀다.
          if (score === null) return;
        }

        rows.push({
          key: `${result.channel}|${seller.npc}|${index}`,
          name: bag.n,
          channel: result.channel,
          npc: seller.npc,
          colors: bag.c,
          price: bag.p,
          priceType: bag.t,
          score,
          matchedPart,
        });
      });
    }
  }

  rows.sort((a, b) => {
    if (target) {
      const byScore = (b.score ?? 0) - (a.score ?? 0);
      if (byScore !== 0) return byScore;
    }
    return a.channel - b.channel || a.npc.localeCompare(b.npc, 'ko') || a.name.localeCompare(b.name, 'ko');
  });

  return rows;
}

/** 받은 결과에 실제로 나온 주머니 이름. 선택 목록을 데이터에서 만든다. */
export function bagNamesOf(channels: readonly BagChannelResult[]): string[] {
  const names = new Set<string>();
  for (const result of channels) {
    for (const seller of result.npcs) for (const bag of seller.bags ?? []) names.add(bag.n);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}
