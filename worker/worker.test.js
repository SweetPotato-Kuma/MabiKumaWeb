// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import worker from './worker.js';

/**
 * 워커는 배포하고 나면 고치기가 번거롭다. 특히 아이템 카드 쪽은 브라우저와 약속한
 * 헤더와 경로가 맞아야 도는데, 틀려도 사이트에서는 그냥 "저장이 안 된다" 로만 보인다.
 * 그래서 여기서 요청을 직접 만들어 넣어 본다.
 *
 * KV 는 Map 하나로 흉내 낸다. 이 워커가 쓰는 것은 get / put / delete 셋뿐이다.
 */
function fakeKv() {
  const store = new Map();
  return {
    store,
    // 워커는 `get(key, { type, cacheTtl })` 로 부른다. 예전 모양 `get(key, 'json')` 도 받는다.
    async get(key, options) {
      const value = store.get(key);
      if (value === undefined) return null;
      const type = typeof options === 'string' ? options : options?.type;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

/** R2 는 get 이 객체를 돌려준다. 워커가 쓰는 것은 body 와 httpEtag 뿐이다. */
function fakeR2() {
  const store = new Map();
  return {
    store,
    async get(key) {
      const bytes = store.get(key);
      return bytes ? { body: bytes, httpEtag: `"${key}"` } : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

const ORIGIN = 'https://mabi.spkuma.com';
const ADMIN_KEY = 'a'.repeat(40);

let env;

beforeEach(() => {
  env = {
    NEXON_API_KEY: 'nexon-key',
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
    ADMIN_KEY,
    ITEM_CARDS: fakeKv(),
    ICONS: fakeR2(),
  };
});

/** 1x1 짜리 PNG. 내용은 중요하지 않고 바이트가 오간다는 것만 본다. */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function call(path, { method = 'GET', body, adminKey, origin = ORIGIN } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (body) headers['content-type'] = 'application/json';
  if (adminKey) headers['x-mabikuma-admin-key'] = adminKey;

  return worker.fetch(
    new Request(`https://worker.example${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
}

function cardBody(overrides = {}) {
  return {
    card: {
      name: "'도' 음 빈 병",
      category: '기타 소모품',
      subtitle: '보통속도 3타 악기',
      description: "입으로 불면 '도' 음이 나는 빈 병이다.",
      ...overrides,
    },
    iconBase64: TINY_PNG,
  };
}

/** 카테고리별 그림 목록이 R2 에 놓이는 자리. 워커의 iconMapKey 와 같은 규칙이다. */
async function iconMapKeyOf(category) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(category));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `maps/${hex.slice(0, 8)}.js`;
}

async function readIconMap(category) {
  const raw = env.ICONS.store.get(await iconMapKeyOf(category));
  return raw === undefined ? undefined : JSON.parse(raw);
}

describe('카테고리별 그림 목록', () => {
  it('카드를 저장하면 그 카테고리의 그림 목록도 같이 쓴다', async () => {
    // 화면은 이 목록을 CDN 에서 바로 받아 워커 조회 없이 그림을 띄운다.
    const saved = await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    const { card } = await saved.json();

    expect(await readIconMap('기타 소모품')).toEqual({
      category: '기타 소모품',
      items: { "'도' 음 빈 병": [card.icon, '보통속도 3타 악기'] },
    });
  });

  it('카드를 지우면 목록에서도 빠진다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    await call(`/item-card?name=${encodeURIComponent("'도' 음 빈 병")}&category=${encodeURIComponent('기타 소모품')}`, {
      method: 'DELETE',
      adminKey: ADMIN_KEY,
    });

    expect((await readIconMap('기타 소모품')).items).toEqual({});
  });

  it('목록을 칸에서 다시 만드는 경로는 운영자만 쓴다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    env.ICONS.store.delete(await iconMapKeyOf('기타 소모품'));
    const path = `/item-card/maps?category=${encodeURIComponent('기타 소모품')}`;

    expect((await call(path, { method: 'POST' })).status).toBe(401);
    expect(await readIconMap('기타 소모품')).toBeUndefined();

    const response = await call(path, { method: 'POST', adminKey: ADMIN_KEY });
    expect(response.status).toBe(200);
    expect(Object.keys((await readIconMap('기타 소모품')).items)).toEqual(["'도' 음 빈 병"]);
  });
});

describe('아이템 카드 쓰기', () => {
  it('키가 없으면 저장하지 않는다', async () => {
    const response = await call('/item-card', { method: 'POST', body: cardBody() });

    expect(response.status).toBe(401);
    expect(env.ITEM_CARDS.store.size).toBe(0);
  });

  it('키가 틀리면 저장하지 않는다', async () => {
    const response = await call('/item-card', {
      method: 'POST',
      body: cardBody(),
      adminKey: 'b'.repeat(40),
    });

    expect(response.status).toBe(401);
  });

  it('키가 맞으면 카드와 아이콘을 같이 넣는다', async () => {
    const response = await call('/item-card', {
      method: 'POST',
      body: cardBody(),
      adminKey: ADMIN_KEY,
    });

    expect(response.status).toBe(200);
    const { card, count } = await response.json();
    expect(count).toBe(1);
    expect(card.name).toBe("'도' 음 빈 병");
    expect(card.icon).toMatch(/^[0-9a-f]{16}\.png$/);
    expect(env.ICONS.store.has(card.icon)).toBe(true);
  });

  it('이름이 비면 거절한다', async () => {
    const response = await call('/item-card', {
      method: 'POST',
      body: cardBody({ name: '   ' }),
      adminKey: ADMIN_KEY,
    });

    expect(response.status).toBe(400);
  });

  it('같은 이름을 다시 저장하면 덮어쓰고 개수는 그대로다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    const response = await call('/item-card', {
      method: 'POST',
      body: cardBody({ subtitle: '고친 설명' }),
      adminKey: ADMIN_KEY,
    });

    const { card, count } = await response.json();
    expect(count).toBe(1);
    expect(card.subtitle).toBe('고친 설명');
  });

  it('아이콘을 안 보내면 전에 저장한 아이콘을 지우지 않는다', async () => {
    const first = await call('/item-card', {
      method: 'POST',
      body: cardBody(),
      adminKey: ADMIN_KEY,
    });
    const before = (await first.json()).card.icon;

    const second = await call('/item-card', {
      method: 'POST',
      body: { card: cardBody().card, iconBase64: null },
      adminKey: ADMIN_KEY,
    });

    expect((await second.json()).card.icon).toBe(before);
  });

  it('한글 이름이 그대로 왕복한다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    const found = await (
      await call('/item-card/lookup', {
        method: 'POST',
        body: { category: '기타 소모품', names: ["'도' 음 빈 병"] },
      })
    ).json();

    expect(found.cards[0].name).toBe("'도' 음 빈 병");
    expect(found.cards[0].description).toBe("입으로 불면 '도' 음이 나는 빈 병이다.");
  });
});

describe('아이템 카드 읽기', () => {
  it('여러 카테고리를 한 번에 물을 수 있다', async () => {
    // 경매장은 키워드로 찾으면 여러 카테고리가 섞인다. 카테고리마다 따로 부르면 요청이 불어난다.
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    await call('/item-card', {
      method: 'POST',
      body: cardBody({ name: '롱 소드', category: '검' }),
      adminKey: ADMIN_KEY,
    });

    const response = await call('/item-card/lookup', {
      method: 'POST',
      body: {
        groups: [
          { category: '기타 소모품', names: ["'도' 음 빈 병"] },
          { category: '검', names: ['롱 소드'] },
        ],
      },
    });

    expect(response.status).toBe(200);
    const names = (await response.json()).cards.map((card) => card.name).sort();
    expect(names).toEqual(["'도' 음 빈 병", '롱 소드']);
  });

  it('여러 카테고리로 나눠 물어도 이름 수 상한은 합쳐서 센다', async () => {
    const half = (prefix) => Array.from({ length: 31 }, (_, i) => `${prefix} ${i}`);
    const response = await call('/item-card/lookup', {
      method: 'POST',
      body: {
        groups: [
          { category: '검', names: half('검') },
          { category: '활', names: half('활') },
        ],
      },
    });

    expect(response.status).toBe(400);
  });

  it('카테고리를 너무 많이 섞으면 거절한다', async () => {
    const groups = ['검', '활', '천옷', '음식', '날개'].map((category) => ({
      category,
      names: ['가'],
    }));
    const response = await call('/item-card/lookup', { method: 'POST', body: { groups } });

    expect(response.status).toBe(400);
  });

  it('같은 칸을 곧바로 다시 물으면 KV 까지 가지 않는다', async () => {
    // 인기 카테고리는 몇 초 간격으로 계속 조회된다. 매번 KV 를 읽고 JSON 을 풀 이유가 없다.
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    let reads = 0;
    const get = env.ITEM_CARDS.get.bind(env.ITEM_CARDS);
    env.ITEM_CARDS.get = async (key, type) => {
      reads++;
      return get(key, type);
    };

    const body = { category: '기타 소모품', names: ["'도' 음 빈 병"] };
    const first = await call('/item-card/lookup', { method: 'POST', body });
    const second = await call('/item-card/lookup', { method: 'POST', body });

    // 저장할 때 이미 그 칸을 들고 있으므로 두 번 다 메모리에서 나온다.
    expect(reads).toBe(0);
    expect(first.headers.get('x-card-shards')).toBe('1/1');
    expect((await second.json()).cards).toHaveLength(1);
  });

  it('KV 를 읽을 때 그 지역 엣지에 한 시간 남겨 두라고 한다', async () => {
    // 인스턴스 메모리에 없을 때 중앙 저장소까지 가지 않게 하려는 것이다.
    const calls = [];
    const get = env.ITEM_CARDS.get.bind(env.ITEM_CARDS);
    env.ITEM_CARDS.get = async (key, options) => {
      calls.push(options);
      return get(key, options);
    };

    await call('/item-card/lookup', { method: 'POST', body: { category: '처음 보는 칸', names: ['없는 이름'] } });

    expect(calls).toEqual([{ type: 'json', cacheTtl: 3600 }]);
  });

  it('칸을 새로 쓰면 들고 있던 옛 칸도 바로 바뀐다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    const body = { category: '기타 소모품', names: ["'도' 음 빈 병"] };
    await call('/item-card/lookup', { method: 'POST', body });

    await call('/item-card', {
      method: 'POST',
      body: cardBody({ description: '고친 설명' }),
      adminKey: ADMIN_KEY,
    });
    const { cards } = await (await call('/item-card/lookup', { method: 'POST', body })).json();

    expect(cards[0].description).toBe('고친 설명');
  });

  it('그림 주소를 따로 정해 두면 조회 결과에 붙여 준다', async () => {
    // 그림을 워커가 아닌 R2 자체 도메인에서 내보낼 때다. 그림마다 워커 요청을 쓰지 않는다.
    env.ICON_BASE_URL = 'https://icons.example/';
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });

    const { cards } = await (
      await call('/item-card/lookup', {
        method: 'POST',
        body: { category: '기타 소모품', names: ["'도' 음 빈 병"] },
      })
    ).json();

    expect(cards[0].iconUrl).toBe(`https://icons.example/${cards[0].icon}`);
  });

  it('그림 주소를 정하지 않았으면 붙이지 않는다', async () => {
    // 화면은 이때 워커 경로로 받는다.
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });

    const { cards } = await (
      await call('/item-card/lookup', {
        method: 'POST',
        body: { category: '기타 소모품', names: ["'도' 음 빈 병"] },
      })
    ).json();

    expect(cards[0].iconUrl).toBeUndefined();
  });

  it('카테고리를 안 보내면 조회를 거절한다', async () => {
    // 칸을 모르면 전부 뒤져야 한다. 그러라고 만든 경로가 아니다.
    const response = await call('/item-card/lookup', { method: 'POST', body: { names: ['가'] } });

    expect(response.status).toBe(400);
  });

  it('다른 카테고리의 카드는 섞여 나오지 않는다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    const response = await call('/item-card/lookup', {
      method: 'POST',
      body: { category: '검', names: ["'도' 음 빈 병"] },
    });

    expect((await response.json()).cards).toEqual([]);
  });

  it('보이는 이름만 물으면 그것만 돌려준다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    await call('/item-card', {
      method: 'POST',
      body: cardBody({ name: '벚꽃 장식 머리핀' }),
      adminKey: ADMIN_KEY,
    });

    const response = await call('/item-card/lookup', {
      method: 'POST',
      body: { category: '기타 소모품', names: ['벚꽃 장식 머리핀'] },
    });

    expect(response.status).toBe(200);
    const { cards } = await response.json();
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe('벚꽃 장식 머리핀');
  });

  it('없는 이름을 물으면 그 자리는 그냥 빈다', async () => {
    const response = await call('/item-card/lookup', {
      method: 'POST',
      body: { category: '기타 소모품', names: ['없는 아이템'] },
    });

    expect((await response.json()).cards).toEqual([]);
  });

  it('한 번에 너무 많은 이름을 물으면 거절한다', async () => {
    const names = Array.from({ length: 61 }, (_, index) => `아이템 ${index}`);
    const response = await call('/item-card/lookup', {
      method: 'POST',
      body: { category: '기타 소모품', names },
    });

    expect(response.status).toBe(400);
  });

  it('조회 횟수 제한에 걸리면 429 다', async () => {
    env.CARD_RATE_LIMIT = { limit: async () => ({ success: false }) };
    const response = await call('/item-card/lookup', {
      method: 'POST',
      body: { category: '기타', names: ['가'] },
    });

    expect(response.status).toBe(429);
  });

  it('저장소를 아직 안 붙였어도 사전 화면이 깨지지 않게 빈 결과를 준다', async () => {
    env.ITEM_CARDS = undefined;
    const response = await call('/item-card/lookup', {
      method: 'POST',
      body: { category: '기타', names: ['가'] },
    });

    expect(response.status).toBe(200);
    expect((await response.json()).cards).toEqual([]);
  });

  it('아이콘은 Origin 헤더가 없어도 나간다', async () => {
    const saved = await call('/item-card', {
      method: 'POST',
      body: cardBody(),
      adminKey: ADMIN_KEY,
    });
    const { card } = await saved.json();

    /**
     * <img src> 로 부르는 요청에는 Origin 이 붙지 않는다. 출처 검사를 그대로 통과시키면
     * 사전 화면의 아이콘이 전부 403 이 된다. 이 테스트가 그 회귀를 잡는다.
     */
    const response = await call(`/item-card/icons/${card.icon}`, { origin: null });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it('없는 아이콘은 404 다', async () => {
    const response = await call('/item-card/icons/0123456789abcdef.png', { origin: null });

    expect(response.status).toBe(404);
  });

  it('아이콘 경로로 다른 KV 값을 꺼내 갈 수 없다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });

    // 이름이 16자리 16진수 + .png 가 아니면 KV 를 보지도 않는다.
    for (const name of ['cards', 'icon:cards', '..%2fcards', 'ZZZZZZZZZZZZZZZZ.png']) {
      expect((await call(`/item-card/icons/${name}`, { origin: null })).status).toBe(404);
    }
  });
});

