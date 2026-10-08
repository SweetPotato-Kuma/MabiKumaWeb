/** 게임 데이터는 한 번 게시한 목록의 내용 해시 주소로 읽는다. 앱을 다시 배포하지 않아도 새로고침 때 갱신된다. */
interface GameDataManifest {
  schema: 1;
  revision: string;
  files: Record<string, { key: string; sha256: string; bytes: number }>;
}

let manifestPromise: Promise<GameDataManifest> | undefined;
export const GAME_DATA_FAILURE_EVENT = 'mabikuma:game-data-failure';

export function resetGameDataManifest() {
  manifestPromise = undefined;
}
const baseUrl = () =>
  String(
    import.meta.env.VITE_GAME_DATA_BASE_URL || import.meta.env.VITE_ICON_BASE_URL || '',
  ).replace(/\/+$/, '');
const localUrl = (name: string) => `${import.meta.env.BASE_URL}data/${name}`;

function parseManifest(value: unknown): GameDataManifest {
  const manifest = value as GameDataManifest;
  if (manifest?.schema !== 1 || !/^[a-f0-9]{64}$/.test(manifest.revision) || !manifest.files)
    throw new Error('게임 데이터 목록 형식이 다릅니다.');
  for (const [name, file] of Object.entries(manifest.files)) {
    if (
      !/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.json$/.test(name) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      file.key !== `game-data/objects/${file.sha256}.js`
    )
      throw new Error('게임 데이터 파일 주소가 잘못되었습니다.');
  }
  return manifest;
}

export function gameDataManifest(): Promise<GameDataManifest | null> {
  // 개발 서버의 /data/는 Git 밖의 .cache/game-data/current만 읽는다.
  if (import.meta.env.DEV) return Promise.resolve(null);
  if (!baseUrl()) return Promise.reject(new Error('게임 데이터 주소가 설정되지 않았습니다.'));
  manifestPromise ??= fetch(`${baseUrl()}/game-data/manifest.json`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`게임 데이터 목록 HTTP ${response.status}`);
      return parseManifest(await response.json());
    })
    .catch((error: unknown) => {
      resetGameDataManifest();
      throw error;
    });
  return manifestPromise;
}

export async function fetchGameData(name: string, options: RequestInit = {}): Promise<Response> {
  try {
    options.signal?.throwIfAborted();
    const manifest = await gameDataManifest();
    options.signal?.throwIfAborted();
    const file = manifest?.files[name];
    if (!import.meta.env.DEV && !file) throw new Error(`게임 데이터 목록에 ${name}이 없습니다.`);
    const timeout = AbortSignal.timeout(15000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const response = await fetch(file ? `${baseUrl()}/${file.key}` : localUrl(name), {
      ...options,
      signal,
    });
    if (!response.ok) throw new Error(`게임 데이터 조회 HTTP ${response.status}`);
    // HTTP 200으로 오류 HTML이나 깨진 JSON이 돌아오는 경우도 조회 실패로 처리한다.
    await response.clone().json();
    options.signal?.throwIfAborted();
    return response;
  } catch (error) {
    // 화면 이동 때문에 취소된 조회는 서비스 장애가 아니다.
    if (!options.signal?.aborted) window.dispatchEvent(new Event(GAME_DATA_FAILURE_EVENT));
    throw error;
  }
}
