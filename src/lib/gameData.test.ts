import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('R2 게임 데이터 읽기', () => {
  it('페이지 안의 여러 표가 같은 공개 목록을 사용한다', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_GAME_DATA_BASE_URL', 'https://icons.example');
    const a = 'a'.repeat(64),
      b = 'b'.repeat(64);
    const manifest = {
      schema: 1,
      revision: 'c'.repeat(64),
      files: {
        'recipes.json': { key: `game-data/objects/${a}.js`, sha256: a, bytes: 2 },
        'arcana.json': { key: `game-data/objects/${b}.js`, sha256: b, bytes: 2 },
      },
    };
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(url.endsWith('/manifest.json') ? manifest : {})),
    );
    vi.stubGlobal('fetch', fetcher);
    const { fetchGameData } = await import('./gameData');
    await Promise.all([fetchGameData('recipes.json'), fetchGameData('arcana.json')]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://icons.example/game-data/manifest.json',
      `https://icons.example/game-data/objects/${a}.js`,
      `https://icons.example/game-data/objects/${b}.js`,
    ]);
  });
  it('목록이 없으면 기존 로컬 기본 자료를 사용할 수 있다', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_GAME_DATA_BASE_URL', 'https://icons.example');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn(
      async (url: string) =>
        new Response('{}', { status: url.endsWith('/manifest.json') ? 404 : 200 }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { fetchGameData } = await import('./gameData');
    await fetchGameData('recipes.json');
    expect(fetcher.mock.calls[1][0]).toBe(`${import.meta.env.BASE_URL}data/recipes.json`);
    warning.mockRestore();
  });
});
