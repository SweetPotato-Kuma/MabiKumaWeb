// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';

/**
 * 튼튼한 주머니 찾기 경로.
 *
 * 넥슨 API 는 가짜 fetch 로 대신한다. 워커가 NPC 마다 부르는지, 주머니 줄만 추리는지,
 * 같은 채널을 다음 갱신 전까지 다시 부르지 않는지를 본다.
 *
 * 워커는 채널별 결과를 모듈 메모리에 들고 있으므로, 테스트끼리 섞이지 않게 테스트마다
 * 다른 채널을 쓴다.
 */
const ORIGIN = 'https://mabi.spkuma.com';
const env = { NEXON_API_KEY: 'nexon-key', ALLOWED_ORIGINS: ORIGIN };

function shop({ nextUpdate }) {
  return {
    date_inquire: new Date().toISOString(),
    date_shop_next_update: nextUpdate,
    shop: [
      {
        tab_name: '주머니',
        item: [
          {
            item_display_name: '튼튼한 고급 실크 주머니',
            image_url: 'https://open.api.nexon.com/static/mabinogi/img/ead0f110c5139356446221d0fbca345d?q=4b45',
            price: [{ price_type: '두카트', price_value: 500000 }],
            item_option: [
              // 파트 순서를 일부러 섞어 둔다. 워커가 A, B, C 로 맞춰야 한다.
              { option_type: '아이템 색상', option_sub_type: '파트 B', option_value: '107,58,68' },
              { option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '187,148,199' },
              { option_type: '아이템 색상', option_sub_type: '파트 C', option_value: '255,255,255' },
            ],
          },
          // 넥슨 그림 주소가 아니면 믿을 수 없어 그림을 보내지 않는다.
          {
            item_display_name: '튼튼한 밀 주머니',
            image_url: 'https://evil.example/bag.png',
            price: [{ price_type: '두카트', price_value: 1000 }],
            item_option: [],
          },
          { item_display_name: '꽃바구니', price: [{ price_type: '골드', price_value: 350000 }], item_option: [] },
        ],
      },
      { tab_name: '일반', item: [{ item_display_name: '붕대', price: [], item_option: [] }] },
    ],
  };
}

function request(path) {
  return new Request(`https://worker.test${path}`, { headers: { Origin: ORIGIN } });
}

const bagsPath = (server, channel) =>
  `/npcshop/bags?server=${encodeURIComponent(server)}&channel=${channel}`;

let calls;
let failFor;

beforeEach(() => {
  calls = [];
  failFor = new Set();
  const nextUpdate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  vi.stubGlobal('fetch', async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, key: init?.headers?.['x-nxopen-api-key'] });
    const npc = url.searchParams.get('npc_name');
    if (failFor.has(npc)) return new Response('{}', { status: 500 });
    return new Response(JSON.stringify(shop({ nextUpdate })), { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('튼튼한 주머니 찾기', () => {
  it('한 채널의 NPC 17명을 모두 부르고 튼튼한 주머니만 돌려준다', async () => {
    const response = await worker.fetch(request(bagsPath('류트', 1)), env);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(calls).toHaveLength(17);
    expect(calls.every((call) => call.key === 'nexon-key')).toBe(true);
    expect(calls.every((call) => call.url.searchParams.get('channel') === '1')).toBe(true);

    expect(body.server).toBe('류트');
    expect(body.channel).toBe(1);
    expect(body.npcs).toHaveLength(17);
    expect(body.npcs[0].bags).toEqual([
      {
        n: '튼튼한 고급 실크 주머니',
        c: ['bb94c7', '6b3a44', 'ffffff'],
        p: 500000,
        t: '두카트',
        i: 'ead0f110c5139356446221d0fbca345d?q=4b45',
      },
      { n: '튼튼한 밀 주머니', c: [], p: 1000, t: '두카트' },
    ]);
  });

  it('같은 채널을 곧바로 다시 물으면 넥슨을 부르지 않는다', async () => {
    await worker.fetch(request(bagsPath('류트', 2)), env);
    calls = [];

    const again = await worker.fetch(request(bagsPath('류트', 2)), env);
    expect(again.headers.get('x-bag-cache')).toBe('hit');
    expect(calls).toHaveLength(0);
  });

  it('답하지 못한 NPC 는 그 자리에 오류로 남기고 나머지는 돌려준다', async () => {
    failFor.add('상인 라누');
    const body = await (await worker.fetch(request(bagsPath('하프', 3)), env)).json();

    const ranu = body.npcs.find((entry) => entry.npc === '상인 라누');
    expect(ranu).toEqual({ npc: '상인 라누', error: 500 });
    expect(body.npcs.filter((entry) => entry.bags)).toHaveLength(16);
  });

  it('서버에 없는 채널은 넥슨을 부르지 않고 거절한다', async () => {
    const response = await worker.fetch(request(bagsPath('울프', 17)), env);
    expect(response.status).toBe(400);
    expect((await response.json()).error.name).toBe('BAG_INVALID_QUERY');
    expect(calls).toHaveLength(0);
  });

  it('모르는 서버도 거절한다', async () => {
    const response = await worker.fetch(request(bagsPath('없는서버', 1)), env);
    expect(response.status).toBe(400);
  });

  it('허용하지 않은 출처는 막는다', async () => {
    const response = await worker.fetch(
      new Request(`https://worker.test${bagsPath('류트', 4)}`, { headers: { Origin: 'https://evil.example' } }),
      env,
    );
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});
