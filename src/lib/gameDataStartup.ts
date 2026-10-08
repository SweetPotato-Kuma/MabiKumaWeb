import echo from '@/features/echostone/data.json';
import ogham from '@/features/ogham/data.json';
import images from '@/features/itemcard/generated/gameImages.json';
import { fetchGameData } from './gameData';

/** 시뮬레이터의 모듈 상수를 만들기 전에 같은 공개 판의 자료를 준비한다. */
export async function startGameData(startApp: () => Promise<unknown>) {
  const base = import.meta.env.BASE_URL;
  const errorPath = `${base}data-error`;
  if (window.location.pathname === errorPath) return startApp();
  try {
    const [newEcho, newOgham, newImages, special] = await Promise.all(
      ['echostone.json', 'ogham.json', 'game-images.json', 'special-upgrades.json'].map(
        async (name) => {
          const response = await fetchGameData(name);
          return (await response.json()) as Record<string, unknown>;
        },
      ),
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
    const { installSpecialTables } = await import('@/features/equipment/specialUpgrade');
    installSpecialTables(special);
    Object.assign(echo, newEcho);
    Object.assign(ogham, newOgham);
    Object.assign(images, newImages);
  } catch {
    const { pathname, search, hash } = window.location;
    const returnTo = pathname.slice(base.length - 1) + search + hash;
    // 아직 라우터가 없으므로 주소를 바꾼 뒤 오류 화면으로 앱을 시작한다.
    window.history.replaceState({ usr: { returnTo } }, '', errorPath);
  }
  return startApp();
}
