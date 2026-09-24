import type { BagChannelResult } from './api';
import { hexToRgb, similarity, type Rgb } from './color';

export interface BagListing {
  key: string;
  name: string;
  channel: number;
  npc: string;
  colors: string[];
  price: number | null;
  priceType: string | null;
  /** 원하는 색과 비슷한 정도(0~100). 비교한 파트들의 평균이다. 비교한 파트가 없으면 null. */
  score: number | null;
  /** 비교한 파트 번호(0 = 파트 A). */
  comparedParts: number[];
}

interface ListingOptions {
  /** 볼 주머니 이름. null 이면 모든 주머니. */
  bagNames: ReadonlySet<string> | null;
  /**
   * 파트 A, B, C 에 원하는 색("#ffffff"). null 인 파트는 검색에서 뺀다(어떤 색이든 된다).
   * 모두 null 이면 색으로 비교하지 않는다.
   */
  targets: readonly (string | null)[];
}

/**
 * 채널별로 받은 결과를 한 줄씩 펼쳐, 원하는 색에 가까운 순으로 늘어놓는다.
 *
 * 색은 파트마다 따로 정한다. 정한 파트마다 비슷한 정도를 재서 평균을 낸다. 정한 파트가 없는
 * 주머니(파트 C 를 정했는데 파트가 둘뿐인 주머니)는 비교할 수 없어 뺀다.
 *
 * 류트 한 서버가 2만 줄 남짓이라 매번 전부 다시 계산해도 몇 ms 면 끝난다. 그래서 주머니나
 * 색을 바꿀 때 다시 받지 않고 여기서 다시 거른다.
 */
export function buildListings(
  channels: readonly BagChannelResult[],
  options: ListingOptions,
): BagListing[] {
  const wanted = options.targets
    .map((hex, part) => ({ part, rgb: hex ? hexToRgb(hex) : null }))
    .filter((entry): entry is { part: number; rgb: Rgb } => entry.rgb !== null);
  const comparedParts = wanted.map((entry) => entry.part);
  const rows: BagListing[] = [];

  for (const result of channels) {
    for (const seller of result.npcs) {
      (seller.bags ?? []).forEach((bag, index) => {
        if (options.bagNames && !options.bagNames.has(bag.n)) return;

        let score: number | null = null;
        if (wanted.length > 0) {
          let total = 0;
          for (const { part, rgb } of wanted) {
            const color = bag.c[part] ? hexToRgb(bag.c[part]) : null;
            // 정한 파트가 없는 주머니는 비교할 수 없어 뺀다.
            if (!color) return;
            total += similarity(rgb, color);
          }
          score = Math.round((total / wanted.length) * 10) / 10;
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
          comparedParts,
        });
      });
    }
  }

  rows.sort((a, b) => {
    if (wanted.length > 0) {
      const byScore = (b.score ?? 0) - (a.score ?? 0);
      if (byScore !== 0) return byScore;
    }
    return (
      a.channel - b.channel ||
      a.npc.localeCompare(b.npc, 'ko') ||
      a.name.localeCompare(b.name, 'ko')
    );
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