describe('아이템 카드 삭제', () => {
  it('키가 없으면 지우지 못한다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });
    const response = await call(
      `/item-card?name=${encodeURIComponent("'도' 음 빈 병")}&category=${encodeURIComponent('기타 소모품')}`,
      { method: 'DELETE' },
    );

    expect(response.status).toBe(401);
  });

  it('카드를 지우면 목록에서 빠진다', async () => {
    const saved = await call('/item-card', {
      method: 'POST',
      body: cardBody(),
      adminKey: ADMIN_KEY,
    });
    const { card } = await saved.json();

    const response = await call(
      `/item-card?name=${encodeURIComponent(card.name)}&category=${encodeURIComponent(card.category)}`,
      { method: 'DELETE', adminKey: ADMIN_KEY },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).count).toBe(0);
    expect(env.ITEM_CARDS.store.has(`icon:${card.icon}`)).toBe(false);
  });

  it('없는 이름을 지우라고 하면 404 다', async () => {
    const response = await call('/item-card?name=없는아이템&category=기타', {
      method: 'DELETE',
      adminKey: ADMIN_KEY,
    });

    expect(response.status).toBe(404);
  });
});

describe('키 확인', () => {
  it('맞는 키에는 204 로 답한다', async () => {
    const response = await call('/item-card/verify', { method: 'POST', adminKey: ADMIN_KEY });

    expect(response.status).toBe(204);
  });

  it('틀린 키에는 401 로 답한다', async () => {
    const response = await call('/item-card/verify', { method: 'POST', adminKey: 'wrong' });

    expect(response.status).toBe(401);
  });

  it('워커에 ADMIN_KEY 를 안 넣었으면 설정이 안 됐다고 말한다', async () => {
    env.ADMIN_KEY = undefined;
    const response = await call('/item-card/verify', { method: 'POST', adminKey: ADMIN_KEY });

    expect(response.status).toBe(503);
  });
});

