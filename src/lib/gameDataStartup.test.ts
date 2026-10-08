import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchData: vi.fn(), install: vi.fn() }));
vi.mock('./gameData', () => ({ fetchGameData: mocks.fetchData }));
vi.mock('@/features/equipment/specialUpgrade', () => ({ installSpecialTables: mocks.install }));

beforeEach(() => {
  mocks.fetchData.mockReset();
  mocks.install.mockReset();
  vi.stubEnv('BASE_URL', '/MabiKumaWeb/');
  window.history.replaceState(null, '', '/MabiKumaWeb/auction?q=문어#popular');
});
afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});

it('첫 조회 실패도 오류 화면으로 이동하며 이전 검색 주소를 보관한다', async () => {
  mocks.fetchData.mockRejectedValue(new Error('목록 조회 실패'));
  const app = vi.fn(async () => {});
  const { startGameData } = await import('./gameDataStartup');
  await startGameData(app);
  expect(window.location.pathname).toBe('/MabiKumaWeb/data-error');
  expect(window.history.state.usr.returnTo).toBe('/auction?q=%EB%AC%B8%EC%96%B4#popular');
  expect(mocks.install).not.toHaveBeenCalled();
  expect(app).toHaveBeenCalledOnce();
});

it('오류 화면의 직접 진입은 데이터 조회나 반복 이동 없이 열린다', async () => {
  window.history.replaceState(null, '', '/MabiKumaWeb/data-error');
  const app = vi.fn(async () => {});
  const { startGameData } = await import('./gameDataStartup');
  await startGameData(app);
  expect(mocks.fetchData).not.toHaveBeenCalled();
  expect(app).toHaveBeenCalledOnce();
});

it('초기 표 구조가 잘못됐으면 기본 자료로 시작하지 않는다', async () => {
  mocks.fetchData.mockImplementation(async () => new Response('{}'));
  const { startGameData } = await import('./gameDataStartup');
  await startGameData(async () => {});
  expect(window.location.pathname).toBe('/MabiKumaWeb/data-error');
  expect(mocks.install).not.toHaveBeenCalled();
});

it('초기 표를 모두 준비한 뒤에 앱 모듈을 불러온다', async () => {
  const fixtures: Record<string, unknown> = {
    'echostone.json': { stones: [], abilities: [], boosters: [], gradeCaps: {}, levelWeights: {} },
    'ogham.json': { words: [], options: [], arcanas: [], combinations: [], rerollCosts: [] },
    'game-images.json': { skills: {}, ogham: {} },
    'special-upgrades.json': { tables: {} },
  };
  mocks.fetchData.mockImplementation(
    async (name: string) => new Response(JSON.stringify(fixtures[name])),
  );
  const { startGameData } = await import('./gameDataStartup');
  await startGameData(async () => {
    expect(mocks.install).toHaveBeenCalledWith({ tables: {} });
    expect(window.location.pathname).toBe('/MabiKumaWeb/auction');
  });
});
