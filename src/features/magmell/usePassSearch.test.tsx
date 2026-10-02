import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVER_NAMES } from '@/features/servers/constants';
import type { PassServerResult } from './api';

vi.mock('./api', () => ({ fetchPassServer: vi.fn() }));

/**
 * 서버별 결과를 모듈 메모리에 들고 있어(상점이 바뀔 때까지 다시 받지 않는다) 시험끼리 섞인다. 시험마다 새 모듈을 쓴다.
 */
async function load() {
  vi.resetModules();
  const { fetchPassServer } = await import('./api');
  const { MAX_RETRIES, RETRY_MS, usePassSearch } = await import('./usePassSearch');
  // 가짜 함수는 시험 사이에 이어진다. 부른 횟수를 비운다.
  vi.mocked(fetchPassServer).mockReset();
  return { fetchPassServer: vi.mocked(fetchPassServer), MAX_RETRIES, RETRY_MS, usePassSearch };
}

const NEXT = () => new Date(Date.now() + 10 * 60_000).toISOString();

const ok = (server: string): PassServerResult => ({
  server,
  nextUpdate: NEXT(),
  channels: [
    { channel: 1, nextUpdate: NEXT(), passes: [{ n: '마그 멜 미션 통행증 - 사계의 숲(어려움)', p: 100_000, t: '골드' }] },
  ],
});

/** 넥슨이 "데이터 준비 중" 이라 답한 서버. 통행증이 없는 것이 아니다. */
const notReady = (server: string): PassServerResult => ({
  server,
  nextUpdate: null,
  notReady: true,
  channels: [{ channel: 1, error: 400, notReady: true }],
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('마그 멜 통행증 찾기 훅', () => {
  it('모든 서버가 데이터 준비 중이면 "없음" 이 아니라 준비 중으로 알리고, 스스로 다시 받아 풀리면 결과를 낸다', async () => {
    const { fetchPassServer, RETRY_MS, usePassSearch } = await load();
    let ready = false;
    fetchPassServer.mockImplementation(async (server) => (ready ? ok(server) : notReady(server)));
    const { result } = renderHook(() => usePassSearch());

    await act(async () => {
      await result.current.search();
    });
    expect(result.current.state.status).toBe('notReady');
    expect(result.current.state.results).toEqual([]);

    ready = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_MS);
    });

    expect(result.current.state.status).toBe('done');
    expect(result.current.state.results).toHaveLength(SERVER_NAMES.length);
    expect(result.current.state.failed).toEqual([]);
  });

  it('계속 준비 중이어도 정해진 횟수까지만 다시 받는다', async () => {
    const { fetchPassServer, MAX_RETRIES, RETRY_MS, usePassSearch } = await load();
    fetchPassServer.mockImplementation(async (server) => notReady(server));
    const { result } = renderHook(() => usePassSearch());

    await act(async () => {
      await result.current.search();
    });
    for (let i = 0; i < MAX_RETRIES + 3; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RETRY_MS);
      });
    }

    expect(fetchPassServer.mock.calls.length / SERVER_NAMES.length).toBe(MAX_RETRIES + 1);
  });

  it('일부 서버만 준비 중이면 받은 서버는 보이고 못 받은 서버로 알린다', async () => {
    const { fetchPassServer, usePassSearch } = await load();
    fetchPassServer.mockImplementation(async (server) => (server === '류트' ? notReady(server) : ok(server)));
    const { result } = renderHook(() => usePassSearch());

    await act(async () => {
      await result.current.search();
    });

    expect(result.current.state.status).toBe('done');
    expect(result.current.state.results.map((entry) => entry.server)).not.toContain('류트');
    expect(result.current.state.failed).toEqual([{ server: '류트', channels: [] }]);
  });
});
