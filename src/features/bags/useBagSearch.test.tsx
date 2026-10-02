import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { channelsOf } from '@/features/servers/constants';
import type { BagChannelResult } from './api';
import { fetchBagChannel } from './api';
import { MAX_RETRIES, RETRY_MS, useBagSearch } from './useBagSearch';

vi.mock('./api', () => ({ fetchBagChannel: vi.fn() }));

const NEXT = () => new Date(Date.now() + 10 * 60_000).toISOString();

const ok = (server: string, channel: number): BagChannelResult => ({
  server,
  channel,
  nextUpdate: NEXT(),
  npcs: [{ npc: '상인 라누', nextUpdate: NEXT(), bags: [{ n: '튼튼한 주머니', c: ['aabbcc'], p: 1, t: '골드' }] }],
});

/** 넥슨이 "데이터 준비 중" 이라 답한 채널. 주머니가 없는 것이 아니다. */
const notReady = (server: string, channel: number): BagChannelResult => ({
  server,
  channel,
  nextUpdate: null,
  notReady: true,
  npcs: [{ npc: '상인 라누', error: 400, notReady: true }],
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(fetchBagChannel).mockReset();
});

describe('튼튼한 주머니 찾기 훅', () => {
  it('모든 채널이 데이터 준비 중이면 "없음" 이 아니라 준비 중으로 알리고, 스스로 다시 받아 풀리면 결과를 낸다', async () => {
    let ready = false;
    vi.mocked(fetchBagChannel).mockImplementation(async (server, channel) =>
      ready ? ok(server, channel) : notReady(server, channel),
    );
    const { result } = renderHook(() => useBagSearch());

    await act(async () => {
      await result.current.search('울프');
    });
    expect(result.current.state.status).toBe('notReady');
    expect(result.current.state.channels).toEqual([]);

    // 상점이 열린다. 기다린 만큼 지나면 스스로 다시 받아 결과가 나온다.
    ready = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_MS);
    });

    expect(result.current.state.status).toBe('done');
    expect(result.current.state.channels).toHaveLength(channelsOf('울프').length);
    expect(result.current.state.failedChannels).toEqual([]);
  });

  it('계속 준비 중이어도 정해진 횟수까지만 다시 받는다', async () => {
    vi.mocked(fetchBagChannel).mockImplementation(async (server, channel) => notReady(server, channel));
    const { result } = renderHook(() => useBagSearch());

    await act(async () => {
      await result.current.search('하프');
    });
    for (let i = 0; i < MAX_RETRIES + 3; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RETRY_MS);
      });
    }

    // 처음 한 번과 스스로 다시 받은 MAX_RETRIES 번. 그 뒤로는 멈춘다.
    const rounds = vi.mocked(fetchBagChannel).mock.calls.length / channelsOf('하프').length;
    expect(rounds).toBe(MAX_RETRIES + 1);
    expect(result.current.state.status).toBe('notReady');
  });

  it('일부 NPC 를 못 받은 채널은 받은 것은 보이고 못 받은 곳으로도 알리며, 다음 찾기에 다시 받는다', async () => {
    vi.mocked(fetchBagChannel).mockImplementation(async (server, channel) =>
      channel === 2
        ? { ...ok(server, channel), npcs: [...ok(server, channel).npcs, { npc: '상인 누누', error: 500 }] }
        : ok(server, channel),
    );
    const { result } = renderHook(() => useBagSearch());

    await act(async () => {
      await result.current.search('만돌린');
    });

    expect(result.current.state.status).toBe('done');
    expect(result.current.state.failedChannels).toEqual([2]);
    expect(result.current.state.channels.find((entry) => entry.channel === 2)).toBeDefined();

    // 빠진 NPC 가 있는 결과는 상점이 바뀔 때까지 기억하지 않는다. 다시 찾으면 다시 받는다.
    const before = vi.mocked(fetchBagChannel).mock.calls.length;
    await act(async () => {
      await result.current.search('만돌린');
    });
    expect(vi.mocked(fetchBagChannel).mock.calls.length).toBeGreaterThan(before);
  });
});
