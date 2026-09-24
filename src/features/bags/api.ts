import { getProxyUrl } from '@/lib/settings';

/**
 * 튼튼한 주머니 찾기 요청.
 *
 * 브라우저는 "서버, 채널" 로 워커에 한 번만 묻는다. 워커가 그 채널의 NPC 17명을 한꺼번에
 * 불러 튼튼한 주머니 줄만 추려 돌려준다(worker/worker.js 의 findBags). 넥슨 API 를 채널마다
 * 17번씩 직접 부르면 류트 한 서버만 748번, 60MB 가 넘는다.
 */

/** 주머니 한 줄. 워커가 짧은 키로 보낸다. */
export interface BagRow {
  /** 이름 */
  n: string;
  /** 색. 파트 A, B, C 순서의 6자리 16진수 */
  c: string[];
  /** 가격 */
  p: number | null;
  /** 가격 단위 (두카트 등) */
  t: string | null;
}

export interface BagNpc {
  npc: string;
  bags?: BagRow[];
  /** 이 NPC 를 받지 못했으면 넥슨이 돌려준 상태 코드. 연결 자체가 안 됐으면 0. */
  error?: number;
  nextUpdate?: string | null;
}

export interface BagChannelResult {
  server: string;
  channel: number;
  /** 다음 상점 갱신 시각. 이 시각까지 결과가 유효하다. */
  nextUpdate: string | null;
  npcs: BagNpc[];
}

/** 워커 주소가 없으면 찾을 수 없다. 로컬 개발에서 흔한 상태다. */
export function canSearchBags(): boolean {
  return getProxyUrl().length > 0;
}

export async function fetchBagChannel(
  server: string,
  channel: number,
  signal?: AbortSignal,
): Promise<BagChannelResult> {
  const url = `${getProxyUrl()}/npcshop/bags?server=${encodeURIComponent(server)}&channel=${channel}`;
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`${channel}채널을 받지 못했습니다. (HTTP ${response.status})`);
  return (await response.json()) as BagChannelResult;
}
