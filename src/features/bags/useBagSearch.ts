import { useCallback, useEffect, useRef, useState } from 'react';
import { channelsOf } from '@/features/servers/constants';
import { fetchBagChannel, type BagChannelResult } from './api';

/**
 * 서버 하나의 모든 채널을 받아 온다.
 *
 * 채널마다 워커를 한 번씩 부르고(워커가 그 채널의 NPC 17명을 모은다), 한 번에 여섯 채널씩만
 * 동시에 보낸다. 류트 44채널을 한꺼번에 보내면 워커 뒤에서 넥슨 호출이 748번 동시에 몰린다.
 *
 * 받는 대로 화면에 흘려보낸다. 44채널을 다 기다리지 않아도 먼저 온 채널부터 비교할 수 있다.
 *
 * 저장하지 않는다. 다만 같은 서버를 다음 상점 갱신 전에 다시 찾으면 이 탭 메모리에 있던
 * 결과를 그대로 쓴다. 상점은 에린 하루(현실 36분)마다 바뀌므로 그 전에는 결과가 같다.
 */
const CONCURRENCY = 6;

/**
 * notReady: 넥슨이 모든 채널에서 "데이터 준비 중" 이라 답했다. 상점이 바뀐 직후 몇 분 동안(36분마다) 나온다.
 * 주머니가 없다는 뜻이 아니라 아직 못 받는 것이라, 화면이 그렇게 알리고 잠시 뒤 스스로 다시 받는다.
 */
export type BagSearchStatus = 'idle' | 'loading' | 'done' | 'error' | 'notReady';

/** 준비 중일 때 스스로 다시 받는 간격과 횟수. 합쳐 3분 남짓이면 상점이 열린다. */
export const RETRY_MS = 20_000;
export const MAX_RETRIES = 9;

export interface BagSearchState {
  server: string | null;
  status: BagSearchStatus;
  done: number;
  total: number;
  channels: BagChannelResult[];
  failedChannels: number[];
  /** 받은 채널 가운데 가장 이른 다음 상점 갱신 시각(ms). */
  nextUpdate: number | null;
}

const IDLE: BagSearchState = {
  server: null,
  status: 'idle',
  done: 0,
  total: 0,
  channels: [],
  failedChannels: [],
  nextUpdate: null,
};

const memory = new Map<string, { expiresAt: number; channels: BagChannelResult[] }>();

function earliestUpdate(channels: readonly BagChannelResult[]): number | null {
  const times = channels.map((result) => Date.parse(result.nextUpdate ?? '')).filter(Number.isFinite);
  return times.length > 0 ? Math.min(...times) : null;
}

export function useBagSearch() {
  const [state, setState] = useState<BagSearchState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attemptsRef = useRef(0);
  const searchRef = useRef<(server: string, retry?: boolean) => Promise<void>>(async () => {});

  // 화면을 떠나면 받던 것과 기다리던 재시도를 멈춘다.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(retryRef.current);
    },
    [],
  );

  const search = useCallback(async (server: string, retry = false) => {
    abortRef.current?.abort();
    clearTimeout(retryRef.current);
    // 사용자가 직접 찾을 때만 재시도 횟수를 처음으로 돌린다. 스스로 다시 받는 것은 이어 센다.
    if (!retry) attemptsRef.current = 0;

    const remembered = memory.get(server);
    if (remembered && remembered.expiresAt > Date.now()) {
      setState({
        server,
        status: 'done',
        done: remembered.channels.length,
        total: remembered.channels.length,
        channels: remembered.channels,
        failedChannels: [],
        nextUpdate: remembered.expiresAt,
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const channels = channelsOf(server);
    const results: BagChannelResult[] = [];
    const failed: number[] = [];
    let notReady = 0;
    setState({ ...IDLE, server, status: 'loading', total: channels.length });

    let cursor = 0;
    const runner = async () => {
      while (cursor < channels.length) {
        const channel = channels[cursor];
        cursor += 1;
        try {
          const result = await fetchBagChannel(server, channel, controller.signal);
          if (result.notReady) {
            // 준비 중인 채널은 "주머니 없음" 으로 세지 않는다. 결과에 넣지 않고 못 받은 곳으로 둔다.
            notReady += 1;
            failed.push(channel);
          } else {
            results.push(result);
            // 일부 NPC 를 못 받은 채널은 그 NPC 의 주머니가 빠진 결과다. 받은 것은 보이되 못 받은 곳으로도 알린다.
            if (result.npcs.some((npc) => npc.error !== undefined)) failed.push(channel);
          }
        } catch {
          if (controller.signal.aborted) return;
          failed.push(channel);
        }
        if (controller.signal.aborted) return;
        const snapshot = [...results].sort((a, b) => a.channel - b.channel);
        setState((prev) => ({
          ...prev,
          done: results.length + failed.length,
          channels: snapshot,
          failedChannels: [...failed].sort((a, b) => a - b),
          nextUpdate: earliestUpdate(snapshot),
        }));
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, runner));
    if (controller.signal.aborted) return;

    const sorted = [...results].sort((a, b) => a.channel - b.channel);
    const nextUpdate = earliestUpdate(sorted);
    if (failed.length === 0 && nextUpdate && nextUpdate > Date.now()) {
      memory.set(server, { expiresAt: nextUpdate, channels: sorted });
    }

    // 받은 채널이 하나도 없고 전부 "준비 중" 이면 곧 풀리는 일이다. 몇 번까지 스스로 다시 받는다.
    const allNotReady = results.length === 0 && notReady === channels.length;
    if (allNotReady && attemptsRef.current < MAX_RETRIES) {
      attemptsRef.current += 1;
      retryRef.current = setTimeout(() => void searchRef.current(server, true), RETRY_MS);
    }

    setState((prev) => ({
      ...prev,
      status: allNotReady ? 'notReady' : results.length === 0 ? 'error' : 'done',
      failedChannels: [...failed].sort((a, b) => a - b),
      channels: sorted,
      nextUpdate,
    }));
  }, []);
  // 스스로 다시 받을 때 가장 새 찾기 함수를 부르려고 담아 둔다.
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  return { state, search: useCallback((server: string) => search(server), [search]) };
}
