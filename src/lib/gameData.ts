/** 게임 데이터는 한 번 게시한 목록의 내용 해시 주소로 읽는다. 앱을 다시 배포하지 않아도 새로고침 때 갱신된다. */
interface GameDataManifest {
  schema: 1;
  revision: string;
  files: Record<string, { key: string; sha256: string; bytes: number }>;
}

let manifestPromise: Promise<GameDataManifest | null> | undefined;
const baseUrl = () =>
  String(
    import.meta.env.VITE_GAME_DATA_BASE_URL ?? import.meta.env.VITE_ICON_BASE_URL ?? '',
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
  if (import.meta.env.DEV || !baseUrl()) return Promise.resolve(null);
  manifestPromise ??= fetch(`${baseUrl()}/game-data/manifest.json`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`게임 데이터 목록 HTTP ${response.status}`);
      return parseManifest(await response.json());
    })
    .catch(() => {
      console.warn('Cloudflare 게임 데이터 목록을 받지 못해 배포 시의 기본 자료를 사용합니다.');
      return null;
    });
  return manifestPromise;
}

export async function fetchGameData(name: string, options: RequestInit = {}): Promise<Response> {
  const manifest = await gameDataManifest();
  const file = manifest?.files[name];
  // 아직 Cloudflare로 옮기지 않은 표도 기존 화면에서 계속 읽힌다.
  return fetch(file ? `${baseUrl()}/${file.key}` : localUrl(name), options);
}
