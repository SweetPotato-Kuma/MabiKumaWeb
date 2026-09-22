/**
 * NPC 상점 조회 API 의 허용값.
 * 출처: 마비노기 오픈 API 스펙 (openapi.nexon.com)
 */
export const NPC_NAMES = [
  '델',
  '델렌',
  '상인 라누',
  '상인 피루',
  '모락',
  '상인 아루',
  '리나',
  '상인 누누',
  '상인 메루',
  '켄',
  '귀넥',
  '얼리',
  '데위',
  '테일로',
  '상인 세누',
  '상인 베루',
  '상인 에루',
  '상인 네루',
  '카디',
  '인장 상인',
  '피오나트',
] as const;

export const SERVER_NAMES = ['류트', '만돌린', '하프', '울프'] as const;

/** 채널 목록. 서버 상황에 따라 없는 채널은 API 가 오류를 돌려준다. */
export const CHANNELS = Array.from({ length: 12 }, (_, index) => index + 1);

export type NpcName = (typeof NPC_NAMES)[number];
export type ServerName = (typeof SERVER_NAMES)[number];
