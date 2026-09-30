import { describe, expect, it } from 'vitest';
import { emptyColorChannels } from '@/features/colorChannels';
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
      { color: '#ff0000', excluded: false, channels: emptyColorChannels() },
      { color: '#00ff00', excluded: false, channels: emptyColorChannels() },
      { color: '#ffffff', excluded: true, channels: emptyColorChannels() },
    ]);
    expect(hasBagConditions(params('server=하프'))).toBe(true);
  });

  it('파트를 검색에서 빼려면 -를 쓴다', () => {
    expect(readBagConditions(params('a=-')).targets[0]).toMatchObject({ color: '#ffffff', excluded: true });
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
      af: null,
      bf: null,
      cf: null,
    });
  });

  it('바뀐 조건만 주소에 쓰고, 읽으면 그대로 돌아온다', () => {
    const conditions = {
      server: '울프',
      bags: ['group:leather'],
      targets: [
        { color: '#123456', excluded: false, channels: emptyColorChannels() },
        { color: '#ffffff', excluded: false, channels: emptyColorChannels() },
        { color: '#ffffff', excluded: true, channels: emptyColorChannels() },
      ],
    };
    const written = bagConditionParams(conditions);

    expect(written).toEqual({
      server: '울프',
      bag: ['group:leather'],
      a: '123456',
      b: 'ffffff',
      c: null,
      af: null,
      bf: null,
      cf: null,
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
        { color: '#abcdef', excluded: true, channels: emptyColorChannels() },
        DEFAULT_TARGETS[1],
        DEFAULT_TARGETS[2],
      ],
    });

    expect(written.a).toBe('-');
  });

  describe('파트별 채널 조건', () => {
    const range = (min: number | null, max: number | null) => ({ similar: false, min, max, base: null, percent: 10 });
    const near = (base: number, percent: number) => ({ similar: true, min: null, max: null, base, percent });

    it('범위와 유사도를 읽는다', () => {
      const { targets } = readBagConditions(params('af=r100-200,g120p15,b-50&cf=r-'));

      expect(targets[0].channels.r).toEqual(range(100, 200));
      expect(targets[0].channels.g).toEqual(near(120, 15));
      expect(targets[0].channels.b).toEqual(range(null, 50));
      // 양쪽이 빈 범위는 건 것이 아니다.
      expect(targets[2].channels.r).toEqual(range(null, null));
      expect(hasBagConditions(params('bf=r10-20'))).toBe(true);
    });

    it('범위를 벗어나거나 엇갈린 값은 바로잡고, 알아볼 수 없는 조각은 버린다', () => {
      const { targets } = readBagConditions(params('af=r5p200,g200-100,bxyz&cf=r300-999'));

      expect(targets[0].channels.r).toEqual(near(5, 100));
      expect(targets[0].channels.g).toEqual(range(100, 200));
      expect(targets[0].channels.b).toEqual(range(null, null));
      expect(targets[2].channels.r).toEqual(range(255, 255));
    });

    it('건 채널만 주소에 쓰고, 읽으면 그대로 돌아온다', () => {
      const targets = [
        { color: '#ffffff', excluded: false, channels: { ...emptyColorChannels(), r: range(100, 200), g: near(120, 15) } },
        { color: '#ffffff', excluded: true, channels: emptyColorChannels() },
        { color: '#ffffff', excluded: true, channels: { ...emptyColorChannels(), b: range(null, 50) } },
      ];
      const written = bagConditionParams({ server: '류트', bags: [], targets });

      expect(written.af).toBe('r100-200,g120p15');
      expect(written.bf).toBeNull();
      expect(written.cf).toBe('b-50');

      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(written)) {
        for (const each of Array.isArray(value) ? value : [value]) if (each) query.append(key, each);
      }
      expect(readBagConditions(query).targets).toEqual(targets);
    });
  });
});
