import { nexonFetch } from '@/lib/nexonClient';
import type { NpcShopQueryInput, NpcShopResponse } from './types';

/** NPC 상점 카탈로그 조회 */
export function fetchNpcShop(
  input: NpcShopQueryInput,
  signal?: AbortSignal,
): Promise<NpcShopResponse> {
  return nexonFetch<NpcShopResponse>(
    '/mabinogi/v1/npcshop/list',
    {
      npc_name: input.npcName,
      server_name: input.serverName,
      channel: input.channel,
    },
    signal,
  );
}
