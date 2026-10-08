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
  it('목록 조회가 실패하면 오류를 알리고 로컬 자료를 요청하지 않는다', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_GAME_DATA_BASE_URL', 'https://icons.example');
    const failure = vi.fn();
    window.addEventListener('mabikuma:game-data-failure', failure);
    const fetcher = vi.fn(
      async (url: string) =>
        new Response('{}', { status: url.endsWith('/manifest.json') ? 404 : 200 }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { fetchGameData } = await import('./gameData');
    await expect(fetchGameData('recipes.json')).rejects.toThrow('HTTP 404');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledTimes(1);
    window.removeEventListener('mabikuma:game-data-failure', failure);
  });
  it('실패한 목록을 고정하지 않아 다시 조회하면 새 목록을 받는다', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_GAME_DATA_BASE_URL', 'https://icons.example');
    const hash = 'a'.repeat(64);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema: 1,
            revision: hash,
            files: {
              'arcana.json': { key: `game-data/objects/${hash}.js`, sha256: hash, bytes: 2 },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const { fetchGameData } = await import('./gameData');
    await expect(fetchGameData('arcana.json')).rejects.toThrow('HTTP 503');
    expect(await (await fetchGameData('arcana.json')).json()).toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('게시 목록에 파일이 없어도 로컬 기본 자료를 요청하지 않는다', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_GAME_DATA_BASE_URL', 'https://icons.example');
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ schema: 1, revision: 'a'.repeat(64), files: {} })),
      );
    vi.stubGlobal('fetch', fetcher);
    const { fetchGameData } = await import('./gameData');
    await expect(fetchGameData('recipes.json')).rejects.toThrow('목록에 recipes.json');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([new Response('{}', { status: 500 }), new Response('<html>오류</html>')])(
    '표의 HTTP 오류와 잘못된 JSON도 실패를 알린다',
    async (response) => {
      vi.stubEnv('DEV', true);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      const failure = vi.fn();
      window.addEventListener('mabikuma:game-data-failure', failure);
      const { fetchGameData } = await import('./gameData');
      await expect(fetchGameData('arcana.json')).rejects.toThrow();
      expect(failure).toHaveBeenCalledOnce();
      window.removeEventListener('mabikuma:game-data-failure', failure);
    },
  );
  it('화면 이동으로 취소한 조회는 오류 화면을 열지 않는다', async () => {
    vi.stubEnv('DEV', true);
    const controller = new AbortController();
    const failure = vi.fn();
    window.addEventListener('mabikuma:game-data-failure', failure);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        controller.abort();
        throw new DOMException('취소', 'AbortError');
      }),
    );
    const { fetchGameData } = await import('./gameData');
    await expect(fetchGameData('recipes.json', { signal: controller.signal })).rejects.toThrow(
      '취소',
    );
    expect(failure).not.toHaveBeenCalled();
    window.removeEventListener('mabikuma:game-data-failure', failure);
  });
});
