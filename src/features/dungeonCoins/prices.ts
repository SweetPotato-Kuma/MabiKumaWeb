import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SNAPSHOT_MAX_AGE_MS } from '@/features/auction/snapshot';
import { useMarketPrices, type PriceState } from '@/features/crafting/market';
import { iconBaseUrl } from '@/features/itemcard/iconMap';

/**
 * 던전 코인 화면의 시세.
 *
 * 교환품과 가공 재료 80여 종을 이름마다 경매장에 물으면 넥슨이 요청을 줄 세워 10초 넘게 걸린다.
 * 워커가 10분마다 이 이름들(priceNames.json)을 받아 파일 하나로 CDN 에 올려 두므로
 * (worker/priceSnapshot.js), 화면은 그 파일 하나를 먼저 받는다. 파일에 없는 이름, 너무 묵은 이름,
 * 파일을 받지 못했을 때만 예전처럼 이름마다 묻는다.
 */

interface PriceFileEntry {
  at: number;
  /** [개당 가격, 개수], 싼 순. */
  offers: [number, number][];
  complete: boolean;
}

export interface PriceFile {
  at: number;
  prices: Record<string, PriceFileEntry>;
}

export const PRICE_FILE_PATH = 'prices/dungeon-coins.js';

/** 워커가 1분마다 CDN 에서 새로 받게 해 두었다. 그보다 자주 다시 받아 봐야 같은 것이 온다. */
const FILE_STALE_MS = 60 * 1000;

export async function fetchPriceFile(signal?: AbortSignal): Promise<PriceFile | null> {
  const response = await fetch(`${iconBaseUrl()}/${PRICE_FILE_PATH}`, { signal });
  // 아직 모은 적이 없다. 이름마다 물으면 된다.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`모아 둔 시세를 받지 못했습니다. (HTTP ${response.status})`);
  return (await response.json()) as PriceFile;
}

/** 파일의 한 이름을 시세로. 없거나 너무 묵었으면 undefined 라 이름마다 묻게 된다. */
export function priceFromFile(
  file: PriceFile | null | undefined,
  name: string,
  now = Date.now(),
): PriceState | undefined {
  const entry = file?.prices[name];
  if (!entry || now - entry.at > SNAPSHOT_MAX_AGE_MS) return undefined;
  const offers = entry.offers.map(([price, count]) => ({ price, count }));
  return {
    status: 'ok',
    price: {
      offers,
      supply: offers.reduce((sum, offer) => sum + offer.count, 0),
      complete: entry.complete,
    },
  };
}

export interface DungeonPrices {
  prices: Map<string, PriceState>;
  /** 모아 둔 시세를 하나라도 썼으면 그중 가장 오래된 것을 모은 시각(ms). */
  collectedAt?: number;
}

export function useDungeonPrices(names: readonly string[]): DungeonPrices {
  const configured = iconBaseUrl() !== '';
  const fileQuery = useQuery({
    queryKey: ['dungeon-coins', 'price-file'],
    queryFn: ({ signal }) => fetchPriceFile(signal),
    enabled: configured,
    staleTime: FILE_STALE_MS,
    retry: false,
  });
  // 파일을 받는 동안은 기다린다. 파일은 금방 오고, 먼저 이름마다 물으면 그 요청이 헛수고가 된다.
  const waiting = configured && fileQuery.isPending;
  const file = fileQuery.data;

  const fromFile = useMemo(() => {
    const found = new Map<string, PriceState>();
    for (const name of names) {
      const price = priceFromFile(file, name);
      if (price) found.set(name, price);
    }
    return found;
  }, [file, names]);

  const liveNames = useMemo(
    () => (waiting ? [] : names.filter((name) => !fromFile.has(name))),
    [waiting, names, fromFile],
  );
  const live = useMarketPrices(liveNames);

  const prices = new Map<string, PriceState>();
  for (const name of names) {
    prices.set(name, fromFile.get(name) ?? live.get(name) ?? { status: 'loading' });
  }
  const times = [...fromFile.keys()].map((name) => file?.prices[name]?.at ?? Infinity);
  return { prices, collectedAt: times.length > 0 ? Math.min(...times) : undefined };
}
