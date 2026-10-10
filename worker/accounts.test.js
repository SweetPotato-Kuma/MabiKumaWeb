// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { accountRequest, cleanupAccounts, verifyGoogleToken } from './accounts.js';
import worker from './worker.js';

let sql;
let env;
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const origin = 'https://mabi.spkuma.com';
const token = 'a'.repeat(72);
function fakeD1() {
  return {
    prepare(query) {
      let args = [];
      const prepared = {
        bind(...values) {
          args = values;
          return prepared;
        },
        async first() {
          return sql.prepare(query).get(...args) || null;
        },
        async run() {
          return sql.prepare(query).run(...args);
        },
        async all() {
          return { results: sql.prepare(query).all(...args) };
        },
      };
      return prepared;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const values = [];
        for (const statement of statements) values.push(await statement.run());
        sql.exec('COMMIT');
        return values;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
beforeEach(async () => {
  sql = new DatabaseSync(':memory:');
  sql.exec(
    readFileSync(new URL('./migrations-accounts/0001_accounts.sql', import.meta.url), 'utf8'),
  );
  env = { ACCOUNTS: fakeD1(), GOOGLE_CLIENT_ID: 'client-id', ALLOWED_ORIGINS: origin };
  sql
    .prepare("INSERT INTO accounts VALUES (?, 'google', 'subject-A', '쿠마', '2026-10-10', ?, ?)")
    .run(A, Date.now(), Date.now());
  sql
    .prepare("INSERT INTO accounts VALUES (?, 'google', 'subject-B', '쿠마B', '2026-10-10', ?, ?)")
    .run(B, Date.now(), Date.now());
  const digest = Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
  ).toString('hex');
  sql.prepare('INSERT INTO account_sessions VALUES (?, ?, ?)').run(digest, A, Date.now() + 60000);
});
afterEach(() => {
  sql.close();
  vi.restoreAllMocks();
});
function call(path, method = 'GET', payload, options = {}) {
  return accountRequest(
    new Request(`https://mabi-api.spkuma.com/account${path}`, {
      method,
      headers: {
        origin,
        'content-type': 'application/json',
        cookie: `__Host-mabikuma_session=${token}`,
        'x-mabikuma-account': A,
        ...options.headers,
      },
      body: payload ? JSON.stringify(payload) : undefined,
    }),
    env,
    {},
  );
}
const save = (revision, entries = { 'mabikuma:userSettings': '{"server":"류트"}' }) =>
  call('/data', 'PUT', { version: 1, revision, entries });
describe('계정 저장 API와 실제 SQLite 스키마', () => {
  it('본인 닉네임만 수정하고 저장 내용·동의·다른 계정은 유지한다', async () => {
    await save(0);
    const before = sql
      .prepare('SELECT consent_version, registered_at FROM accounts WHERE id = ?')
      .get(A);
    expect((await call('/profile', 'PATCH', { nickname: ' 새쿠마 ' })).status).toBe(200);
    expect((await (await call('/me')).json()).profile.nickname).toBe('새쿠마');
    expect(
      sql.prepare('SELECT consent_version, registered_at FROM accounts WHERE id = ?').get(A),
    ).toEqual(before);
    expect((await (await call('/data')).json()).revision).toBe(1);
    expect(sql.prepare('SELECT nickname FROM accounts WHERE id = ?').get(B).nickname).toBe('쿠마B');
    expect((await call('/profile', 'PATCH', { nickname: '<invalid>' })).status).toBe(400);
    expect(
      (
        await call(
          '/profile',
          'PATCH',
          { nickname: '침범' },
          { headers: { 'x-mabikuma-account': B } },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          '/profile',
          'PATCH',
          { nickname: '누락' },
          { headers: { 'x-mabikuma-account': '' } },
        )
      ).status,
    ).toBe(400);
    sql.prepare('UPDATE accounts SET nickname = NULL, registered_at = NULL WHERE id = ?').run(A);
    expect((await call('/profile', 'PATCH', { nickname: '등록우회' })).status).toBe(403);
  });
  it('허용 Origin과 세션, 요청 계정을 모두 확인한다', async () => {
    expect(
      (await call('/data', 'GET', undefined, { headers: { origin: 'https://evil.example' } }))
        .status,
    ).toBe(403);
    expect((await call('/data', 'GET', undefined, { headers: { cookie: '' } })).status).toBe(401);
    expect(
      (
        await call(
          '/data',
          'PUT',
          { version: 1, revision: 0, entries: {} },
          { headers: { 'x-mabikuma-account': B } },
        )
      ).status,
    ).toBe(401);
    expect(
      (await call('/data', 'GET', undefined, { headers: { 'x-mabikuma-account': '' } })).status,
    ).toBe(400);
  });
  it('처음 조회는 빈 데이터이고, 저장 확인 후 버전이 증가한다', async () => {
    expect((await (await call('/data')).json()).revision).toBe(0);
    expect((await (await save(0)).json()).revision).toBe(1);
    expect((await (await save(1)).json()).revision).toBe(2);
    expect(
      (
        await (
          await call('/data', 'GET', undefined, { headers: { 'x-mabikuma-account': A } })
        ).json()
      ).entries,
    ).toHaveProperty('mabikuma:userSettings');
  });
  it('오래된 버전의 저장은 현재 내용과 이력을 바꾸지 않는다', async () => {
    expect((await save(0)).status).toBe(200);
    expect((await save(0, {})).status).toBe(409);
    expect(sql.prepare('SELECT COUNT(*) n FROM account_data_history').get().n).toBe(1);
    expect((await save(99)).status).toBe(409);
  });
  it('없는 데이터에 0 이외의 버전으로 저장할 수 없다', async () => {
    expect((await save(1)).status).toBe(409);
    expect(sql.prepare('SELECT COUNT(*) n FROM account_data').get().n).toBe(0);
  });
  it('임의 키·인증 키·대용량 데이터를 거부하고 최근 5개 복구본을 보관한다', async () => {
    expect((await save(0, { 'mabikuma:adminKey': 'secret' })).status).toBe(400);
    expect((await save(0, { 'mabikuma:userSettings': 'x'.repeat(100001) })).status).toBe(400);
    for (let revision = 0; revision < 8; revision++)
      expect((await save(revision)).status).toBe(200);
    const history = await (await call('/history')).json();
    expect(history.snapshots.map((v) => v.revision)).toEqual([8, 7, 6, 5, 4]);
  });
  it('계정 삭제 시 세션과 저장 내용·복구본도 삭제하고 다른 계정은 남긴다', async () => {
    await save(0);
    expect((await call('', 'DELETE')).status).toBe(200);
    for (const table of ['account_sessions', 'account_data', 'account_data_history'])
      expect(sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n).toBe(0);
    expect(sql.prepare('SELECT id FROM accounts').get().id).toBe(B);
  });
  it('등록 전에는 데이터 API를 차단하고 명시적 동의 후 등록한다', async () => {
    sql.prepare('UPDATE accounts SET nickname = NULL, registered_at = NULL WHERE id = ?').run(A);
    expect((await save(0)).status).toBe(403);
    expect((await call('/profile', 'POST', { nickname: '닉네임' })).status).toBe(400);
    expect(
      (await call('/profile', 'POST', { nickname: '닉네임', consentVersion: '2026-10-10' })).status,
    ).toBe(200);
    expect(
      (await call('/profile', 'POST', { nickname: '덮어쓰기', consentVersion: '2026-10-10' }))
        .status,
    ).toBe(409);
    expect((await save(0)).status).toBe(200);
  });
  it('만료된 인증만 정리하며 등록 계정과 백업을 미접속으로 지우지 않는다', async () => {
    await save(0);
    sql.prepare('INSERT INTO account_challenges VALUES (?, ?)').run('expired', 0);
    sql
      .prepare("INSERT INTO accounts VALUES ('temporary', 'google', 'temp', NULL, NULL, 0, NULL)")
      .run();
    await cleanupAccounts(env);
    expect(sql.prepare('SELECT COUNT(*) n FROM account_challenges').get().n).toBe(0);
    expect(sql.prepare("SELECT id FROM accounts WHERE id = 'temporary'").get()).toBeUndefined();
    expect(sql.prepare('SELECT COUNT(*) n FROM account_data').get().n).toBe(1);
  });
  it('계정 CORS는 출처를 명시하고 자격 증명을 허용한다', async () => {
    const response = await worker.fetch(
      new Request('https://api.example/account/data', { method: 'OPTIONS', headers: { origin } }),
      env,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
  });
});
describe('외부 인증 검증', () => {
  it('인증 nonce를 브라우저에 묶고 일회 사용하며 재로그인에도 기존 계정을 연결한다', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const key = { ...(await exportJWK(publicKey)), kid: 'google-test', alg: 'RS256', use: 'sig' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ keys: [key] }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    async function googleLogin() {
      const challenge = await call('/challenge', 'POST');
      const { nonce } = await challenge.json();
      const credential = await new SignJWT({ nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'google-test' })
        .setSubject('new-google-user')
        .setAudience('client-id')
        .setIssuer('https://accounts.google.com')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      const options = { headers: { cookie: `__Host-mabikuma_login=${nonce}` } };
      expect((await call('/auth/google', 'POST', { nonce, credential })).status).toBe(401);
      const response = await call('/auth/google', 'POST', { nonce, credential }, options);
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toContain('HttpOnly');
      expect(response.headers.get('set-cookie')).toContain('Secure');
      const account = await response.json();
      expect(account.profile).toBeNull();
      expect((await call('/auth/google', 'POST', { nonce, credential }, options)).status).toBe(401);
      return account;
    }
    expect((await googleLogin()).id).toBe((await googleLogin()).id);
    expect(
      sql.prepare("SELECT COUNT(*) n FROM accounts WHERE subject = 'new-google-user'").get().n,
    ).toBe(1);
  });
  it('서명된 Google 토큰이라도 다른 대상·nonce·만료·누락된 만료를 거부한다', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwt = (overrides = {}) =>
      new SignJWT({ nonce: 'nonce', sub: 'google-user', ...overrides })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer('https://accounts.google.com')
        .setAudience('client-id')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    expect(await verifyGoogleToken(await jwt(), 'client-id', 'nonce', publicKey)).toBe(
      'google-user',
    );
    await expect(
      verifyGoogleToken(await jwt(), 'other-client', 'nonce', publicKey),
    ).rejects.toThrow();
    await expect(
      verifyGoogleToken(await jwt(), 'client-id', 'other-nonce', publicKey),
    ).rejects.toThrow();
    const expired = await new SignJWT({ nonce: 'nonce' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('user')
      .setIssuer('https://accounts.google.com')
      .setAudience('client-id')
      .setIssuedAt()
      .setExpirationTime(1)
      .sign(privateKey);
    await expect(verifyGoogleToken(expired, 'client-id', 'nonce', publicKey)).rejects.toThrow();
    const missing = await new SignJWT({ nonce: 'nonce' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('user')
      .setIssuer('https://accounts.google.com')
      .setAudience('client-id')
      .setIssuedAt()
      .sign(privateKey);
    await expect(verifyGoogleToken(missing, 'client-id', 'nonce', publicKey)).rejects.toThrow();
  });
});
