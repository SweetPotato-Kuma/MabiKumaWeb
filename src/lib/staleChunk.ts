const RELOAD_KEY = 'mabikuma:stale-chunk-reload';
/** 새로고침했는데도 또 실패하면 서버 쪽 문제다. 이 시간 안에 다시 새로고침하지 않는다. */
const RELOAD_GUARD_MS = 30_000;

/**
 * 나눠 받는 화면의 파일을 받지 못한 오류인지. 배포하면 파일 이름의 해시가 바뀌고 옛 파일은 사라진다.
 * 배포 전에 열어 둔 화면이 옛 이름을 요청하면 이 오류가 난다. 브라우저마다 문구가 다르다.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    message,
  );
}

/**
 * 새 버전을 받으려고 한 번 새로고침한다. 방금 이미 했으면 하지 않고 false 를 돌려준다.
 * 저장소를 못 쓰면 무한 새로고침을 막을 방법이 없어 하지 않는다.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY));
    if (last && Date.now() - last < RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
