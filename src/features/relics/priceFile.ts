import { useMemo, useState } from 'react';
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { iconBaseUrl } from '@/features/itemcard/iconMap';
import { RELIC_CACHE_MAX_AGE_MS } from './hooks';
import { parseRelicOption, RELIC_LEVELS } from './murias';
import { lastTradesByRow, rowKeyOf, type LastTrade } from './prices';

/**
 * 복원 시뮬레이터가 쓰는 무리아스의 유물 시세.
 *
 * 워커가 10분마다 매물을 모으며 옵션 문장마다 가장 싼 값과 최종 거래가를 파일 하나로 줄여
 * CDN 에 올린다(worker/relicPrices.js). 유물 매물 목록, 그 파일, 거래 기록을 차례로 받던 때는
 * 몇 초씩 걸렸는데, 이제 작은 파일 하나다. 받은 파일은 이 브라우저에 남겨 두고 다음에 열 때
 * 그것부터 보여 준다. 그러면 나온 유물의 시세가 기다림 없이 붙고, 새 파일은 뒤에서 받는다.
 */
export const RELIC_PRICE_FILE_PATH = 'prices/murias-relics.js';

export interface RelicPriceFile {
  /** 매물을 모은 시각(ms). */
  at: number;
  /** 옵션이 없는 이데아의 [가장 싼 값, 매물 수]. 매물이 없으면 null. */
  idea: [number, number] | null;
  /** 옵션 문장마다 [문장, 가장 싼 개당 가격, 매물 수]. */
  offers: [string, number, number][];
  /** 옵션 문장마다 [문장, 최종 거래가, 거래 시각(ISO)]. */
  trades: [string, number, string][];
}

export interface RelicPrices {
  /** 매물을 모은 시각(ms). */
  at: number;
  /** 옵션 줄 키(prices.ts 의 rowKeyOf)마다 1레벨부터 10레벨까지 가장 싼 값. 매물이 없으면 null. */
  listed: ReadonlyMap<string, (number | null)[]>;
  lastTrades: ReadonlyMap<string, (LastTrade | null)[]>;
  /** 이데아 최저가. 매물이 없으면 null. */
  ideaPrice: number | null;
}

/** 파일을 옵션과 레벨로 읽는다. 문장을 읽지 못한 것은 버린다. */
export function relicPricesFromFile(file: RelicPriceFile): RelicPrices {
  const listed = new Map<string, (number | null)[]>();
  for (const [text, lowest] of file.offers) {
    const relic = parseRelicOption(text);
    if (!relic) continue;
    const key = rowKeyOf(relic);
    const levels = listed.get(key) ?? RELIC_LEVELS.map(() => null);
    const previous = levels[relic.level - 1];
    // 수치 표기만 다른 두 문장이 같은 칸에 걸리면 더 싼 것을 쓴다.
    levels[relic.level - 1] = previous === null ? lowest : Math.min(previous, lowest);
    listed.set(key, levels);
  }
  return {
    at: file.at,
    listed,
    lastTrades: lastTradesByRow(file.trades),
    ideaPrice: file.idea?.[0] ?? null,
  };
}

const CACHE_KEY = 'mabikuma:relics:prices';

function isPriceFile(value: unknown): value is RelicPriceFile {
  const file = value as RelicPriceFile | null;
  return (
    !!file &&
    typeof file.at === 'number' &&
    Array.isArray(file.offers) &&
    Array.isArray(file.trades)
  );
}

/** 지난번에 받은 파일. 너무 묵었거나 없으면 null. 유물 시세 화면의 지난 매물과 같은 기한이다. */
export function readRelicPriceCache(now = Date.now()): RelicPriceFile | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null') as unknown;
    if (!isPriceFile(parsed) || now - parsed.at > RELIC_CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRelicPriceCache(file: RelicPriceFile) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(file));
  } catch {
    // 저장소가 막혔거나 가득 찼다. 다음에도 파일을 받으면 된다.
  }
}

async function fetchRelicPriceFile(signal?: AbortSignal): Promise<RelicPriceFile | null> {
  const response = await fetch(`${iconBaseUrl()}/${RELIC_PRICE_FILE_PATH}`, { signal });
  // 아직 모은 적이 없다.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`유물 시세를 받지 못했습니다. (HTTP ${response.status})`);
  const file = (await response.json()) as unknown;
  if (!isPriceFile(file)) throw new Error('유물 시세 파일의 모양이 다릅니다.');
  writeRelicPriceCache(file);
  return file;
}

/** 워커가 1분마다 CDN 에서 새로 받게 해 두었다. 그보다 자주 다시 받아 봐야 같은 것이 온다. */
const FILE_STALE_MS = 60 * 1000;

const relicPriceQuery = () =>
  queryOptions({
    queryKey: ['relics', 'price-file'],
    queryFn: ({ signal }) => fetchRelicPriceFile(signal),
    enabled: iconBaseUrl() !== '',
    staleTime: FILE_STALE_MS,
    retry: false,
  });

/**
 * 다른 화면을 보는 동안 미리 받아 둔다. 시뮬레이터를 처음 여는 사람도 기다리지 않게 하려는 것이다.
 * 파일이 작아(압축해 수 KB) 다른 화면을 느리게 하지 않는다.
 */
export function prefetchRelicPrices(client: QueryClient) {
  if (iconBaseUrl() === '') return;
  void client.prefetchQuery(relicPriceQuery());
}

export type RelicPriceState =
  | { status: 'ready'; prices: RelicPrices; refreshing: boolean }
  | { status: 'loading' }
  | { status: 'off'; error: Error | null };

/**
 * 시뮬레이터가 쓰는 시세. 새 파일이 아직 없으면(받는 중, 실패, 아직 모은 적 없음) 이 브라우저에
 * 남긴 파일을 쓰고, 받는 중이면 refreshing 을 켠다. 둘 다 없으면 받는 동안 loading 이다.
 */
export function useRelicPrices(): RelicPriceState {
  const configured = iconBaseUrl() !== '';
  const query = useQuery(relicPriceQuery());
  // 첫 렌더에서 한 번만 읽는다. 새 파일을 받으면 그것이 이것을 대신한다.
  const [cached] = useState(readRelicPriceCache);
  const fresh = query.data ?? null;
  const file = fresh ?? cached;
  const prices = useMemo(() => (file ? relicPricesFromFile(file) : null), [file]);
  if (prices) return { status: 'ready', prices, refreshing: !fresh && query.isFetching };
  if (configured && query.isPending) return { status: 'loading' };
  return { status: 'off', error: query.error };
}
