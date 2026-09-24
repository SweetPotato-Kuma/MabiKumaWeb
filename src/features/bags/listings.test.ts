import { describe, expect, it } from 'vitest';
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
          { n: '튼튼한 고급 실크 주머니', c: ['b79686', '577abc', '829ab3'], p: 500000, t: '두카트' },
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
        bags: [{ n: '튼튼한 고급 실크 주머니', c: ['eed623', 'e2a5b5', 'ffffff'], p: 500000, t: '두카트' }],
      },
    ],
  },
];

describe('buildListings', () => {
  it('색을 고르지 않으면 채널 순으로 모두 펼친다. 받지 못한 NPC 는 건너뛴다', () => {
    const rows = buildListings(channels, { bagName: '', color: null, part: 'any' });
    expect(rows.map((row) => `${row.channel} ${row.name}`)).toEqual([
      '1 튼튼한 고급 실크 주머니',
      '1 튼튼한 밀 주머니',
      '2 튼튼한 고급 실크 주머니',
    ]);
    expect(rows.every((row) => row.score === null)).toBe(true);
  });

  it('주머니 이름으로 거른다', () => {
    const rows = buildListings(channels, { bagName: '튼튼한 고급 실크 주머니', color: null, part: 'any' });
    expect(rows).toHaveLength(2);
  });

  it('아무 파트나 볼 때는 가장 가까운 파트로 비교하고, 가까운 순으로 둔다', () => {
    const rows = buildListings(channels, { bagName: '튼튼한 고급 실크 주머니', color: '#ffffff', part: 'any' });
    // 2채널 주머니는 파트 C 가 흰색이라 맨 위에 온다.
    expect(rows[0]).toMatchObject({ channel: 2, score: 100, matchedPart: 2 });
    expect(rows[1].score).toBeLessThan(100);
  });

  it('파트를 정하면 그 파트만 비교한다', () => {
    const rows = buildListings(channels, { bagName: '', color: '#ffffff', part: 0 });
    // 파트 A 가 흰색인 것은 밀 주머니뿐이다.
    expect(rows[0]).toMatchObject({ name: '튼튼한 밀 주머니', score: 100, matchedPart: 0 });
  });
});

describe('bagNamesOf', () => {
  it('나온 이름을 한 번씩 가나다순으로', () => {
    expect(bagNamesOf(channels)).toEqual(['튼튼한 고급 실크 주머니', '튼튼한 밀 주머니']);
  });
});
