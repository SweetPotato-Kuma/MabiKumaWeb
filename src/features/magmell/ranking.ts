import { SERVER_NAMES } from '@/features/servers/constants';
import type { PassRow, PassServerResult } from './api';

/** 통행증 값은 지금 모두 골드다. 다른 단위가 섞이면 숫자끼리 비교할 수 없어 뒤로 보낸다. */
const MAIN_PRICE_TYPE = '골드';

export interface PassListing {
  key: string;
  server: string;
  channel: number;
  price: number;
  priceType: string | null;
  /** 이 채널에서 이 가격에 파는 통행증. 두 통행증이 같은 값이면 둘 다 들어간다. */
  passNames: string[];
  /** 싼 순위. 값이 같으면 같은 순위다(1, 1, 3). */
  rank: number;
}

export interface RankingOptions {
  /** 비우면 모든 서버. */
  server: string | null;
  /** 비우면 채널마다 가장 싼 통행증. */
  passName: string | null;
}

/** "마그 멜 미션 통행증 - 사계의 숲(어려움)" → "사계의 숲(어려움)". 표에서는 던전 이름만 다르다. */
export function shortPassName(name: string): string {
  return name.replace(/^마그\s*멜\s*미션\s*통행증\s*-\s*/, '') || name;
}

/** 받은 결과에 실제로 나온 통행증 이름. 넥슨이 던전을 바꿔도 따라간다. */
export function passNamesOf(results: readonly PassServerResult[]): string[] {
  const names = new Set<string>();
  for (const result of results) {
    for (const entry of result.channels) {
      for (const pass of entry.passes ?? []) names.add(pass.n);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}

function serverOrder(server: string): number {
  const index = (SERVER_NAMES as readonly string[]).indexOf(server);
  return index === -1 ? SERVER_NAMES.length : index;
}

function comparePrice(a: { price: number; priceType: string | null }, b: typeof a): number {
  const aMain = a.priceType === MAIN_PRICE_TYPE ? 0 : 1;
  const bMain = b.priceType === MAIN_PRICE_TYPE ? 0 : 1;
  return aMain - bMain || a.price - b.price;
}

/**
 * 채널마다 한 줄씩 만들어 싼 순으로 늘어놓는다.
 *
 * 한 채널에 통행증이 둘 이상이면 고른 통행증의 값을, 고르지 않았으면 가장 싼 값을 쓴다.
 * 값이 같으면 서버 순서, 채널 순서로 둔다. 네 서버를 합쳐도 101줄이라 거를 때마다 다시
 * 계산한다.
 */
export function buildPassRanking(
  results: readonly PassServerResult[],
  options: RankingOptions,
): PassListing[] {
  const rows: Omit<PassListing, 'rank'>[] = [];

  for (const result of results) {
    if (options.server && result.server !== options.server) continue;

    for (const entry of result.channels) {
      const candidates = (entry.passes ?? []).filter(
        (pass): pass is PassRow & { p: number } =>
          pass.p !== null && (!options.passName || pass.n === options.passName),
      );
      if (candidates.length === 0) continue;

      const cheapest = candidates.reduce((best, pass) =>
        comparePrice({ price: pass.p, priceType: pass.t }, { price: best.p, priceType: best.t }) < 0
          ? pass
          : best,
      );
      const passNames = candidates
        .filter((pass) => pass.p === cheapest.p && pass.t === cheapest.t)
        .map((pass) => pass.n);

      rows.push({
        key: `${result.server}|${entry.channel}`,
        server: result.server,
        channel: entry.channel,
        price: cheapest.p,
        priceType: cheapest.t,
        passNames,
      });
    }
  }

  rows.sort(
    (a, b) =>
      comparePrice(a, b) || serverOrder(a.server) - serverOrder(b.server) || a.channel - b.channel,
  );

  const ranked: PassListing[] = [];
  rows.forEach((row, index) => {
    const previous = ranked[index - 1];
    const rank = previous && comparePrice(previous, row) === 0 ? previous.rank : index + 1;
    ranked.push({ ...row, rank });
  });
  return ranked;
}
