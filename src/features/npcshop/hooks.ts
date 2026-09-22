import { useQuery } from '@tanstack/react-query';
import { fetchNpcShop } from './api';
import type { NpcShopQueryInput } from './types';

const TEN_MINUTES = 10 * 60 * 1000;

export function useNpcShopQuery(input: NpcShopQueryInput, enabled: boolean) {
  return useQuery({
    queryKey: ['npcshop', input.npcName, input.serverName, input.channel],
    queryFn: ({ signal }) => fetchNpcShop(input, signal),
    enabled: enabled && Boolean(input.npcName) && Boolean(input.serverName),
    staleTime: TEN_MINUTES,
    retry: false,
  });
}
