import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PERSONAL_DATA_MAX_BYTES, validateEntries } from '../shared/personal-data.js';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const ACCOUNT_CONSENT_VERSION = '2026-10-10';
const SESSION_COOKIE = '__Host-mabikuma_session';
const CHALLENGE_COOKIE = '__Host-mabikuma_login';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const configured = (env) => Boolean(env.ACCOUNTS && env.GOOGLE_CLIENT_ID);
const randomToken = () => crypto.randomUUID() + crypto.randomUUID();
const cookie = (name, value, seconds) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
function readCookie(request, name) {
  return (
    (request.headers.get('cookie') || '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ''
  );
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
}
function reply(value, status, cors, cookies = []) {
  const headers = new Headers({
    ...cors,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'Access-Control-Allow-Credentials': 'true',
  });
  for (const value of cookies) headers.append('set-cookie', value);
  return new Response(JSON.stringify(value), { status, headers });
}
const problem = (code, message, status, cors) => reply({ error: { code, message } }, status, cors);
const profile = (row) => (row.nickname === null ? null : { nickname: row.nickname });

/** 본인 확인은 ID 토큰의 서명, 대상, 발급자, 만료와 일회용 nonce까지 검증한다. */
export async function verifyGoogleToken(token, clientId, nonce, keys = googleKeys) {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
  });
  if (
    payload.nonce !== nonce ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 255
  )
    throw new Error('Invalid identity');
  return payload.sub;
}

