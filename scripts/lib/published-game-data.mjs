import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const baseUrl = () =>
  (
    process.env.VITE_GAME_DATA_BASE_URL ||
    process.env.VITE_ICON_BASE_URL ||
    'https://icons.spkuma.com'
  ).replace(/\/+$/, '');

/** 빌드 입력은 공개된 한 판으로 고정한다. 통신 실패를 과거 자료로 덮지 않는다. */
export async function publishedGameData(
  fetcher = fetch,
  cacheDir = resolve('.cache/game-data/build'),
) {
  const base = baseUrl();
  const response = await fetcher(`${base}/game-data/manifest.json`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`게임 데이터 목록 HTTP ${response.status}`);
  const manifest = await response.json();
  if (
    manifest?.schema !== 1 ||
    !/^[a-f0-9]{64}$/.test(manifest.revision) ||
    !manifest.files ||
    Array.isArray(manifest.files)
  )
    throw new Error('게임 데이터 목록 형식이 다릅니다.');
  for (const [name, file] of Object.entries(manifest.files)) {
    if (
      !/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.json$/.test(name) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      file.key !== `game-data/objects/${file.sha256}.js` ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0
    )
      throw new Error(`게임 데이터 주소가 잘못되었습니다: ${name}`);
  }
  const read = async (name) => {
    const file = manifest.files[name];
    if (!file) throw new Error(`게시 목록에 ${name}이 없습니다.`);
    const path = resolve(cacheDir, 'objects', `${file.sha256}.json`);
    let bytes = await readFile(path).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!bytes || hash(bytes) !== file.sha256 || bytes.length !== file.bytes) {
      const object = await fetcher(`${base}/${file.key}`, { signal: AbortSignal.timeout(30000) });
      if (!object.ok) throw new Error(`게임 데이터 ${name} HTTP ${object.status}`);
      bytes = Buffer.from(await object.arrayBuffer());
      if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes)
        throw new Error(`게임 데이터 ${name} 해시가 다릅니다.`);
      JSON.parse(bytes.toString('utf8'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    }
    return JSON.parse(bytes.toString('utf8'));
  };
  return { manifest, read };
}
