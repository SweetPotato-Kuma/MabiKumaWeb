import { describe, expect, it } from 'vitest';
import { emptyColorChannels, type ColorChannel } from '@/features/colorChannels';
import { bagConditionParams, emptyParts, hasBagConditions, readBagConditions } from './searchParams';

const params = (query: string) => new URLSearchParams(query);

const range = (min: number | null, max: number | null): ColorChannel => ({
  similar: false,
  min,
  max,
  base: null,
  percent: 10,
});
const near = (base: number, percent: number): ColorChannel => ({
  similar: true,
  min: null,
  max: null,
  base,
  percent,
});

/** 주소에 쓸 값을 쿼리스트링으로 만든다. 화면이 쓰는 방식과 같다. */
function toQuery(written: Record<string, string | string[] | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(written)) {
    for (const each of Array.isArray(value) ? value : [value]) if (each) query.append(key, each);
  }
  return query;
}

describe('주머니 찾기 주소', () => {
  it('아무것도 없으면 기본 조건이고, 값이 미리 들어 있지 않다', () => {
    expect(readBagConditions(params(''))).toEqual({ server: '류트', bags: [], parts: emptyParts() });
    expect(hasBagConditions(params(''))).toBe(false);
  });

  it('서버와 주머니를 읽는다', () => {
    const conditions = readBagConditions(params('server=하프&bag=group:herb&bag=튼튼한 골드 허브 주머니'));

    expect(conditions.server).toBe('하프');
    expect(conditions.bags).toEqual(['group:herb', '튼튼한 골드 허브 주머니']);
    expect(hasBagConditions(params('server=하프'))).toBe(true);
  });

  it('낯선 값은 기본으로 돌린다', () => {
    const conditions = readBagConditions(
      params('server=없는서버&bag=group:nothing&bag=' + 'x'.repeat(100)),
    );

    expect(conditions.server).toBe('류트');
    expect(conditions.bags).toEqual([]);
  });

  it('같은 칸을 두 번 적어도 한 번만 받는다', () => {
    expect(readBagConditions(params('bag=가&bag=가')).bags).toEqual(['가']);
  });

  it('기본 조건이면 주소에 아무것도 쓰지 않는다', () => {
    expect(bagConditionParams({ server: '류트', bags: [], parts: emptyParts() })).toEqual({
      server: null,
      bag: [],
      a: null,
      b: null,
      c: null,
    });
  });

  it('바뀐 서버와 주머니만 주소에 쓰고, 읽으면 그대로 돌아온다', () => {
    const conditions = { server: '울프', bags: ['group:leather'], parts: emptyParts() };

    expect(bagConditionParams(conditions)).toMatchObject({ server: '울프', bag: ['group:leather'] });
    expect(readBagConditions(toQuery(bagConditionParams(conditions)))).toEqual(conditions);
  });

  describe('파트별 채널 조건', () => {
    it('범위와 유사도를 읽는다', () => {
      const { parts } = readBagConditions(params('a=r100-200,g120p15,b-50&c=r-'));

      expect(parts[0].r).toEqual(range(100, 200));
      expect(parts[0].g).toEqual(near(120, 15));
      expect(parts[0].b).toEqual(range(null, 50));
      // 양쪽이 빈 범위는 건 것이 아니다.
      expect(parts[2].r).toEqual(range(null, null));
      expect(hasBagConditions(params('b=r10-20'))).toBe(true);
    });

    it('범위를 벗어나거나 엇갈린 값은 바로잡고, 알아볼 수 없는 조각은 버린다', () => {
      const { parts } = readBagConditions(params('a=r5p200,g200-100,bxyz&c=r300-999'));

      expect(parts[0].r).toEqual(near(5, 100));
      expect(parts[0].g).toEqual(range(100, 200));
      expect(parts[0].b).toEqual(range(null, null));
      expect(parts[2].r).toEqual(range(255, 255));
    });

    it('예전 링크의 색 글자(16진수)는 조건으로 읽지 않는다', () => {
      const { parts } = readBagConditions(params('a=ff0000&b=-'));

      expect(parts).toEqual(emptyParts());
    });

    it('건 채널만 주소에 쓰고, 읽으면 그대로 돌아온다', () => {
      const parts = [
        { ...emptyColorChannels(), r: range(100, 200), g: near(120, 15) },
        emptyColorChannels(),
        { ...emptyColorChannels(), b: range(null, 50) },
      ];
      const written = bagConditionParams({ server: '류트', bags: [], parts });

      expect(written.a).toBe('r100-200,g120p15');
      expect(written.b).toBeNull();
      expect(written.c).toBe('b-50');
      expect(readBagConditions(toQuery(written)).parts).toEqual(parts);
    });
  });
});