async function sessionAccount(request, env, includeData = false) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!/^[a-f0-9-]{72}$/.test(token)) return null;
  return env.ACCOUNTS.prepare(
    includeData
      ? `SELECT a.*, d.revision AS data_revision, d.entries AS data_entries, d.updated_at AS data_updated_at
         FROM accounts a JOIN account_sessions s ON s.account_id = a.id
         LEFT JOIN account_data d ON d.account_id = a.id AND a.registered_at IS NOT NULL
         WHERE s.token_hash = ? AND s.expires_at > ?`
      : `SELECT a.* FROM accounts a JOIN account_sessions s
         ON s.account_id = a.id WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await hash(token), Date.now())
    .first();
}
async function body(request, max = PERSONAL_DATA_MAX_BYTES + 4096) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json'))
    throw new Error('JSON required');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Body required');
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error('Too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function cleanupAccounts(env) {
  if (!env.ACCOUNTS) return;
  const now = Date.now();
  await env.ACCOUNTS.batch([
    env.ACCOUNTS.prepare('DELETE FROM account_challenges WHERE expires_at <= ?').bind(now),
    env.ACCOUNTS.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').bind(now),
    // 프로필 등록을 완료하지 않은 임시 계정만 정리한다. 정상 백업은 미접속으로 지우지 않는다.
    env.ACCOUNTS.prepare(
      'DELETE FROM accounts WHERE registered_at IS NULL AND created_at < ?',
    ).bind(now - 7 * 86400000),
  ]);
}

export async function accountRequest(request, env, cors) {
  const path = new URL(request.url).pathname;
  // 계정 API는 허용된 Origin을 반드시 요구한다. 전체 공개 프록시 설정을 상속하지 않는다.
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin))
    return problem('ORIGIN_DENIED', '허용되지 않은 출처입니다.', 403, {});
  if (path === '/account/config' && request.method === 'GET')
    return reply(
      { enabled: configured(env), clientId: configured(env) ? env.GOOGLE_CLIENT_ID : null },
      200,
      cors,
    );
  if (!configured(env))
    return problem('NOT_CONFIGURED', '계정 저장 기능을 준비 중입니다.', 503, cors);
  if (env.ACCOUNT_RATE_LIMIT) {
    const { success } = await env.ACCOUNT_RATE_LIMIT.limit({
      key: request.headers.get('cf-connecting-ip') || 'unknown',
    });
    if (!success) return problem('RATE_LIMIT', '잠시 후 다시 시도해 주세요.', 429, cors);
  }
  try {
    if (path === '/account/challenge' && request.method === 'POST') {
      const nonce = randomToken();
      await env.ACCOUNTS.prepare('INSERT INTO account_challenges VALUES (?, ?)')
        .bind(await hash(nonce), Date.now() + 300000)
        .run();
      return reply({ nonce }, 200, cors, [cookie(CHALLENGE_COOKIE, nonce, 300)]);
    }
    if (path === '/account/auth/google' && request.method === 'POST') {
      const payload = await body(request, 16384);
      const nonce = readCookie(request, CHALLENGE_COOKIE);
      if (!nonce || nonce !== payload.nonce || typeof payload.credential !== 'string')
        return problem('AUTH_FAILED', '인증을 다시 시작해 주세요.', 401, cors);
      let subject;
      try {
        subject = await verifyGoogleToken(payload.credential, env.GOOGLE_CLIENT_ID, nonce);
      } catch {
        return problem('AUTH_FAILED', '외부 인증을 확인하지 못했습니다.', 401, cors);
      }
      const used = await env.ACCOUNTS.prepare(
        'DELETE FROM account_challenges WHERE nonce_hash = ? AND expires_at > ? RETURNING nonce_hash',
      )
        .bind(await hash(nonce), Date.now())
        .first();
      if (!used)
        return problem('AUTH_FAILED', '인증이 만료되었습니다. 다시 시작해 주세요.', 401, cors);
      await env.ACCOUNTS.prepare(
        "INSERT INTO accounts (id, provider, subject, created_at) VALUES (?, 'google', ?, ?) ON CONFLICT(provider, subject) DO NOTHING",
      )
        .bind(crypto.randomUUID(), subject, Date.now())
        .run();
      const account = await env.ACCOUNTS.prepare(
        "SELECT * FROM accounts WHERE provider = 'google' AND subject = ?",
      )
        .bind(subject)
        .first();
      const token = randomToken();
      const previous = readCookie(request, SESSION_COOKIE);
      await env.ACCOUNTS.batch([
        env.ACCOUNTS.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(
          await hash(previous),
        ),
        env.ACCOUNTS.prepare('INSERT INTO account_sessions VALUES (?, ?, ?)').bind(
          await hash(token),
          account.id,
          Date.now() + SESSION_SECONDS * 1000,
        ),
        // 무한 재로그인으로 세션이 늘어나지 않도록 최근 10개만 보관한다.
        env.ACCOUNTS.prepare(
          'DELETE FROM account_sessions WHERE account_id = ? AND token_hash NOT IN (SELECT token_hash FROM account_sessions WHERE account_id = ? ORDER BY expires_at DESC LIMIT 10)',
        ).bind(account.id, account.id),
      ]);
      return reply({ id: account.id, profile: profile(account) }, 200, cors, [
        cookie(SESSION_COOKIE, token, SESSION_SECONDS),
        cookie(CHALLENGE_COOKIE, '', 0),
      ]);
    }
    const account = await sessionAccount(
      request,
      env,
      path === '/account/session' && request.method === 'GET',
    );
    if (!account) return problem('UNAUTHENTICATED', '로그인이 필요합니다.', 401, cors);
    const expected = request.headers.get('x-mabikuma-account');
    if (expected && expected !== account.id)
      return problem(
        'ACCOUNT_CHANGED',
        '다른 탭에서 계정이 바뀌었습니다. 다시 로그인해 주세요.',
        401,
        cors,
      );
    if ((path === '/account/data' || path === '/account/history') && !expected)
      return problem('ACCOUNT_REQUIRED', '계정 연결을 다시 확인해 주세요.', 400, cors);
    if (path === '/account/session' && request.method === 'GET') {
      // 인증된 세션의 계정과 데이터만 한 응답으로 반환한다. 클라이언트 지정 ID는 쓰지 않는다.
      return reply(
        {
          account: { id: account.id, profile: profile(account) },
          data: account.registered_at
            ? {
                version: 1,
                revision: account.data_revision || 0,
                entries: account.data_entries ? JSON.parse(account.data_entries) : {},
                updatedAt: account.data_updated_at || null,
              }
            : null,
        },
        200,
        cors,
      );
    }
    if (path === '/account/me' && request.method === 'GET')
      return reply({ id: account.id, profile: profile(account) }, 200, cors);
    if (path === '/account/logout' && request.method === 'POST') {
      await env.ACCOUNTS.prepare('DELETE FROM account_sessions WHERE token_hash = ?')
        .bind(await hash(readCookie(request, SESSION_COOKIE)))
        .run();
      return reply({ ok: true }, 200, cors, [cookie(SESSION_COOKIE, '', 0)]);
    }
    if (path === '/account/profile' && request.method === 'POST') {
      const payload = await body(request, 4096);
      const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : '';
      if (
        !/^[\p{L}\p{N} _-]{2,20}$/u.test(nickname) ||
        payload.consentVersion !== ACCOUNT_CONSENT_VERSION
      )
        return problem(
          'INVALID_PROFILE',
          '닉네임은 문자·숫자·공백·밑줄·하이픈으로 2~20자 입력하고 저장 안내에 동의해 주세요.',
          400,
          cors,
        );
      const registered = await env.ACCOUNTS.prepare(
        'UPDATE accounts SET nickname = ?, consent_version = ?, registered_at = ? WHERE id = ? AND registered_at IS NULL RETURNING id',
      )
        .bind(nickname, ACCOUNT_CONSENT_VERSION, Date.now(), account.id)
        .first();
      if (!registered)
        return problem(
          'PROFILE_EXISTS',
          '이미 프로필이 등록되었습니다. 다시 로그인해 기존 계정 데이터를 확인해 주세요.',
          409,
          cors,
        );
      return reply({ id: account.id, profile: { nickname } }, 200, cors);
    }
    if (!account.registered_at)
      return problem('PROFILE_REQUIRED', '먼저 프로필을 등록해 주세요.', 403, cors);
    if (path === '/account/profile' && request.method === 'PATCH') {
      if (!expected)
        return problem('ACCOUNT_REQUIRED', '계정 연결을 다시 확인해 주세요.', 400, cors);
      const payload = await body(request, 4096);
      const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : '';
      if (!/^[\p{L}\p{N} _-]{2,20}$/u.test(nickname))
        return problem(
          'INVALID_PROFILE',
          '닉네임은 문자·숫자·공백·밑줄·하이픈으로 2~20자 입력해 주세요.',
          400,
          cors,
        );
      await env.ACCOUNTS.prepare('UPDATE accounts SET nickname = ? WHERE id = ?')
        .bind(nickname, account.id)
        .run();
      return reply({ id: account.id, profile: { nickname } }, 200, cors);
    }
    if (path === '/account/data' && request.method === 'GET') {
      const row = await env.ACCOUNTS.prepare(
        'SELECT revision, entries, updated_at FROM account_data WHERE account_id = ?',
      )
        .bind(account.id)
        .first();
      return reply(
        {
          version: 1,
          revision: row?.revision || 0,
          entries: row ? JSON.parse(row.entries) : {},
          updatedAt: row?.updated_at || null,
        },
        200,
        cors,
      );
    }
    if (path === '/account/data' && request.method === 'PUT') {
      const payload = await body(request);
      if (
        payload.version !== 1 ||
        !Number.isSafeInteger(payload.revision) ||
        payload.revision < 0 ||
        !validateEntries(payload.entries)
      )
        return problem(
          'INVALID_DATA',
          '저장할 데이터의 형식이나 크기가 올바르지 않습니다.',
          400,
          cors,
        );
      // 서버가 확인한 account.id만 사용한다. 클라이언트가 다른 사용자를 지정할 수 없다.
      const row = await env.ACCOUNTS.prepare(
        `INSERT INTO account_data (account_id, revision, entries, updated_at)
        SELECT ?, 1, ?, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM account_data WHERE account_id = ?)
        ON CONFLICT(account_id) DO UPDATE SET revision = account_data.revision + 1,
        entries = excluded.entries, updated_at = excluded.updated_at WHERE account_data.revision = ?
        RETURNING revision, updated_at`,
      )
        .bind(
          account.id,
          JSON.stringify(payload.entries),
          Date.now(),
          payload.revision,
          account.id,
          payload.revision,
        )
        .first();
      if (!row)
        return problem(
          'CONFLICT',
          '다른 탭이나 기기에서 수정했습니다. 저장 내용을 비교해 주세요.',
          409,
          cors,
        );
      return reply({ revision: row.revision, updatedAt: row.updated_at }, 200, cors);
    }
    if (path === '/account/history' && request.method === 'GET') {
      const rows = await env.ACCOUNTS.prepare(
        'SELECT revision, entries, updated_at FROM account_data_history WHERE account_id = ? ORDER BY revision DESC LIMIT 5',
      )
        .bind(account.id)
        .all();
      return reply(
        {
          snapshots: rows.results.map((row) => ({
            revision: row.revision,
            entries: JSON.parse(row.entries),
            updatedAt: row.updated_at,
          })),
        },
        200,
        cors,
      );
    }
    if (path === '/account' && request.method === 'DELETE') {
      await env.ACCOUNTS.prepare('DELETE FROM accounts WHERE id = ?').bind(account.id).run();
      return reply({ ok: true }, 200, cors, [cookie(SESSION_COOKIE, '', 0)]);
    }
    return problem('NOT_FOUND', '지원하지 않는 요청입니다.', 404, cors);
  } catch {
    // 토큰, 프로필, 사용자 입력을 로그에 남기지 않는다.
    return problem(
      'ACCOUNT_FAILED',
      '계정 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      400,
      cors,
    );
  }
}
