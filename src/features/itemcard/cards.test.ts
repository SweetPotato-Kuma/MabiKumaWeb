import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOOKUP_MAX_GROUPS,
  LOOKUP_MAX_NAMES,
  canonicalItemName,
  packLookupBatches,
  type ItemCard,
  type ItemCardKey,
} from './cards';

const keys = (category: string, count: number, prefix = category): ItemCardKey[] =>
  Array.from({ length: count }, (_, i) => ({ category, name: `${prefix} ${i}` }));

const namesIn = (batch: { names: string[] }[]) =>
  batch.reduce((sum, group) => sum + group.names.length, 0);

describe('packLookupBatches', () => {
  it('적으면 한 번에 묻는다', () => {
    const batches = packLookupBatches([...keys('검', 3), ...keys('활', 2)]);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([
      { category: '검', names: ['검 0', '검 1', '검 2'] },
      { category: '활', names: ['활 0', '활 1'] },
    ]);
  });

  it('같은 이름은 한 번만 묻는다', () => {
    // 경매장에는 같은 아이템이 여러 줄로 올라온다. 줄마다 물을 이유가 없다.
    const batches = packLookupBatches([
      { category: '검', name: '롱 소드' },
      { category: '검', name: '롱 소드' },
      { category: '검', name: '롱 소드' },
    ]);

    expect(batches).toEqual([[{ category: '검', names: ['롱 소드'] }]]);
  });

  it('한 카테고리가 이름 상한을 넘으면 쪼개서 다음 묶음으로 넘긴다', () => {
    const batches = packLookupBatches(keys('천옷', 150));

    expect(batches.map(namesIn)).toEqual([60, 60, 30]);
    expect(batches.every((batch) => batch.every((group) => group.category === '천옷'))).toBe(true);
  });

  it('어느 묶음도 워커 상한을 넘지 않는다', () => {
    const mixed = [
      ...keys('검', 45),
      ...keys('활', 45),
      ...keys('천옷', 10),
      ...keys('음식', 5),
      ...keys('날개', 5),
      ...keys('꼬리', 5),
      ...keys('모자/가발', 70),
    ];
    const batches = packLookupBatches(mixed);

    for (const batch of batches) {
      expect(namesIn(batch)).toBeLessThanOrEqual(LOOKUP_MAX_NAMES);
      expect(batch.length).toBeLessThanOrEqual(LOOKUP_MAX_GROUPS);
    }
    // 빠뜨린 이름이 없어야 한다.
    expect(batches.reduce((sum, batch) => sum + namesIn(batch), 0)).toBe(mixed.length);
  });

  it('카테고리가 많으면 이름이 적어도 묶음을 나눈다', () => {
    const batches = packLookupBatches(
      ['검', '활', '천옷', '음식', '날개', '꼬리'].map((category) => ({ category, name: '가' })),
    );

    expect(batches.map((batch) => batch.length)).toEqual([4, 2]);
  });

  it('물을 것이 없으면 요청도 없다', () => {
    expect(packLookupBatches([])).toEqual([]);
  });
});

describe('브라우저에 남겨 둔 카드', () => {
  /**
   * 다시 찾아온 사람이 같은 아이템을 볼 때 워커를 부르지 않게 하려는 것이다. 무료 플랜 워커의
   * 하루 요청 한도를 경매장 검색과 같이 쓴다. 남겨 둔 것은 모듈을 처음 읽을 때 되살아나므로
   * 테스트마다 모듈을 새로 읽는다.
   */
  const STORAGE_KEY = 'mabikuma:itemCards:v2';
  const DAY = 24 * 60 * 60 * 1000;
  const card: ItemCard = {
    name: '롱 소드',
    subtitle: '',
    description: '가장 흔한 검.',
    category: '검',
    icon: '0123456789abcdef.png',
    iconUrl: 'https://icons.example/0123456789abcdef.png',
    updated: '2026-09-23',
  };
  const key = (category: string, name: string) => `${category}\u0000${name}`;

  async function freshModule(saved: [string, number, ItemCard | null][]) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    vi.resetModules();
    return import('./cards');
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('사흘이 안 된 카드는 다시 묻지 않고 되살린다', async () => {
    const cards = await freshModule([[key('검', '롱 소드'), Date.now() - DAY, card]]);
    const { result } = renderHook(() => cards.useItemCard('검', '롱 소드'));

    expect(result.current).toEqual(card);
  });

  it('사흘이 지난 카드는 버린다', async () => {
    // 설명을 고쳐 올렸으면 늦어도 사흘 안에는 새로 받는다.
    const cards = await freshModule([[key('검', '롱 소드'), Date.now() - 4 * DAY, card]]);
    const { result } = renderHook(() => cards.useItemCard('검', '롱 소드'));

    expect(result.current).toBeUndefined();
  });

  it('"없더라" 는 한 시간만 믿는다', async () => {
    // 없던 카드는 새 아이템을 올리면 생긴다. 반나절씩 믿었더니 올린 뒤에도 그림이 빈칸이었다.
    const now = Date.now();
    const cards = await freshModule([
      [key('검', '새 검'), now - 30 * 60 * 1000, null],
      [key('검', '옛 검'), now - 2 * 60 * 60 * 1000, null],
    ]);

    expect(renderHook(() => cards.useItemCard('검', '새 검')).result.current).toBeNull();
    expect(renderHook(() => cards.useItemCard('검', '옛 검')).result.current).toBeUndefined();
  });

  it('옛 이름으로 남긴 것은 읽지 않고 지운다', async () => {
    // v1 에는 카드를 올리기 전에 적힌 "없더라" 가 남아 있다. 그대로 믿으면 그림이 빈칸이 된다.
    const legacy = 'mabikuma:itemCards:v1';
    window.localStorage.setItem(legacy, JSON.stringify([[key('대형 낫', '데빌 슬레이어'), Date.now(), null]]));
    vi.resetModules();
    const cards = await import('./cards');

    expect(window.localStorage.getItem(legacy)).toBeNull();
    expect(renderHook(() => cards.useItemCard('대형 낫', '데빌 슬레이어')).result.current).toBeUndefined();
  });

  it('남긴 모양이 깨져 있어도 화면을 깨지 않는다', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{깨진');
    vi.resetModules();
    const cards = await import('./cards');

    expect(renderHook(() => cards.useItemCard('검', '롱 소드')).result.current).toBeUndefined();
  });

  it('카드를 저장하고 나면 남겨 둔 것도 지운다', async () => {
    // 운영자가 방금 고친 카드를 자기 화면에서 바로 봐야 한다.
    const cards = await freshModule([[key('검', '롱 소드'), Date.now(), card]]);
    cards.forgetItemCards();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(renderHook(() => cards.useItemCard('검', '롱 소드')).result.current).toBeUndefined();
  });
});

describe('canonicalItemName', () => {
  it('경매장 이름 앞의 @ 를 뗀다', () => {
    // 이름 사전 수집기가 같은 규칙으로 저장한다. 이게 어긋나면 카드가 안 붙는다.
    expect(canonicalItemName('@롱 소드')).toBe('롱 소드');
    expect(canonicalItemName('  롱 소드 ')).toBe('롱 소드');
    expect(canonicalItemName('롱 소드')).toBe('롱 소드');
  });
});
