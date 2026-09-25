import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getAdminKey } from '@/lib/adminKey';
import { getProxyUrl } from '@/lib/settings';

/**
 * 아이템 카드 - 이름 옆에 붙는 아이콘과 설명.
 *
 * 넥슨 API 는 아이템 설명도 아이콘도 주지 않는다. 경매장 응답에 있는 것은 이름과
 * 옵션뿐이다. 그래서 게임 안에서 찍은 툴팁 스크린샷을 읽어 채운다.
 *
 * 사이트가 GitHub Pages 정적 호스팅이라 브라우저가 쓸 곳이 없다. 그래서 카드는
 * 넥슨 키를 들고 있는 그 워커가 대신 보관한다. 설명은 KV 에 카테고리별로, 아이콘은 R2 에
 * 한 장씩 들어간다. 읽기는 누구나, 쓰기는 운영자 키를 가진 사람만. 워커를 붙이지 않은
 * 환경(`VITE_PROXY_URL` 이 빈 경우)에서는 카드가 없는 것으로 보고 사전이 이름만 보여 준다.
 *
 * 대부분의 카드는 운영자가 자기 컴퓨터에서 한꺼번에 올린다. 툴팁 화면은 거기서 빠진 것을
 * 손으로 넣는 자리다.
 *
 * 이름 사전(`dictionary.ts`)이 읽는 정적 파일과는 저장소가 다르다. 그쪽은
 * `scripts/harvest-auction.mjs` 가 통째로 다시 쓰기 때문에, 손으로 채운 내용을
 * 같은 파일에 두면 다음 수집 때 날아간다.
 */

export interface ItemCard {
  name: string;
  /** 이름 아래 작은 회색 줄. 예: "보통속도 3타 악기". 없으면 빈 문자열. */
  subtitle: string;
  description: string;
  /** 사전에서 어느 카테고리 아래 보일지. */
  category: string;
  /** 아이콘 파일 이름. 그림 내용의 해시다. 없으면 빈 문자열. */
  icon: string;
  /**
   * 워커가 붙여 주는 그림 주소. 그림을 워커가 아닌 곳(R2 자체 도메인)에서 내보낼 때만 온다.
   * 없으면 워커 경로로 받는다.
   */
  iconUrl?: string;
  updated: string;
}

export interface ItemCardFile {
  updated: string;
  count: number;
  cards: ItemCard[];
}

const LOOKUP_PATH = '/item-card/lookup';
const CARD_PATH = '/item-card';
const VERIFY_PATH = '/item-card/verify';
const ICON_PATH = '/item-card/icons/';

/** 워커의 LOOKUP_MAX_NAMES 와 같아야 한다. 넘겨 보내면 400 이 돌아온다. */
export const LOOKUP_MAX_NAMES = 60;

/** 운영자 키를 싣는 헤더. 워커의 ADMIN_HEADER 와 같은 이름이어야 한다. */
const ADMIN_HEADER = 'x-mabikuma-admin-key';

/** 아이콘 주소. 워커가 R2 에서 꺼내 준다. 파일 이름이 내용 해시라 영구 캐시가 걸려 있다. */
export function iconUrl(file: string): string {
  return `${getProxyUrl()}${ICON_PATH}${file}`;
}

/** 카드 그림의 실제 주소. 워커가 자체 도메인 주소를 붙여 주면 그쪽이다. 워커 요청 한도를 쓰지 않는다. */
export function iconSrcOf(card: Pick<ItemCard, 'icon' | 'iconUrl'>): string {
  return card.iconUrl ?? iconUrl(card.icon);
}

const preloadedIcons = new Set<string>();

/**
 * 곧 보일 그림을 미리 받아 둔다. 다음 쪽으로 넘기는 순간 그림이 이미 브라우저에 있게 하려는 것이다.
 * 그림 한 장이 2KB 안팎이고 파일 이름이 내용 해시라 한 번 받으면 1년 동안 다시 받지 않는다.
 */
export function preloadItemIcons(srcs: readonly string[]): void {
  if (typeof Image === 'undefined') return;
  for (const src of srcs) {
    if (!src || preloadedIcons.has(src)) continue;
    preloadedIcons.add(src);
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
  }
}

/** 워커가 붙어 있는지. 없으면 카드 기능 전체가 꺼진 것으로 본다. */
export function isCardStoreConfigured(): boolean {
  return getProxyUrl() !== '';
}

async function failureMessage(response: Response, fallback: string): Promise<string> {
  const body = await response
    .json()
    .then((parsed: { error?: { message?: string } }) => parsed.error?.message)
    .catch(() => null);
  return body ?? `${fallback} (HTTP ${response.status})`;
}

