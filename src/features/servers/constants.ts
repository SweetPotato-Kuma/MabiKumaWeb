/**
 * 마비노기 서버 이름. 넥슨 API 가 server_name 으로 받는 값이다.
 */
export const SERVER_NAMES = ['류트', '만돌린', '하프', '울프'] as const;

export type ServerName = (typeof SERVER_NAMES)[number];

/**
 * 서버별 채널 수. 류트만 많고 나머지는 적다.
 *
 * 2026-09-23 넥슨 API 로 직접 확인한 값이다. 서버마다 1번부터 끝까지 전부 훑어 빈 번호가
 * 없음을 봤고, 마지막 번호 다음 채널은 400 OPENAPI00009 로 거절된다. 넥슨이 채널을 늘리거나
 * 줄이면 여기만 고치면 된다.
 */
export const CHANNEL_COUNT_BY_SERVER: Readonly<Record<ServerName, number>> = {
  류트: 44,
  만돌린: 16,
  하프: 25,
  울프: 16,
};

/** 그 서버에 실제로 있는 채널 번호. 모르는 서버면 빈 목록이다. */
export function channelsOf(server: string): number[] {
  const count = (SERVER_NAMES as readonly string[]).includes(server)
    ? CHANNEL_COUNT_BY_SERVER[server as ServerName]
    : 0;
  return Array.from({ length: count }, (_, index) => index + 1);
}
