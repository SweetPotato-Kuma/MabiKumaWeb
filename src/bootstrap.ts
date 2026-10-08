import echo from './features/echostone/data.json';
import ogham from './features/ogham/data.json';
import images from './features/itemcard/generated/gameImages.json';
import { fetchGameData, gameDataManifest } from './lib/gameData';

async function start() {
  const manifest = await gameDataManifest();
  // 시뮬레이터가 모듈 상수를 만들기 전에 같은 공개 판의 자료를 모두 준비한다.
  if (manifest || import.meta.env.DEV) {
    const names = ['echostone.json', 'ogham.json', 'game-images.json', 'special-upgrades.json'];
    try {
      const [newEcho, newOgham, newImages, special] = await Promise.all(
        names.map(async (name) => {
          if (manifest && !manifest.files[name])
            throw new Error(`게임 데이터에 ${name}이 없습니다.`);
          const response = await fetchGameData(name, { signal: AbortSignal.timeout(8000) });
          if (!response.ok) throw new Error(`게임 데이터 ${name}: HTTP ${response.status}`);
          return (await response.json()) as Record<string, unknown>;
        }),
      );
      if (
        !Array.isArray(newEcho.stones) ||
        !Array.isArray(newEcho.abilities) ||
        !Array.isArray(newEcho.boosters) ||
        !newEcho.gradeCaps ||
        !newEcho.levelWeights ||
        !Array.isArray(newOgham.words) ||
        !Array.isArray(newOgham.options) ||
        !Array.isArray(newOgham.arcanas) ||
        !Array.isArray(newOgham.combinations) ||
        !Array.isArray(newOgham.rerollCosts) ||
        !newImages.skills ||
        !newImages.ogham
      )
        throw new Error('게임 데이터 표 구조가 다릅니다.');
      const { installSpecialTables } = await import('./features/equipment/specialUpgrade');
      installSpecialTables(special);
      Object.assign(echo, newEcho);
      Object.assign(ogham, newOgham);
      Object.assign(images, newImages);
    } catch {
      console.warn('게임 데이터 초기화에 실패해 시뮬레이터의 기본 자료를 사용합니다.');
    }
  }
  await import('./main');
}

void start();