/** 워커의 LOOKUP_MAX_GROUPS 와 같아야 한다. 한 번에 섞어 물을 수 있는 카테고리 수. */
export const LOOKUP_MAX_GROUPS = 4;

export interface ItemCardKey {
  category: string;
  name: string;
}

/**
 * 경매장 응답의 `item_name` 을 사전 이름으로 바꾼다.
 *
 * 이름 사전을 모으는 수집기(`scripts/harvest-auction.mjs`)가 앞의 `@` 를 떼고 저장한다.
 * 같은 규칙을 거쳐야 경매장 매물과 사전 카드가 이어진다.
 */
export function canonicalItemName(itemName: string): string {
  return itemName.replace(/^@/, '').trim();
}

/**
 * 물어볼 이름들을 요청 단위로 묶는다.
 *
 * 워커는 한 번에 이름 60 개, 카테고리 4 개까지 받는다. 경매장은 한 검색에 이름이 수백 개,
 * 카테고리가 여럿 섞이므로 그대로 보낼 수 없다. 한 카테고리가 60 개를 넘으면 그 카테고리를
 * 쪼개서 다음 묶음으로 넘긴다.
 */
export function packLookupBatches(
  keys: readonly ItemCardKey[],
): { category: string; names: string[] }[][] {
  const byCategory = new Map<string, string[]>();
  for (const { category, name } of keys) {
    const names = byCategory.get(category) ?? [];
    if (!names.includes(name)) names.push(name);
    byCategory.set(category, names);
  }

  const batches: { category: string; names: string[] }[][] = [];
  let current: { category: string; names: string[] }[] = [];
  let count = 0;

  const flush = () => {
    if (current.length > 0) batches.push(current);
    current = [];
    count = 0;
  };

  for (const [category, names] of byCategory) {
    let rest = names;
    while (rest.length > 0) {
      const room = LOOKUP_MAX_NAMES - count;
      if (room === 0 || current.length === LOOKUP_MAX_GROUPS) {
        flush();
        continue;
      }
      current.push({ category, names: rest.slice(0, room) });
      count += Math.min(room, rest.length);
      rest = rest.slice(room);
    }
  }
  flush();

  return batches;
}

/**
 * 한 번 물어본 카드를 기억해 두는 곳.
 *
 * react-query 대신 따로 두는 이유는 조회 모양 때문이다. 경매장은 한 검색에 이름이 수백 개
 * 나오고 "더 불러오기" 로 늘어난다. 이름 묶음을 캐시 키로 쓰면 한 줄만 늘어도 묶음 전체를
 * 다시 묻는다. 여기서는 이름 하나하나를 기억하고 **모르는 것만** 묻는다. 사전에서 본 것을
 * 경매장에서 다시 묻지도 않는다.
 *
 * 값이 `null` 이면 "물어봤는데 카드가 없더라" 는 뜻이다. `undefined` 는 아직 모른다는 뜻이다.
 */
const known = new Map<string, ItemCard | null>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
/** 기억이 바뀔 때마다 오른다. 화면 전체를 다시 그려야 하는 쪽이 이걸 보고 안다. */
let version = 0;

const keyOf = (category: string, name: string) => `${category}\u0000${name}`;

/**
 * 받아 둔 카드를 이 브라우저에 남겨 둔다.
 *
 * 카드는 거의 바뀌지 않는다. 다시 찾아온 사람이 같은 아이템을 볼 때마다 워커에 묻는 것은
 * 낭비이고, 무료 플랜 워커는 하루 요청 수가 정해져 있으며 그 한도를 경매장 검색과 같이 쓴다.
 * 무엇보다 표의 그림은 이 조회가 끝나야 받기 시작하므로, 묻는 동안 그림 칸이 비어 있다.
 *
 * 그래서 카드가 있는 것은 30일 동안 남겨 두고 **바로 보여 준다.** 하루가 지난 것은 보여 주면서
 * 뒤에서 한 번 더 물어 바꿔 둔다. 설명을 고쳐도 하루 안에는 바뀌고, 그림은 파일 이름이 내용
 * 해시라 옛 카드가 가리키는 그림도 여전히 열린다.
 *
 * "없더라" 는 한 시간만 믿는다. 없던 카드는 새 아이템을 사전에 넣고 카드를 올리면 생긴다.
 * 반나절씩 믿었더니 올리기 전에 한 번 본 사람은 올린 뒤에도 그림이 빈칸으로 남았다.
 * 가장 최근 것 4,000 개까지만 남긴다(1.5MB 남짓).
 *
 * 이름 끝 번호를 올리면 모두의 브라우저에 남은 것을 한 번에 버린다. v1 에는 대형 낫, 힐링 원드,
 * 애뮬릿을 올리기 전에 적힌 "없더라" 가 남아 있어서 v2 로 올렸다.
 */
