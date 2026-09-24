import { useCallback, useEffect, useRef, useState } from 'react';
import { channelsOf } from '@/features/npcshop/constants';
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

export type BagSearchStatus = 'idle' | 'loading' | 'done' | 'error';

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

  // 화면을 떠나면 받던 것을 멈춘다.
  useEffect(() => () => abortRef.current?.abort(), []);

  const search = useCallback(async (server: string) => {
    abortRef.current?.abort();

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
    setState({ ...IDLE, server, status: 'loading', total: channels.length });

    let cursor = 0;
    const runner = async () => {
      while (cursor < channels.length) {
        const channel = channels[cursor];
        cursor += 1;
        try {
          results.push(await fetchBagChannel(server, channel, controller.signal));
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

    setState((prev) => ({
      ...prev,
      status: results.length === 0 ? 'error' : 'done',
      channels: sorted,
      nextUpdate,
    }));
  }, []);

  return { state, search };
}