describe('기존 경로가 그대로 도는지', () => {
  it('허용하지 않은 출처는 여전히 막는다', async () => {
    const response = await call('/item-card/lookup', {
      method: 'POST',
      body: { category: '기타', names: ['가'] },
      origin: 'https://copycat.example',
    });

    expect(response.status).toBe(403);
  });

  it('중계하지 않는 경로는 여전히 막는다', async () => {
    const response = await call('/mabinogi/v1/secret/thing');

    expect(response.status).toBe(403);
  });

  it('preflight 에 운영자 헤더를 허용한다고 답한다', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example/item-card', {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN },
      }),
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('x-mabikuma-admin-key');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });
});

describe('일괄 등록 경로', () => {
  it('아이콘 여러 장을 한 번에 올리고 파일 이름을 돌려준다', async () => {
    const response = await call('/item-card/icons', {
      method: 'POST',
      adminKey: ADMIN_KEY,
      body: { icons: [{ key: '51102', base64: TINY_PNG }] },
    });

    expect(response.status).toBe(200);
    const { files } = await response.json();
    expect(files['51102']).toMatch(/^[0-9a-f]{16}\.png$/);
    expect(env.ICONS.store.has(files['51102'])).toBe(true);
  });

  it('같은 그림은 두 번 올려도 파일이 하나다', async () => {
    const body = {
      icons: [
        { key: 'a', base64: TINY_PNG },
        { key: 'b', base64: TINY_PNG },
      ],
    };
    const { files } = await (
      await call('/item-card/icons', { method: 'POST', adminKey: ADMIN_KEY, body })
    ).json();

    // 이름이 내용 해시라 같은 그림은 같은 이름이 된다.
    expect(files.a).toBe(files.b);
    expect(env.ICONS.store.size).toBe(1);
  });

  it('같은 그림이 한 번에 여러 장 와도 R2 에는 한 번만 쓴다', async () => {
    /**
     * R2 는 같은 파일을 동시에 두 번 쓰면 하나를 거절한다. 염색이나 성별만 다른 아이템은
     * 그림이 같아서, 이걸 막지 않으면 실제로 1,128장이 빠졌다.
     */
    let puts = 0;
    const put = env.ICONS.put.bind(env.ICONS);
    env.ICONS.put = async (key, value, options) => {
      puts++;
      return put(key, value, options);
    };

    const icons = ['a', 'b', 'c'].map((key) => ({ key, base64: TINY_PNG }));
    const { files } = await (
      await call('/item-card/icons', { method: 'POST', adminKey: ADMIN_KEY, body: { icons } })
    ).json();

    expect(puts).toBe(1);
    expect(new Set(Object.values(files)).size).toBe(1);
    expect(Object.keys(files).sort()).toEqual(['a', 'b', 'c']);
  });

  it('올린 그림에 오래 캐시해도 된다는 표시를 붙인다', async () => {
    // 워커를 거치지 않고 R2 에서 바로 내보낼 때 CDN 과 브라우저가 이 표시를 본다.
    let options;
    const put = env.ICONS.put.bind(env.ICONS);
    env.ICONS.put = async (key, value, given) => {
      options = given;
      return put(key, value, given);
    };

    await call('/item-card/icons', {
      method: 'POST',
      adminKey: ADMIN_KEY,
      body: { icons: [{ key: 'a', base64: TINY_PNG }] },
    });

    expect(options.httpMetadata.cacheControl).toContain('immutable');
    expect(options.httpMetadata.contentType).toBe('image/png');
  });

  it('아이콘을 한 번에 너무 많이 올리면 거절한다', async () => {
    const icons = Array.from({ length: 41 }, (_, i) => ({ key: String(i), base64: TINY_PNG }));
    const response = await call('/item-card/icons', {
      method: 'POST',
      adminKey: ADMIN_KEY,
      body: { icons },
    });

    expect(response.status).toBe(400);
  });

  it('아이콘 올리기에도 키가 필요하다', async () => {
    const response = await call('/item-card/icons', {
      method: 'POST',
      body: { icons: [{ key: 'a', base64: TINY_PNG }] },
    });

    expect(response.status).toBe(401);
  });

  it('카테고리 한 칸을 통째로 갈아 끼운다', async () => {
    await call('/item-card', { method: 'POST', body: cardBody(), adminKey: ADMIN_KEY });

    const response = await call('/item-card/shard', {
      method: 'PUT',
      adminKey: ADMIN_KEY,
      body: {
        category: '기타 소모품',
        cards: [
          { name: '새 아이템', description: '한꺼번에 올린 설명', icon: 'a1b2c3d4e5f60718.png' },
        ],
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ category: '기타 소모품', count: 1 });

    // 갈아 끼웠으므로 전에 있던 카드는 빠진다.
    const found = await (
      await call('/item-card/lookup', {
        method: 'POST',
        body: { category: '기타 소모품', names: ['새 아이템', "'도' 음 빈 병"] },
      })
    ).json();
    expect(found.cards.map((card) => card.name)).toEqual(['새 아이템']);
  });

  it('칸에 실린 엉뚱한 아이콘 이름은 버린다', async () => {
    await call('/item-card/shard', {
      method: 'PUT',
      adminKey: ADMIN_KEY,
      body: { category: '검', cards: [{ name: '검 하나', icon: '../cards' }] },
    });

    const found = await (
      await call('/item-card/lookup', {
        method: 'POST',
        body: { category: '검', names: ['검 하나'] },
      })
    ).json();
    expect(found.cards[0].icon).toBe('');
  });

  it('칸 쓰기에도 키가 필요하다', async () => {
    const response = await call('/item-card/shard', {
      method: 'PUT',
      body: { category: '검', cards: [] },
    });

    expect(response.status).toBe(401);
  });
});

describe('장비 정보', () => {
  /** 한손검 하나와 그 칸에 딸린 개조, 세공 정의. 실제 수집 결과와 같은 모양이다. */
  function equipShard() {
    return {
      category: '검',
      items: {
        '소울 리버레이트 소드': {
          id: 1000059,
          base: { attack_min: 89, attack_max: 139, critical: 10, balance: 77, durability: 20 },
          random: [['attack_min', 0, 10]],
          upgrade: { max: 5, gemMax: 1, ids: [52500] },
          reforge: { type: 'OHSword', races: 'heg' },
          special: { s: 201, r: 301, max: 8 },
          enchants: 0,
        },
        '인챈트 없는 검': { id: 1, base: { attack_max: 10 } },
      },
      enchants: {
        21643: { name: '거침없는', slot: 0, level: 10, desc: ['최대 생명력 100 증가'], effects: [] },
        21538: { name: '충돌의', slot: 0, level: 12, desc: [], effects: [] },
        10604: { name: '파머', slot: 1, level: 1, desc: [], effects: [] },
      },
      enchantGroups: { 0: [21643, 10604] },
      upgrades: {
        52500: { name: '검신 다듬기1', stats: [['attack_max', 14, 14]], min: 1, max: 1 },
        99999: { name: '다른 아이템의 개조', stats: [], min: 0, max: 0 },
      },
      abilities: {
        1: { name: '체력', types: ['OHSword', 'THSword'], races: 'heg', lv: [20, 10, 5] },
        2: { name: '양손검 전용', types: ['THSword'], races: 'heg', lv: [20, 10, 5] },
        3: { name: '자이언트 전용', types: ['OHSword'], races: 'g', lv: [20, 10, 5] },
      },
      levels: [[20, 1, 5, 1, 10, 1, 20, 21, 25]],
    };
  }

  const lookup = (category, name) =>
    call(`/item-equip?category=${encodeURIComponent(category)}&name=${encodeURIComponent(name)}`);

  it('올린 장비를 하나씩 꺼낸다', async () => {
    const put = await call('/item-equip/shard', {
      method: 'PUT',
      adminKey: ADMIN_KEY,
      body: equipShard(),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ category: '검', count: 2 });

    const body = await (await lookup('검', '소울 리버레이트 소드')).json();
    expect(body.item).toMatchObject({ id: 1000059, name: '소울 리버레이트 소드', category: '검' });
    expect(body.levels).toHaveLength(1);
  });

  it('그 아이템에 붙는 개조와 세공만 싣는다', async () => {
    await call('/item-equip/shard', { method: 'PUT', adminKey: ADMIN_KEY, body: equipShard() });

    const body = await (await lookup('검', '소울 리버레이트 소드')).json();
    expect(Object.keys(body.upgrades)).toEqual(['52500']);
    // 양손검 전용은 종류가 달라서, 자이언트 전용은 종족이 겹쳐서 붙는다.
    expect(body.abilities.map((ability) => ability.id).sort()).toEqual([1, 3]);
  });

  it('인챈트는 그 아이템의 묶음에 든 것만 풀어 싣는다', async () => {
    await call('/item-equip/shard', { method: 'PUT', adminKey: ADMIN_KEY, body: equipShard() });

    const body = await (await lookup('검', '소울 리버레이트 소드')).json();
    expect(body.enchants.map((enchant) => enchant.id).sort()).toEqual([10604, 21643]);
    expect(body.enchants.find((enchant) => enchant.id === 21643)).toMatchObject({ name: '거침없는' });
  });

  it('인챈트가 없는 아이템은 빈 목록이다', async () => {
    await call('/item-equip/shard', { method: 'PUT', adminKey: ADMIN_KEY, body: equipShard() });

    const body = await (await lookup('검', '인챈트 없는 검')).json();
    expect(body.enchants).toEqual([]);
  });

  it('종족이 하나도 겹치지 않는 세공은 뺀다', async () => {
    const shard = equipShard();
    shard.items['소울 리버레이트 소드'].reforge.races = 'he';
    await call('/item-equip/shard', { method: 'PUT', adminKey: ADMIN_KEY, body: shard });

    const body = await (await lookup('검', '소울 리버레이트 소드')).json();
    expect(body.abilities.map((ability) => ability.id)).toEqual([1]);
  });

  it('없는 아이템은 빈 자리로 답한다', async () => {
    await call('/item-equip/shard', { method: 'PUT', adminKey: ADMIN_KEY, body: equipShard() });

    const response = await lookup('검', '없는 검');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: null });
  });

  it('칸을 다시 올리면 들고 있던 옛 칸 대신 새 칸을 읽는다', async () => {
    await call('/item-equip/shard', { method: 'PUT', adminKey: ADMIN_KEY, body: equipShard() });
    await lookup('검', '소울 리버레이트 소드');

    const shard = equipShard();
    shard.items['소울 리버레이트 소드'].base.attack_max = 150;
    await call('/item-equip/shard', { method: 'PUT', adminKey: ADMIN_KEY, body: shard });

    const body = await (await lookup('검', '소울 리버레이트 소드')).json();
    expect(body.item.base.attack_max).toBe(150);
  });

  it('카드 칸과 섞이지 않는다', async () => {
    await call('/item-card', {
      method: 'POST',
      body: cardBody({ category: '검' }),
      adminKey: ADMIN_KEY,
    });
    await call('/item-equip/shard', { method: 'PUT', adminKey: ADMIN_KEY, body: equipShard() });

    const found = await (
      await call('/item-card/lookup', {
        method: 'POST',
        body: { category: '검', names: ["'도' 음 빈 병"] },
      })
    ).json();
    expect(found.cards).toHaveLength(1);
  });

  it('칸 쓰기에는 키가 필요하다', async () => {
    const response = await call('/item-equip/shard', { method: 'PUT', body: equipShard() });
    expect(response.status).toBe(401);
  });

  it('카테고리나 이름이 없으면 거절한다', async () => {
    expect((await call('/item-equip?name=x')).status).toBe(400);
    expect((await call('/item-equip?category=x')).status).toBe(400);
  });

  it('조회 횟수 제한에 걸리면 429 다', async () => {
    env.CARD_RATE_LIMIT = { limit: async () => ({ success: false }) };
    expect((await lookup('검', '소울 리버레이트 소드')).status).toBe(429);
  });

  it('허용하지 않은 출처는 막는다', async () => {
    const response = await call('/item-equip?category=검&name=x', {
      origin: 'https://evil.example',
    });
    expect(response.status).toBe(403);
  });
});