const STORAGE_KEY = 'mabikuma:itemCards:v2';
const LEGACY_STORAGE_KEYS = ['mabikuma:itemCards:v1'];
const CARD_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const CARD_REFRESH_MS = 24 * 60 * 60 * 1000;
const MISSING_TTL_MS = 60 * 60 * 1000;
const STORAGE_MAX_ENTRIES = 4000;

/** 언제 받았는지. 남겨 둘 때 오래된 것부터 버리고, 불러올 때 유효 기간을 본다. */
const fetchedAt = new Map<string, number>();

/**
 * 워커에 (다시) 물어야 하는지. 모르는 것, 한 시간 지난 "없더라", 하루 지난 카드.
 * 하루 지난 카드는 묻는 동안에도 그대로 보인다. 탭을 오래 열어 둔 사람도 새 카드를 보게 한다.
 */
function needsLookup(key: string, now: number): boolean {
  if (!known.has(key)) return true;
  const age = now - (fetchedAt.get(key) ?? 0);
  return age > (known.get(key) ? CARD_REFRESH_MS : MISSING_TTL_MS);
}

function restoreFromStorage(): void {
  let raw: string | null = null;
  try {
    // 옛 이름으로 남은 것은 읽지 않고 지운다. 자리만 차지한다.
    for (const legacy of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(legacy);
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // 시크릿 모드 등 저장소가 막힌 환경. 없는 셈 친다.
    return;
  }
  if (!raw) return;

  try {
    const now = Date.now();
    for (const [key, at, card] of JSON.parse(raw) as [string, number, ItemCard | null][]) {
      if (now - at > (card ? CARD_KEEP_MS : MISSING_TTL_MS)) continue;
      known.set(key, card);
      fetchedAt.set(key, at);
    }
  } catch {
    // 모양이 깨졌으면 버리고 새로 받는다.
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** 조회가 몰려 끝나도 한 번만 쓴다. 표 하나에 조회가 일곱 번씩 나가기도 한다. */
function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const entries = [...fetchedAt]
        .sort((a, b) => b[1] - a[1])
        .slice(0, STORAGE_MAX_ENTRIES)
        .map(([key, at]) => [key, at, known.get(key) ?? null]);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // 가득 찼거나 막혔으면 이번에는 못 남긴다. 다음에 다시 받으면 된다.
    }
  }, 1000);
}

if (typeof window !== 'undefined') restoreFromStorage();

function emit(): void {
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function lookupBatch(batch: { category: string; names: string[] }[]): Promise<void> {
  const keys = batch.flatMap(({ category, names }) => names.map((name) => keyOf(category, name)));
  for (const key of keys) inFlight.add(key);

  try {
    const response = await fetch(`${getProxyUrl()}${LOOKUP_PATH}`, {
      method: 'POST',
      /**
       * 본문은 JSON 이지만 text/plain 으로 보낸다. application/json 이면 브라우저가 CORS 사전 요청
       * (OPTIONS)을 먼저 보내고 그 답을 기다린다. 그만큼 그림이 늦게 뜬다. 워커는 머리를 보지
       * 않고 본문을 JSON 으로 읽는다. 누구나 읽는 조회라 막을 이유도 없다.
       */
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ groups: batch }),
    });
    // 횟수 제한(429)이나 워커가 잠시 흔들린 경우. "없다" 고 적어 두면 다시 묻지 않으므로
    // 아무것도 적지 않고 넘어간다. 다음에 화면이 바뀔 때 다시 묻는다.
    if (!response.ok) return;

    const found = (await response.json()) as Pick<ItemCardFile, 'cards'>;
    const now = Date.now();
    for (const key of keys) {
      known.set(key, null);
      fetchedAt.set(key, now);
    }
    for (const card of found.cards) known.set(keyOf(card.category, card.name), card);
    emit();
    schedulePersist();
  } catch {
    // 네트워크가 끊긴 경우도 같다. 카드는 덤이다. 이름과 시세는 그대로 보인다.
  } finally {
    for (const key of keys) inFlight.delete(key);
  }
}

/**
 * 이 이름들의 카드를 미리 받아 둔다. 표를 그리는 화면이 한 번 부른다.
 *
 * 칸마다 따로 물으면 경매장 한 쪽에 요청이 수백 번 나간다. 화면이 보이는 이름을 모아
 * 한꺼번에 넘기면 여기서 모르는 것만 골라 60 개씩 묶어 묻는다.
 */
