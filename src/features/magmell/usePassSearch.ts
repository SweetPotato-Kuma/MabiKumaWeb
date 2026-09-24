import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_NAMES } from '@/features/servers/constants';
import { fetchPassServer, type PassServerResult } from './api';

/**
 * 네 서버의 통행증 값을 받아 온다.
 *
 * 서버마다 워커를 한 번씩, 넷을 한꺼번에 부른다. 워커 뒤에서는 채널 수만큼 넥슨 호출이
 * 나가지만(모두 합쳐 101번) 튼튼한 주머니 한 서버(748번)보다 훨씬 적다. 받는 대로 화면에
 * 흘려보내 먼저 온 서버부터 비교할 수 있게 한다.
 *
 * 저장하지 않는다. 다만 같은 서버를 다음 상점 갱신 전에 다시 부르면 이 탭 메모리에 있던
 * 결과를 그대로 쓴다. 상점은 에린 하루(현실 36분)마다 바뀌므로 그 전에는 결과가 같다.
 */

export type PassSearchStatus = 'idle' | 'loading' | 'done' | 'error';

export interface FailedChannel {
  server: string;
  /** 비어 있으면 서버 전체를 받지 못한 것이다. */
  channels: number[];
}

export interface PassSearchState {
  status: PassSearchStatus;
  done: number;
  total: number;
  results: PassServerResult[];
  failed: FailedChannel[];
  /** 받은 서버 가운데 가장 이른 다음 상점 갱신 시각(ms). */
  nextUpdate: number | null;
}

const IDLE: PassSearchState = {
  status: 'idle',
  done: 0,
  total: 0,
  results: [],
  failed: [],
  nextUpdate: null,
};

const memory = new Map<string, { expiresAt: number; result: PassServerResult }>();

function earliestUpdate(results: readonly PassServerResult[]): number | null {
  const times = results
    .map((result) => Date.parse(result.nextUpdate ?? ''))
    .filter(Number.isFinite);
  return times.length > 0 ? Math.min(...times) : null;
}

function byServerOrder(a: { server: string }, b: { server: string }): number {
  const order = SERVER_NAMES as readonly string[];
  return order.indexOf(a.server) - order.indexOf(b.server);
}

/** 서버 결과 안에서 받지 못한 채널. */
function failedChannelsOf(result: PassServerResult): number[] {
  return result.channels
    .filter((entry) => entry.error !== undefined)
    .map((entry) => entry.channel)
    .sort((a, b) => a - b);
}

export function usePassSearch() {
  const [state, setState] = useState<PassSearchState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  // 화면을 떠나면 받던 것을 멈춘다.
  useEffect(() => () => abortRef.current?.abort(), []);

  const search = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const servers = [...SERVER_NAMES];
    const results: PassServerResult[] = [];
    const failed: FailedChannel[] = [];
    setState({ ...IDLE, status: 'loading', total: servers.length });

    const publish = () => {
      const sorted = [...results].sort(byServerOrder);
      setState((prev) => ({
        ...prev,
        done: results.length + failed.filter((entry) => entry.channels.length === 0).length,
        results: sorted,
        failed: [...failed].sort(byServerOrder),
        nextUpdate: earliestUpdate(sorted),
      }));
    };

    await Promise.all(
      servers.map(async (server) => {
        const remembered = memory.get(server);
        let result: PassServerResult;
        if (remembered && remembered.expiresAt > Date.now()) {
          result = remembered.result;
        } else {
          try {
            result = await fetchPassServer(server, controller.signal);
          } catch {
            if (controller.signal.aborted) return;
            failed.push({ server, channels: [] });
            publish();
            return;
          }
        }
        if (controller.signal.aborted) return;

        results.push(result);
        const missing = failedChannelsOf(result);
        if (missing.length > 0) {
          failed.push({ server, channels: missing });
        } else {
          const expiresAt = earliestUpdate([result]);
          if (expiresAt && expiresAt > Date.now()) memory.set(server, { expiresAt, result });
        }
        publish();
      }),
    );
    if (controller.signal.aborted) return;

    setState((prev) => ({ ...prev, status: results.length === 0 ? 'error' : 'done' }));
  }, []);

  return { state, search };
}
