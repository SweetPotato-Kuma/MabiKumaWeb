import {
  channelsCloseness,
  channelsMatch,
  hasColorChannels,
  type ColorChannels,
} from '@/features/colorChannels';
import type { BagChannelResult } from './api';
import { hexToRgb } from './color';

export interface BagListing {
  key: string;
  name: string;
  channel: number;
  npc: string;
  colors: string[];
  price: number | null;
  priceType: string | null;
  /**
   * 건 조건의 바라는 값에 가까운 정도(0~100). 조건을 건 파트들의 평균이다. 조건이 없으면 null.
   * 기준값을 정한 유사도는 그 값과의 거리이고, 범위는 가운데와의 거리다(channelsCloseness).
   */
  score: number | null;
  /** 조건을 건 파트 번호(0 = 파트 A). */
  comparedParts: number[];
}

/** 색 조건을 건 파트. 채널을 하나도 채우지 않았거나 끈 파트는 빠진다. */
export interface NarrowedPart {
  part: number;
  channels: ColorChannels;
}

/** 파트별 조건에서 실제로 거르는 파트만 고른다. */
export function narrowParts(parts: readonly (ColorChannels | null)[]): NarrowedPart[] {
  return parts
    .map((partChannels, part) => ({ part, channels: partChannels }))
    .filter(
      (entry): entry is NarrowedPart => entry.channels !== null && hasColorChannels(entry.channels),
    );
}

/**
 * 주머니 하나의 색이 조건에 드는지와 가까운 정도. 건 파트의 채널을 모두 만족해야 들고, 가까운 정도는 건
 * 파트마다 잰 값의 평균이다(0~100, 소수 첫째 자리). 조건을 건 파트의 색이 없으면(파트 C 를 걸었는데 파트가
 * 둘뿐인 주머니) 비교할 수 없어 들지 않는다. 들지 않으면 false, 조건이 없으면 null 이다.
 */
export function scoreBagColors(
  colors: readonly string[],
  narrowed: readonly NarrowedPart[],
): number | null | false {
  if (narrowed.length === 0) return null;
  let total = 0;
  for (const { part, channels } of narrowed) {
    const color = colors[part] ? hexToRgb(colors[part]) : null;
    if (!color || !channelsMatch(channels, color)) return false;
    total += channelsCloseness(channels, color) ?? 0;
  }
  return Math.round((total / narrowed.length) * 10) / 10;
}

interface ListingOptions {
  /** 볼 주머니 이름. null 이면 모든 주머니. */
  bagNames: ReadonlySet<string> | null;
  /**
   * 파트 A, B, C 의 채널별 조건. 건 채널이 있는 파트는 그 채널을 모두 만족하는 주머니만 남긴다.
   * null 이거나 채널을 하나도 걸지 않은 파트는 거르지 않는다(어떤 색이든 된다).
   */
  parts: readonly (ColorChannels | null)[];
}

/**
 * 채널별로 받은 결과를 한 줄씩 펼쳐, 조건에 든 것만 바라는 값에 가까운 순으로 늘어놓는다.
 *
 * 조건은 파트마다 R, G, B 를 따로 건다. 건 파트의 채널을 모두 만족해야 남는다. 조건을 건 파트의
 * 색이 없는 주머니(파트 C 를 걸었는데 파트가 둘뿐인 주머니)는 비교할 수 없어 뺀다. 파트마다 가까운
 * 정도를 재어 평균을 낸다.
 *
 * 류트 한 서버가 2만 줄 남짓이라 매번 전부 다시 계산해도 몇 ms 면 끝난다. 그래서 주머니나
 * 조건을 바꿀 때 다시 받지 않고 여기서 다시 거른다.
 */
export function buildListings(
  channels: readonly BagChannelResult[],
  options: ListingOptions,
): BagListing[] {
  const narrowed = narrowParts(options.parts);
  const comparedParts = narrowed.map((entry) => entry.part);
  const rows: BagListing[] = [];

  for (const result of channels) {
    for (const seller of result.npcs) {
      (seller.bags ?? []).forEach((bag, index) => {
        if (options.bagNames && !options.bagNames.has(bag.n)) return;

        const score = scoreBagColors(bag.c, narrowed);
        // 조건을 건 파트의 색이 없거나 조건에 맞지 않는 주머니는 뺀다.
        if (score === false) return;

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
    if (narrowed.length > 0) {
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
