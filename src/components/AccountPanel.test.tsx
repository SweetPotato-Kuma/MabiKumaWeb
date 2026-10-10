import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountPanel } from './AccountPanel';
import { getPersonalAccount, readPersonal, switchPersonalAccount } from '@/lib/personalStorage';

const ID = '33333333-3333-3333-3333-333333333333';
vi.mock('@/features/account/api', () => ({
  ACCOUNT_CONSENT_VERSION: '2026-10-10',
  expectAccount: vi.fn(),
  hasAccountEndpoint: () => false,
  AccountError: class extends Error {
    status = 401;
  },
  accountApi: vi.fn(
    async (
      path: string,
      _method?: string,
      body?: { nickname?: string; consentVersion?: string },
    ) => {
      if (path === '/profile') {
        if (!body?.consentVersion) throw new Error('동의 필요');
        return { id: ID, profile: { nickname: body.nickname } };
      }
      if (path === '/data') return { version: 1, revision: 0, entries: {}, updatedAt: null };
      if (path === '/logout') return { ok: true };
      throw new Error('Unexpected request');
    },
  ),
}));
vi.mock('@/features/account/google', () => ({
  disableGoogleAutoSelect: vi.fn(),
  mountGoogleLogin: vi.fn(async (_element, onAccount) => {
    await onAccount({ id: ID, profile: null });
  }),
}));
beforeEach(() => {
  localStorage.clear();
  switchPersonalAccount(null);
});
afterEach(() => {
  switchPersonalAccount(null);
});
it('비로그인 손실 안내를 제공하고 외부 인증 후 동의·프로필 등록을 거쳐 기존 저장 내용을 가져온다', async () => {
  localStorage.setItem('mabikuma:userSettings', JSON.stringify({ server: '류트' }));
  render(<AccountPanel />);
  const login = screen.getByRole('button', { name: '로그인' });
  expect(login).toHaveTextContent('로그인');
  fireEvent.click(login);
  expect(
    await screen.findByText(/사이트 데이터를 지우거나 기기를 바꾸면 복구할 수 없습니다/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Google로 로그인' }));
  const nickname = await screen.findByRole('textbox', { name: '닉네임' });
  fireEvent.change(nickname, { target: { value: '쿠마' } });
  const register = screen.getByRole('button', { name: '프로필 등록하고 시작' });
  expect(register).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /닉네임과 도구 입력값/ }));
  expect(register).toBeEnabled();
  fireEvent.click(register);
  await waitFor(() => expect(getPersonalAccount()).toBe(ID));
  await waitFor(() => expect(readPersonal('mabikuma:userSettings')).toContain('류트'));
  expect(localStorage.getItem('mabikuma:userSettings')).toContain('류트');
  const profile = screen.getByRole('button', { name: '사용자 프로필' });
  expect(profile).toHaveTextContent('쿠마');
  expect(screen.getByText('연결된 로그인')).toBeInTheDocument();
  expect(screen.getByText('Google', { exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(profile);
  expect(await screen.findByRole('dialog', { name: '사용자 프로필' })).toBeInTheDocument();
});
