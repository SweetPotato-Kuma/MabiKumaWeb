import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iconMapUrl, parseIconMap, useIconMaps, useItemBrief } from './iconMap';

const BASE = 'https://icons.example';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubEnv('VITE_ICON_BASE_URL', `${BASE}/`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** 카테고리마다 목록을 돌려준다. 없는 카테고리는 실패로 답한다. */
function stubMaps(maps: Record<string, Record<string, string[]>>) {
  const urls = new Map<string, string>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const category = urls.get(String(input));
    if (category === undefined || !maps[category]) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ category, items: maps[category] }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    async register(...categories: string[]) {
      for (const category of categories) urls.set(await iconMapUrl(category), category);
    },
  };
}

describe('그림 목록 주소', () => {
  it('카테고리 이름 대신 해시를 쓰고, CDN 이 캐시하는 확장자로 끝난다', async () => {
    // "모자/가발" 처럼 / 가 든 카테고리가 있다. 워커의 iconMapKey 와 같은 규칙이어야 한다.
    const url = await iconMapUrl('모자/가발');

    expect(url).toMatch(/^https:\/\/icons\.example\/maps\/[0-9a-f]{8}\.js$/);
  });
});

describe('parseIconMap', () => {
  it('그림 파일과 부제를 읽고, 부제가 없으면 빈 문자열로 둔다', () => {
    const map = parseIconMap({ items: { '롱 소드': ['a.png', '보통속도 3타'], '숏 소드': ['b.png'] } });

    expect(map.get('롱 소드')).toEqual({ icon: 'a.png', subtitle: '보통속도 3타' });
    expect(map.get('숏 소드')).toEqual({ icon: 'b.png', subtitle: '' });
  });

  it('모양이 깨져 있으면 빈 목록이다', () => {
    expect(parseIconMap(null).size).toBe(0);
    expect(parseIconMap({ items: { a: 'x' } }).size).toBe(0);
  });
});

describe('useItemBrief', () => {
  it('목록에 있으면 그림을, 없으면 카드가 없다고(null) 답한다', async () => {
    const maps = stubMaps({ 검: { '롱 소드': ['a.png'] } });
    await maps.register('검');

    const found = renderHook(() => useItemBrief('검', '롱 소드'), { wrapper });
    await waitFor(() => expect(found.result.current).toEqual({ icon: 'a.png', subtitle: '' }));

    const missing = renderHook(() => useItemBrief('검', '없는 검'), { wrapper });
    await waitFor(() => expect(missing.result.current).toBeNull());
  });

  it('그림 도메인이 없는 빌드에서는 받지 않는다', () => {
    vi.stubEnv('VITE_ICON_BASE_URL', '');
    const maps = stubMaps({});

    const { result } = renderHook(() => useItemBrief('검', '롱 소드'), { wrapper });

    expect(result.current).toBeUndefined();
    expect(maps.fetchMock).not.toHaveBeenCalled();
  });
});

describe('useIconMaps', () => {
  it('보이는 카테고리마다 목록을 한 번만 받는다', async () => {
    const maps = stubMaps({ 검: { '롱 소드': ['a.png'] }, 활: { '숏 보우': ['b.png'] } });
    await maps.register('검', '활');
    const categories = ['검', '검', '활', ''];

    const { result } = renderHook(() => useIconMaps(categories), { wrapper });

    await waitFor(() => expect(result.current.brief('활', '숏 보우')?.icon).toBe('b.png'));
    expect(result.current.brief('검', '롱 소드')?.icon).toBe('a.png');
    expect(maps.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('받는 중에는 기다리고, 받지 못한 카테고리만 워커에 묻게 한다', async () => {
    // 곧 올 목록 대신 워커를 부르면 조회 한도만 깎인다.
    const maps = stubMaps({ 검: { '롱 소드': ['a.png'] } });
    await maps.register('검', '활');
    const categories = ['검', '활'];

    const { result } = renderHook(() => useIconMaps(categories), { wrapper });
    expect(result.current.needsLookup('검')).toBe(false);

    // 실패하면 한 번 더 받아 본 뒤(1초 뒤) 포기한다.
    await waitFor(() => expect(result.current.needsLookup('활')).toBe(true), { timeout: 4000 });
    expect(result.current.needsLookup('검')).toBe(false);
  });
});
