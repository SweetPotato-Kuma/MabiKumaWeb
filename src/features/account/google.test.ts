import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { accountApi } from './api';
import { mountGoogleLogin } from './google';

vi.mock('./api', () => ({ accountApi: vi.fn() }));
const initialize = vi.fn();
const renderButton = vi.fn();
const onAccount = vi.fn(async () => {});
const onError = vi.fn();
let element: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  element = document.createElement('div');
  document.body.appendChild(element);
  Object.assign(window, {
    google: { accounts: { id: { initialize, renderButton } } },
  });
  vi.mocked(accountApi).mockImplementation(async (path) => {
    if (path === '/config') return { enabled: true, clientId: 'test-client' };
    if (path === '/challenge') return { nonce: 'test-nonce' };
    if (path === '/auth/google') return { id: 'test-account', profile: null };
    throw new Error('Unexpected request');
  });
});
afterEach(() => {
  element.remove();
  Reflect.deleteProperty(window, 'google');
});

it('열린 로그인 화면에 공식 버튼을 바로 렌더링하고 인증 결과를 계정에 연결한다', async () => {
  await mountGoogleLogin(element, onAccount, onError);
  expect(renderButton).toHaveBeenCalledTimes(1);
  expect(renderButton.mock.calls[0][0]).toBe(element);
  initialize.mock.calls[0][0].callback({ credential: 'test-credential' });
  await vi.waitFor(() => expect(onAccount).toHaveBeenCalledTimes(1));
  expect(accountApi).toHaveBeenCalledWith('/auth/google', 'POST', {
    credential: 'test-credential',
    nonce: 'test-nonce',
  });
});

it('로그인 창을 닫으면 늦게 도착한 설정으로 버튼이나 인증 요청을 만들지 않는다', async () => {
  let resolveConfig!: (config: { enabled: boolean; clientId: string }) => void;
  vi.mocked(accountApi).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
  );
  const controller = new AbortController();
  const mounting = mountGoogleLogin(element, onAccount, onError, controller.signal);
  controller.abort();
  resolveConfig({ enabled: true, clientId: 'test-client' });
  await mounting;
  expect(renderButton).not.toHaveBeenCalled();
  expect(accountApi).toHaveBeenCalledTimes(1);
});

it('닫힌 창의 오래된 Google 응답으로 로그인하지 않는다', async () => {
  const controller = new AbortController();
  await mountGoogleLogin(element, onAccount, onError, controller.signal);
  controller.abort();
  initialize.mock.calls[0][0].callback({ credential: 'test-credential' });
  await Promise.resolve();
  expect(onAccount).not.toHaveBeenCalled();
  expect(accountApi).not.toHaveBeenCalledWith('/auth/google', expect.anything(), expect.anything());
});

it('인증 실패를 표시하고 계정 전환을 진행하지 않는다', async () => {
  await mountGoogleLogin(element, onAccount, onError);
  vi.mocked(accountApi).mockRejectedValueOnce(new Error('인증 실패'));
  initialize.mock.calls[0][0].callback({ credential: 'test-credential' });
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
  expect(onAccount).not.toHaveBeenCalled();
});
