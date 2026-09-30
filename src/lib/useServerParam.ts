import { useCallback } from 'react';
import { SERVER_NAMES } from '@/features/servers/constants';
import { useQueryParams } from '@/lib/useQueryParams';
import { updateSettings, useUserSettings } from '@/lib/userSettings';

/** "모든 서버". 서버 이름과 겹치지 않는 값이고, 주소에도 이 글자로 실린다. */
export const ALL_SERVERS = 'all';

/**
 * 서버를 고르는 화면의 서버 상태.
 *
 * 주소의 `server` 가 있으면 그것이 우선이다. 링크를 받은 사람도 보낸 사람이 본 서버를 본다. 주소에 없으면
 * 방문자의 기본 서버(설정)로 시작한다. 화면에서 서버를 고르면 주소에 적고, 기본 서버도 그 서버로 바꾼다.
 * 그래서 화면을 옮겨도 서버를 다시 고르지 않는다. "모든 서버" 는 특정 서버가 아니라 기본 서버로 삼지 않는다.
 */
export function useServerParam(options: { allowAll?: boolean } = {}) {
  const { allowAll = false } = options;
  const [params, update] = useQueryParams();
  const [settings] = useUserSettings();

  const value = params.get('server');
  const server: string =
    (allowAll && value === ALL_SERVERS) || SERVER_NAMES.some((name) => name === value)
      ? (value as string)
      : settings.server;

  const setServer = useCallback(
    (next: string) => {
      update({ server: next });
      if (SERVER_NAMES.some((name) => name === next)) updateSettings({ server: next as (typeof SERVER_NAMES)[number] });
    },
    [update],
  );

  return [server, setServer] as const;
}
