import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/settings', () => ({ getProxyUrl: () => 'https://proxy.example/' }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(['', '  '])('빈 계정 API 설정 %j은 기존 프록시 주소를 사용한다', async (value) => {
  vi.stubEnv('VITE_ACCOUNT_API_URL', value);
  vi.resetModules();
  const fetch = vi.fn(async () => new Response(JSON.stringify({ enabled: false })));
  vi.stubGlobal('fetch', fetch);
  const { accountApi, hasAccountEndpoint } = await import('./api');
  expect(hasAccountEndpoint()).toBe(true);
  await accountApi('/config');
  expect(fetch).toHaveBeenCalledWith(
    'https://proxy.example/account/config',
    expect.objectContaining({ credentials: 'include' }),
  );
});

it('계정 전용 주소가 있으면 우선 사용하며 공백과 끝 슬래시를 제거한다', async () => {
  vi.stubEnv('VITE_ACCOUNT_API_URL', ' https://accounts.example/// ');
  vi.resetModules();
  const fetch = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  const { accountApi, expectAccount } = await import('./api');
  expectAccount('my-account');
  await accountApi('/data');
  expect(fetch).toHaveBeenCalledWith(
    'https://accounts.example/account/data',
    expect.objectContaining({
      credentials: 'include',
      headers: { 'x-mabikuma-account': 'my-account' },
    }),
  );
});

it('세션 복원은 쿠키로 확인하고 이전 계정 헤더나 프리플라이트를 추가하지 않는다', async () => {
  const fetch = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  const { accountApi, expectAccount } = await import('./api');
  expectAccount('previous-account');
  await accountApi('/session');
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/account/session'),
    expect.objectContaining({ credentials: 'include', headers: {}, cache: 'no-store' }),
  );
});
