import { describe, expect, it } from 'vitest';
import {
  bagConditionParams,
  DEFAULT_TARGETS,
  hasBagConditions,
  readBagConditions,
} from './searchParams';

const params = (query: string) => new URLSearchParams(query);

describe('주머니 찾기 주소', () => {
  it('아무것도 없으면 기본 조건이다', () => {
    expect(readBagConditions(params(''))).toEqual({
      server: '류트',
      bags: [],
      targets: DEFAULT_TARGETS,
    });
    expect(hasBagConditions(params(''))).toBe(false);
  });

  it('서버, 주머니, 파트별 색을 읽는다', () => {
    const conditions = readBagConditions(
      params('server=하프&bag=group:herb&bag=튼튼한 골드 허브 주머니&a=ff0000&b=00ff00&c=-'),
    );

    expect(conditions.server).toBe('하프');
    expect(conditions.bags).toEqual(['group:herb', '튼튼한 골드 허브 주머니']);
    expect(conditions.targets).toEqual([
      { color: '#ff0000', excluded: false },
      { color: '#00ff00', excluded: false },
      { color: '#ffffff', excluded: true },
    ]);
    expect(hasBagConditions(params('server=하프'))).toBe(true);
  });

  it('파트를 검색에서 빼려면 -를 쓴다', () => {
    expect(readBagConditions(params('a=-')).targets[0]).toEqual({ color: '#ffffff', excluded: true });
  });

  it('낯선 값은 기본으로 돌린다', () => {
    const conditions = readBagConditions(
      params('server=없는서버&a=red&b=12345&c=gggggg&bag=group:nothing&bag=' + 'x'.repeat(100)),
    );

    expect(conditions.server).toBe('류트');
    expect(conditions.targets).toEqual(DEFAULT_TARGETS);
    expect(conditions.bags).toEqual([]);
  });

  it('같은 칸을 두 번 적어도 한 번만 받는다', () => {
    expect(readBagConditions(params('bag=가&bag=가')).bags).toEqual(['가']);
  });

  it('기본 조건이면 주소에 아무것도 쓰지 않는다', () => {
    expect(bagConditionParams({ server: '류트', bags: [], targets: DEFAULT_TARGETS })).toEqual({
      server: null,
      bag: [],
      a: null,
      b: null,
      c: null,
    });
  });

  it('바뀐 조건만 주소에 쓰고, 읽으면 그대로 돌아온다', () => {
    const conditions = {
      server: '울프',
      bags: ['group:leather'],
      targets: [
        { color: '#123456', excluded: false },
        { color: '#ffffff', excluded: false },
        { color: '#ffffff', excluded: true },
      ],
    };
    const written = bagConditionParams(conditions);

    expect(written).toEqual({
      server: '울프',
      bag: ['group:leather'],
      a: '123456',
      b: 'ffffff',
      c: null,
    });

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(written)) {
      for (const each of Array.isArray(value) ? value : [value]) if (each) query.append(key, each);
    }
    expect(readBagConditions(query)).toEqual(conditions);
  });

  it('검색에서 뺀 파트는 색을 기억하지 않고 -로 쓴다', () => {
    const written = bagConditionParams({
      server: '류트',
      bags: [],
      targets: [
        { color: '#abcdef', excluded: true },
        DEFAULT_TARGETS[1],
        DEFAULT_TARGETS[2],
      ],
    });

    expect(written.a).toBe('-');
  });
});