export function usePrefetchItemCards(keys: readonly ItemCardKey[]): void {
  // 매 렌더마다 새 배열이 와도 내용이 같으면 다시 묻지 않도록 내용으로 비교한다.
  const signature = keys.map(({ category, name }) => keyOf(category, name)).join('\u0001');

  useEffect(() => {
    if (!isCardStoreConfigured() || signature === '') return;

    const missing: ItemCardKey[] = [];
    const now = Date.now();
    for (const key of signature.split('\u0001')) {
      if (!needsLookup(key, now) || inFlight.has(key)) continue;
      const [category, name] = key.split('\u0000');
      if (category && name) missing.push({ category, name });
    }
    if (missing.length === 0) return;

    for (const batch of packLookupBatches(missing)) void lookupBatch(batch);
  }, [signature]);
}

/**
 * 카드 한 장. 표의 한 칸이 부른다.
 *
 * 칸마다 따로 구독하는 이유는 경매장 표가 메모로 굳어 있기 때문이다. 카드가 나중에 도착해도
 * 표 전체는 다시 그려지지 않는다. 각 칸이 자기 카드만 지켜보고 있으면 도착한 칸만 바뀐다.
 * 이 훅은 묻지 않는다. 묻는 것은 `usePrefetchItemCards` 몫이다.
 */
export function useItemCard(category: string, name: string): ItemCard | null | undefined {
  const key = keyOf(category, name);
  return useSyncExternalStore(
    subscribe,
    () => known.get(key),
    () => undefined,
  );
}

/** 사전 화면처럼 화면 전체가 다시 그려지는 곳에서 쓴다. 받아 오기와 읽기를 한 번에 한다. */
export function useItemCards(
  keys: readonly ItemCardKey[],
): (category: string, name: string) => ItemCard | undefined {
  usePrefetchItemCards(keys);
  // 기억이 바뀌면 새 함수를 돌려준다. 그래야 이 함수를 받는 표가 다시 그린다.
  const current = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );

  return useCallback(
    (category: string, name: string) =>
      current >= 0 ? (known.get(keyOf(category, name)) ?? undefined) : undefined,
    [current],
  );
}

/** 카드를 저장하고 나면 부른다. 기억해 둔 것을 비워 다음 화면에서 새로 받게 한다. */
export function forgetItemCards(): void {
  known.clear();
  fetchedAt.clear();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 막혀 있으면 애초에 남긴 것도 없다.
  }
  emit();
}

/** 지금 들고 있는 키가 맞는지 워커에 물어본다. 화면을 열기 전에 한 번 확인한다. */
export async function verifyAdminKey(key: string): Promise<boolean> {
  if (!isCardStoreConfigured()) throw new Error('카드 저장소(워커) 주소가 설정되지 않았습니다.');

  const response = await fetch(`${getProxyUrl()}${VERIFY_PATH}`, {
    method: 'POST',
    headers: { [ADMIN_HEADER]: key },
  });

  if (response.status === 401) return false;
  if (!response.ok) throw new Error(await failureMessage(response, '키를 확인하지 못했습니다.'));
  return true;
}

export interface SaveItemCardInput {
  card: Omit<ItemCard, 'icon' | 'updated'>;
  /** PNG 를 base64 로. 아이콘 없이 글자만 고칠 수도 있다. */
  iconBase64: string | null;
}

export interface SaveItemCardResult {
  card: ItemCard;
  count: number;
}

export async function saveItemCard(input: SaveItemCardInput): Promise<SaveItemCardResult> {
  const response = await fetch(`${getProxyUrl()}${CARD_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ADMIN_HEADER]: getAdminKey() },
    body: JSON.stringify(input),
  });

  if (!response.ok) throw new Error(await failureMessage(response, '저장하지 못했습니다.'));
  return (await response.json()) as SaveItemCardResult;
}

/** 잘못 저장한 카드를 지운다. 카테고리를 같이 보내야 어느 칸을 고칠지 워커가 안다. */
export async function deleteItemCard(name: string, category: string): Promise<{ count: number }> {
  const query = `name=${encodeURIComponent(name)}&category=${encodeURIComponent(category)}`;
  const response = await fetch(`${getProxyUrl()}${CARD_PATH}?${query}`, {
    method: 'DELETE',
    headers: { [ADMIN_HEADER]: getAdminKey() },
  });

  if (!response.ok) throw new Error(await failureMessage(response, '지우지 못했습니다.'));
  return (await response.json()) as { count: number };
}
