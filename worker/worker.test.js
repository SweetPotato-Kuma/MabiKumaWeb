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
    async get(key, type) {
      const value = store.get(key);
      if (value === undefined) return null;
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
