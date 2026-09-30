import { describe, expect, it } from 'vitest';
import type { BagChannelResult } from './api';
import { emptyColorChannel, emptyColorChannels, type ColorChannel, type ColorChannels } from '@/features/colorChannels';
import { bagNamesOf, buildListings } from './listings';

const channels: BagChannelResult[] = [
  {
    server: '류트',
    channel: 1,
    nextUpdate: null,
    npcs: [
      {
        npc: '상인 라누',
        bags: [
          {
            n: '튼튼한 고급 실크 주머니',
            c: ['b79686', '577abc', '829ab3'],
            p: 500000,
            t: '두카트',
          },
          { n: '튼튼한 밀 주머니', c: ['ffffff', '000000', '000000'], p: 1000, t: '두카트' },
        ],
      },
      { npc: '리나', error: 500 },
    ],
  },
  {
    server: '류트',
    channel: 2,
    nextUpdate: null,
    npcs: [
      {
        npc: '상인 라누',
        bags: [
          {
            n: '튼튼한 고급 실크 주머니',
            c: ['eed623', 'e2a5b5', 'ffffff'],
            p: 500000,
            t: '두카트',
          },
        ],
      },
    ],
  },
];

const NONE = [null, null, null];

const withChannels = (changes: Partial<Record<'r' | 'g' | 'b', Partial<ColorChannel>>>): ColorChannels => {
  const base = emptyColorChannels();
  return {
    r: { ...base.r, ...changes.r },
    g: { ...base.g, ...changes.g },
    b: { ...base.b, ...changes.b },
  };
};

describe('buildListings 채널 조건', () => {
  const names = (rows: ReturnType<typeof buildListings>) =>
    rows.map((row) => `${row.channel} ${row.name}`);

  it('파트의 채널을 범위로 걸면 그 범위에 든 주머니만 남긴다', () => {
    // 파트 A 의 R 은 채널 1 실크 183, 채널 1 밀 255, 채널 2 실크 238 이다.
    const rows = buildListings(channels, {
      bagNames: null,
      targets: NONE,
      channels: [withChannels({ r: { min: 200, max: 255 } }), null, null],
    });

    expect(names(rows)).toEqual(['1 튼튼한 밀 주머니', '2 튼튼한 고급 실크 주머니']);
  });

  it('유사도는 기준값에서 채널 폭의 N% 안만 남긴다', () => {
    const rows = buildListings(channels, {
      bagNames: null,
      targets: NONE,
      // 183 ± 5% 는 170.25~195.75 라 채널 1 실크만 든다.
      channels: [withChannels({ r: { similar: true, base: 183, percent: 5 } }), null, null],
    });

    expect(names(rows)).toEqual(['1 튼튼한 고급 실크 주머니']);
  });

  it('채널을 건 파트가 여럿이면 모두 맞아야 하고, 건 채널이 없는 파트는 거르지 않는다', () => {
    const rows = buildListings(channels, {
      bagNames: null,
      targets: NONE,
      channels: [
        withChannels({ r: { min: 200, max: 255 } }),
        // 파트 B 의 G 가 0 인 것은 채널 1 밀뿐이다.
        withChannels({ g: { min: 0, max: 10 } }),
        { r: emptyColorChannel(), g: emptyColorChannel(), b: emptyColorChannel() },
      ],
    });

    expect(names(rows)).toEqual(['1 튼튼한 밀 주머니']);
  });

  it('색을 비교하는 순서는 그대로고, 조건에 맞는 것만 남는다', () => {
    const rows = buildListings(channels, {
      bagNames: null,
      targets: ['#ffffff', null, null],
      channels: [withChannels({ r: { min: 200, max: 255 } }), null, null],
    });

    // 흰색에 가까운 순이라 밀(정확히 흰색)이 먼저다.
    expect(names(rows)).toEqual(['1 튼튼한 밀 주머니', '2 튼튼한 고급 실크 주머니']);
    expect(rows[0].comparedParts).toEqual([0]);
  });

  it('채널 조건만 걸어도 그 파트를 비교한 파트로 적는다', () => {
    const rows = buildListings(channels, {
      bagNames: null,
      targets: NONE,
      channels: [null, withChannels({ b: { min: 0, max: 255 } }), null],
    });

    expect(rows.every((row) => row.comparedParts.join() === '1')).toBe(true);
  });
});

describe('buildListings', () => {
  it('모든 파트를 검색에서 빼면 채널 순으로 모두 펼친다. 받지 못한 NPC 는 건너뛴다', () => {
    const rows = buildListings(channels, { bagNames: null, targets: NONE });
    expect(rows.map((row) => `${row.channel} ${row.name}`)).toEqual([
      '1 튼튼한 고급 실크 주머니',
      '1 튼튼한 밀 주머니',
      '2 튼튼한 고급 실크 주머니',
    ]);
    expect(rows.every((row) => row.score === null)).toBe(true);
  });

  it('주머니 이름으로 거른다', () => {
    const rows = buildListings(channels, {
      bagNames: new Set(['튼튼한 고급 실크 주머니']),
      targets: NONE,
    });
    expect(rows).toHaveLength(2);
  });

  it('정한 파트만 비교하고, 가까운 순으로 둔다', () => {
    // 파트 A 만 흰색으로 정한다. 파트 A 가 흰색인 것은 밀 주머니뿐이다.
    const rows = buildListings(channels, { bagNames: null, targets: ['#ffffff', null, null] });
    expect(rows[0]).toMatchObject({ name: '튼튼한 밀 주머니', score: 100, comparedParts: [0] });
    expect(rows[1].score).toBeLessThan(100);
  });

  it('여러 파트를 정하면 비슷한 정도의 평균으로 줄을 세운다', () => {
    // 2채널 실크는 파트 C 가 흰색이지만 A 는 노랑이라, A 와 C 를 함께 흰색으로 정하면 100 이 아니다.
    const rows = buildListings(channels, {
      bagNames: new Set(['튼튼한 고급 실크 주머니']),
      targets: ['#ffffff', null, '#ffffff'],
    });
    const second = rows.find((row) => row.channel === 2)!;
    expect(second.score).toBeLessThan(100);
    expect(second.score).toBeGreaterThan(50);
    expect(second.comparedParts).toEqual([0, 2]);
  });

  it('정한 파트가 없는 주머니는 뺀다', () => {
    const twoParts: BagChannelResult[] = [
      {
        server: '류트',
        channel: 3,
        nextUpdate: null,
        npcs: [
          {
            npc: '켄',
            bags: [{ n: '튼튼한 달걀 주머니', c: ['ffffff', '000000'], p: 1, t: '두카트' }],
          },
        ],
      },
    ];
    expect(buildListings(twoParts, { bagNames: null, targets: [null, null, '#ffffff'] })).toEqual(
      [],
    );
  });
});

describe('bagNamesOf', () => {
  it('나온 이름을 한 번씩 가나다순으로', () => {
    expect(bagNamesOf(channels)).toEqual(['튼튼한 고급 실크 주머니', '튼튼한 밀 주머니']);
  });
});
