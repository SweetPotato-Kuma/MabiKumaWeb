import { getProxyUrl } from '@/lib/settings';

/**
 * 마그 멜 미션 통행증 찾기 요청.
 *
 * 통행증은 피오나트만 팔고 가격이 채널마다 다르다. 브라우저는 서버마다 워커에 한 번만 묻고,
 * 워커가 그 서버의 모든 채널에서 피오나트를 불러 통행증 줄만 돌려준다(worker/worker.js 의
 * findPasses). 네 서버를 다 봐도 워커 요청은 네 번이다.
 */

/** 통행증 한 줄. 워커가 짧은 키로 보낸다. */
export interface PassRow {
  /** 이름. "마그 멜 미션 통행증 - 사계의 숲(어려움)" */
  n: string;
  /** 가격 */
  p: number | null;
  /** 가격 단위 (골드 등) */
  t: string | null;
}

export interface PassChannel {
  channel: number;
  passes?: PassRow[];
  /** 이 채널을 받지 못했으면 넥슨이 돌려준 상태 코드. 연결 자체가 안 됐으면 0. */
  error?: number;
  nextUpdate?: string | null;
}

export interface PassServerResult {
  server: string;
  /** 다음 상점 갱신 시각. 이 시각까지 결과가 유효하다. */
  nextUpdate: string | null;
  channels: PassChannel[];
}

/** 워커 주소가 없으면 찾을 수 없다. 로컬 개발에서 흔한 상태다. */
export function canSearchPasses(): boolean {
  return getProxyUrl().length > 0;
}

export async function fetchPassServer(
  server: string,
  signal?: AbortSignal,
): Promise<PassServerResult> {
  const url = `${getProxyUrl()}/npcshop/magmell-pass?server=${encodeURIComponent(server)}`;
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`${server} 서버를 받지 못했습니다. (HTTP ${response.status})`);
  return (await response.json()) as PassServerResult;
}
