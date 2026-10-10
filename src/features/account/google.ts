import { accountApi, type Account } from './api';

interface GoogleIdentity {
  initialize(options: {
    client_id: string;
    nonce: string;
    callback: (response: { credential: string }) => void;
    auto_select: boolean;
  }): void;
  renderButton(
    element: HTMLElement,
    options: { type: string; theme: string; size: string; text: string },
  ): void;
  disableAutoSelect(): void;
}
type GoogleWindow = Window & { google?: { accounts: { id: GoogleIdentity } } };
let script: Promise<GoogleIdentity> | undefined;
export function loadGoogle(): Promise<GoogleIdentity> {
  const ready = (window as GoogleWindow).google?.accounts.id;
  if (ready) return Promise.resolve(ready);
  if (!script)
    script = new Promise<GoogleIdentity>((resolve, reject) => {
      const element = document.createElement('script');
      element.src = 'https://accounts.google.com/gsi/client';
      element.async = true;
      const timeout = setTimeout(() => {
        element.remove();
        script = undefined;
        reject(new Error('Google 인증을 불러오지 못했습니다. 다시 시도해 주세요.'));
      }, 15000);
      element.onload = () => {
        clearTimeout(timeout);
        const identity = (window as GoogleWindow).google?.accounts.id;
        if (identity) resolve(identity);
        else {
          script = undefined;
          reject(new Error('Google 인증을 사용할 수 없습니다.'));
        }
      };
      element.onerror = () => {
        clearTimeout(timeout);
        script = undefined;
        element.remove();
        reject(new Error('Google 인증을 불러오지 못했습니다.'));
      };
      document.head.appendChild(element);
    });
  return script;
}
export async function mountGoogleLogin(
  element: HTMLElement,
  onAccount: (account: Account) => Promise<void>,
  onError: (error: Error) => void,
): Promise<void> {
  const config = await accountApi<{ enabled: boolean; clientId: string }>('/config');
  if (!config.enabled)
    throw new Error('계정 저장 기능을 준비 중입니다. 지금은 이 브라우저에 저장됩니다.');
  const google = await loadGoogle();
  const { nonce } = await accountApi<{ nonce: string }>('/challenge', 'POST');
  google.initialize({
    client_id: config.clientId,
    nonce,
    auto_select: false,
    callback: (response) => {
      void accountApi<Account>('/auth/google', 'POST', { credential: response.credential, nonce })
        .then(onAccount)
        .catch((error: unknown) =>
          onError(error instanceof Error ? error : new Error('로그인하지 못했습니다.')),
        );
    },
  });
  element.replaceChildren();
  google.renderButton(element, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
  });
}
export function disableGoogleAutoSelect(): void {
  (window as GoogleWindow).google?.accounts.id.disableAutoSelect();
}
