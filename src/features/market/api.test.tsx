import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Settings from '@/lib/settings';
import { useMarketPopularQuery, useRelicRecentQuery, useRelicSeriesQuery } from './api';

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://worker.test',
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('시세 기록 받기', () => {
  it('연결이 끊기면 까닭 없는 Failed to fetch 대신 읽을 수 있는 문장으로 알린다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

    const series = renderHook(() => useRelicSeriesQuery('오버 드라이브 폭발 공격 대미지'), { wrapper });
    const recent = renderHook(() => useRelicRecentQuery(), { wrapper });
    const popular = renderHook(() => useMarketPopularQuery('24h', true), { wrapper });

    for (const hook of [series, recent, popular]) {
      await waitFor(() => expect(hook.result.current.error).not.toBeNull());
      expect(hook.result.current.error?.message).toContain('시세 기록을 받지 못했습니다');
      expect(hook.result.current.error?.message).not.toContain('Failed to fetch');
    }
  });

  it('서버가 오류로 답하면 상태 번호를 알린다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));

    const { result } = renderHook(() => useRelicSeriesQuery('아무 옵션'), { wrapper });

    await waitFor(() => expect(result.current.error?.message).toContain('HTTP 500'));
  });
});
