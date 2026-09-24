// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';

/**
 * 마그 멜 통행증 찾기 경로.
 *
 * 넥슨 API 는 가짜 fetch 로 대신한다. 워커가 서버의 모든 채널에서 피오나트를 부르는지,
 * 통행증 줄만 추리는지, 같은 서버를 다음 갱신 전까지 다시 부르지 않는지를 본다.
 *
 * 워커는 서버별 결과를 모듈 메모리에 들고 있으므로, 테스트끼리 섞이지 않게 테스트마다
 * 다른 서버를 쓴다.
 */
const ORIGIN = 'https://mabi.spkuma.com';
const env = { NEXON_API_KEY: 'nexon-key', ALLOWED_ORIGINS: ORIGIN };

function shop({ nextUpdate, price }) {
  return {
    date_inquire: new Date().toISOString(),
    date_shop_next_update: nextUpdate,
    shop: [
      {
        tab_name: '지원',
        item: [
          { item_display_name: '빈 병', price: [{ price_type: '골드', price_value: 400 }] },
          {
            item_display_name: '마그 멜 미션 통행증 - 사계의 숲(어려움)',
            price: [{ price_type: '골드', price_value: price }],
          },
          {
            item_display_name: '마그 멜 미션 통행증 - 역동의 대지(어려움)',
            price: [{ price_type: '골드', price_value: price }],
          },
        ],
      },
      { tab_name: '기타', item: [{ item_display_name: '마그 멜의 이슬', price: [] }] },
    ],
  };
}

function request(path) {
  return new Request(`https://worker.test${path}`, { headers: { Origin: ORIGIN } });
}

const passPath = (server) => `/npcshop/magmell-pass?server=${encodeURIComponent(server)}`;

let calls;
let failFor;

beforeEach(() => {
  calls = [];
  failFor = new Set();
  const nextUpdate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  vi.stubGlobal('fetch', async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, key: init?.headers?.['x-nxopen-api-key'] });
    const channel = Number(url.searchParams.get('channel'));
    if (failFor.has(channel)) return new Response('{}', { status: 500 });
    // 채널마다 값을 달리 둔다. 워커가 채널 번호와 가격을 제자리에 붙이는지 본다.
    return new Response(JSON.stringify(shop({ nextUpdate, price: channel * 10000 })), {
      status: 200,
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('마그 멜 통행증 찾기', () => {
  it('서버의 모든 채널에서 피오나트를 부르고 통행증만 돌려준다', async () => {
    const response = await worker.fetch(request(passPath('울프')), env);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(calls).toHaveLength(16);
    expect(calls.every((call) => call.key === 'nexon-key')).toBe(true);
    expect(calls.every((call) => call.url.searchParams.get('npc_name') === '피오나트')).toBe(true);
    expect(
      calls.map((call) => Number(call.url.searchParams.get('channel'))).sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));

    expect(body.server).toBe('울프');
    expect(body.channels).toHaveLength(16);
    expect(body.channels[2]).toMatchObject({
      channel: 3,
      passes: [
        { n: '마그 멜 미션 통행증 - 사계의 숲(어려움)', p: 30000, t: '골드' },
        { n: '마그 멜 미션 통행증 - 역동의 대지(어려움)', p: 30000, t: '골드' },
      ],
    });
  });

  it('같은 서버를 곧바로 다시 물으면 넥슨을 부르지 않는다', async () => {
    await worker.fetch(request(passPath('만돌린')), env);
    calls = [];

    const again = await worker.fetch(request(passPath('만돌린')), env);
    expect(again.headers.get('x-pass-cache')).toBe('hit');
    expect(calls).toHaveLength(0);
  });

  it('답하지 못한 채널은 그 자리에 오류로 남기고 나머지는 돌려준다', async () => {
    failFor.add(7);
    const body = await (await worker.fetch(request(passPath('하프')), env)).json();

    expect(body.channels.find((entry) => entry.channel === 7)).toEqual({ channel: 7, error: 500 });
    expect(body.channels.filter((entry) => entry.passes)).toHaveLength(24);
  });

  it('류트 44채널도 요청 하나의 외부 호출 한도(50번) 안에서 끝난다', async () => {
    await worker.fetch(request(passPath('류트')), env);
    expect(calls).toHaveLength(44);
    expect(calls.length).toBeLessThanOrEqual(50);
  });

  it('모르는 서버는 넥슨을 부르지 않고 거절한다', async () => {
    const response = await worker.fetch(request(passPath('없는서버')), env);
    expect(response.status).toBe(400);
    expect((await response.json()).error.name).toBe('PASS_INVALID_QUERY');
    expect(calls).toHaveLength(0);
  });

  it('허용하지 않은 출처는 막는다', async () => {
    const response = await worker.fetch(
      new Request(`https://worker.test${passPath('류트')}`, {
        headers: { Origin: 'https://evil.example' },
      }),
      env,
    );
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});
