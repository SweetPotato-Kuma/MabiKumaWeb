import { describe, expect, it } from 'vitest';
import { emptyColorChannels, type ColorChannel, type ColorChannels } from '@/features/colorChannels';
import type { BagChannelResult } from './api';
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

const withChannels = (
  changes: Partial<Record<'r' | 'g' | 'b', Partial<ColorChannel>>>,
): ColorChannels => {
  const base = emptyColorChannels();
  return {
    r: { ...base.r, ...changes.r },
    g: { ...base.g, ...changes.g },
    b: { ...base.b, ...changes.b },
  };
};

const names = (rows: ReturnType<typeof buildListings>) =>
  rows.map((row) => `${row.channel} ${row.name}`);

describe('buildListings', () => {
  it('조건을 하나도 걸지 않으면 채널 순으로 모두 펼친다. 받지 못한 NPC 는 건너뛴다', () => {
    const rows = buildListings(channels, { bagNames: null, parts: NONE });

    expect(names(rows)).toEqual([
      '1 튼튼한 고급 실크 주머니',
      '1 튼튼한 밀 주머니',
      '2 튼튼한 고급 실크 주머니',
    ]);
    expect(rows.every((row) => row.score === null)).toBe(true);
  });

  it('채널을 하나도 걸지 않은 파트는 조건이 아니다', () => {
    const rows = buildListings(channels, {
      bagNames: null,
      parts: [emptyColorChannels(), null, emptyColorChannels()],
    });

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.comparedParts.length === 0)).toBe(true);
  });

  it('주머니 이름으로 거른다', () => {
    const rows = buildListings(channels, {
      bagNames: new Set(['튼튼한 고급 실크 주머니']),
      parts: NONE,
    });

    expect(rows).toHaveLength(2);
  });

  it('파트의 채널을 범위로 걸면 그 범위에 든 주머니만 남긴다', () => {
    // 파트 A 의 R 은 채널 1 실크 183, 채널 1 밀 255, 채널 2 실크 238 이다.
    const rows = buildListings(channels, {
      bagNames: null,
      parts: [withChannels({ r: { min: 200, max: 255 } }), null, null],
    });

    // 범위의 가운데(227.5)에 가까운 실크(238)가 밀(255)보다 앞이다.
    expect(names(rows)).toEqual(['2 튼튼한 고급 실크 주머니', '1 튼튼한 밀 주머니']);
  });

  it('한쪽 끝만 건 범위는 그쪽이 끝없다', () => {
    const rows = buildListings(channels, {
      bagNames: null,
      parts: [withChannels({ r: { min: 240 } }), null, null],
    });

    expect(names(rows)).toEqual(['1 튼튼한 밀 주머니']);
  });

  it('유사도는 기준값에서 채널 폭의 N% 안만 남긴다', () => {
    const rows = buildListings(channels, {
      bagNames: null,
      // 183 ± 5% 는 170.25~195.75 라 채널 1 실크만 든다.
      parts: [withChannels({ r: { similar: true, base: 183, percent: 5 } }), null, null],
    });

    expect(names(rows)).toEqual(['1 튼튼한 고급 실크 주머니']);
  });

  it('채널을 건 파트가 여럿이면 모두 맞아야 하고, 건 채널이 없는 파트는 거르지 않는다', () => {
    const rows = buildListings(channels, {
      bagNames: null,
      parts: [
        withChannels({ r: { min: 200, max: 255 } }),
        // 파트 B 의 G 가 0 인 것은 채널 1 밀뿐이다.
        withChannels({ g: { min: 0, max: 10 } }),
        emptyColorChannels(),
      ],
    });

    expect(names(rows)).toEqual(['1 튼튼한 밀 주머니']);
    expect(rows[0].comparedParts).toEqual([0, 1]);
  });

  it('조건에 든 것은 바라는 값에 가까운 순으로 둔다', () => {
    // R 을 240 ± 20% 로 걸면 255(밀)와 238(실크)이 다 들고, 기준에 더 가까운 실크가 먼저다.
    const rows = buildListings(channels, {
      bagNames: null,
      parts: [withChannels({ r: { similar: true, base: 240, percent: 20 } }), null, null],
    });

    expect(names(rows)).toEqual(['2 튼튼한 고급 실크 주머니', '1 튼튼한 밀 주머니']);
    expect(rows[0].score).toBeGreaterThan(rows[1].score ?? 0);
  });

  it('바라는 값과 정확히 같으면 가까운 정도가 100 이다', () => {
    const rows = buildListings(channels, {
      bagNames: null,
      parts: [withChannels({ r: { similar: true, base: 255, percent: 5 } }), null, null],
    });

    expect(rows[0]).toMatchObject({ name: '튼튼한 밀 주머니', score: 100, comparedParts: [0] });
  });

  it('조건을 건 파트의 색이 없는 주머니는 뺀다', () => {
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

    expect(
      buildListings(twoParts, {
        bagNames: null,
        parts: [null, null, withChannels({ r: { min: 0, max: 255 } })],
      }),
    ).toEqual([]);
  });
});

describe('bagNamesOf', () => {
  it('나온 이름을 한 번씩 가나다순으로', () => {
    expect(bagNamesOf(channels)).toEqual(['튼튼한 고급 실크 주머니', '튼튼한 밀 주머니']);
  });
});
