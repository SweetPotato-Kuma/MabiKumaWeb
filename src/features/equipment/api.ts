import { useQuery } from '@tanstack/react-query';
import { getProxyUrl } from '@/lib/settings';
import type { EquipmentLookup } from './types';

/**
 * 장비 정보 조회. 워커가 아이템 하나 몫만 돌려준다(worker/worker.js 의 lookupEquipment).
 *
 * 카드와 같은 KV 에 들어 있고 같은 조회 제한을 받는다. 게임 업데이트 때나 바뀌는 값이라
 * 한 번 받은 것은 이 창이 떠 있는 동안 다시 묻지 않는다.
 */

/**
 * 장비 정보가 있는 카테고리. 사전의 버튼을 이 카테고리에서만 보여 준다.
 *
 * 2026-09 수집 결과에서 장비 데이터가 붙은 카테고리다. "기타" 는 1,500개 남짓 중 두 개뿐이라
 * 뺐다. 거기서 버튼을 띄우면 거의 전부 빈 화면으로 간다.
 */
export const EQUIPMENT_CATEGORIES: ReadonlySet<string> = new Set([
  '검',
  '경갑옷',
  '기타 장비',
  '너클',
  '대형 낫',
  '도끼',
  '둔기',
  '듀얼건',
  '랜스',
  '마도서',
  '모자/가발',
  '방패',
  '생활 도구',
  '석궁',
  '수리검',
  '스태프',
  '신발',
  '실린더',
  '아틀라틀',
  '악기',
  '액세서리',
  '양손 장비',
  '오브',
  '원드',
  '장갑',
  '중갑옷',
  '천옷',
  '체인 블레이드',
  '한손 장비',
  '핸들',
  '활',
  '힐링 원드',
]);

export function isEquipmentCategory(category: string): boolean {
  return EQUIPMENT_CATEGORIES.has(category);
}

/** 시뮬레이터 주소. 사전과 경매장 상세 창이 같은 모양으로 만든다. */
export function equipmentPath(category: string, name: string): string {
  return `/equipment?category=${encodeURIComponent(category)}&name=${encodeURIComponent(name)}`;
}

export function canLookupEquipment(): boolean {
  return getProxyUrl().length > 0;
}

export async function fetchEquipment(
  category: string,
  name: string,
  signal?: AbortSignal,
): Promise<EquipmentLookup> {
  const query = `category=${encodeURIComponent(category)}&name=${encodeURIComponent(name)}`;
  const response = await fetch(`${getProxyUrl()}/item-equip?${query}`, {
    headers: { accept: 'application/json' },
    signal,
  });
  if (response.status === 429)
    throw new Error('조회가 잠시 몰렸습니다. 1분쯤 뒤에 다시 열어 주세요.');
  if (!response.ok) throw new Error(`장비 정보를 받지 못했습니다. (HTTP ${response.status})`);
  return (await response.json()) as EquipmentLookup;
}

export function useEquipmentQuery(category: string, name: string) {
  return useQuery({
    queryKey: ['equipment', category, name],
    queryFn: ({ signal }) => fetchEquipment(category, name, signal),
    enabled: canLookupEquipment() && category !== '' && name !== '',
    staleTime: Infinity,
  });
}
