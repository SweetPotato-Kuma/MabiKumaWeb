import { describe, expect, it } from 'vitest';
import type { PassServerResult } from './api';
import { buildPassRanking, passNamesOf, shortPassName, summarizeRanking } from './ranking';

const FOREST = '마그 멜 미션 통행증 - 사계의 숲(어려움)';
const LAND = '마그 멜 미션 통행증 - 역동의 대지(어려움)';

function gold(name: string, price: number | null) {
  return { n: name, p: price, t: '골드' };
}

// 2026-09-24 에 실제로 본 값의 모양을 줄여 옮겼다.
const RESULTS: PassServerResult[] = [
  {
    server: '류트',
    nextUpdate: null,
    channels: [
      { channel: 1, passes: [gold(FOREST, 500000), gold(LAND, 500000)] },
      { channel: 14, passes: [gold(FOREST, 200000), gold(LAND, 200000)] },
      { channel: 26, passes: [gold(FOREST, 100000), gold(LAND, 100000)] },
      { channel: 3, error: 500 },
    ],
  },
  {
    server: '하프',
    nextUpdate: null,
    channels: [
      { channel: 9, passes: [gold(FOREST, 400000), gold(LAND, 300000)] },
      { channel: 2, passes: [gold(FOREST, 100000), gold(LAND, 450000)] },
    ],
  },
  {
    server: '만돌린',
    nextUpdate: null,
    channels: [{ channel: 4, passes: [gold(FOREST, 200000), gold(LAND, 200000)] }],
  },
];

describe('buildPassRanking', () => {
  it('채널마다 가장 싼 통행증 값으로 싼 순서대로 늘어놓는다', () => {
    const rows = buildPassRanking(RESULTS, { server: null, passName: null });
    expect(rows.map((row) => `${row.server}${row.channel}:${row.price}`)).toEqual([
      '류트26:100000',
      '하프2:100000',
      '류트14:200000',
      '만돌린4:200000',
      '하프9:300000',
      '류트1:500000',
    ]);
  });

  it('값이 같으면 같은 순위를 주고 다음 순위는 건너뛴다', () => {
    const rows = buildPassRanking(RESULTS, { server: null, passName: null });
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3, 3, 5, 6]);
  });

  it('그 값에 파는 통행증 이름을 모두 붙인다', () => {
    const rows = buildPassRanking(RESULTS, { server: null, passName: null });
    expect(rows[0].passNames).toEqual([FOREST, LAND]);
    expect(rows[1].passNames).toEqual([FOREST]);
  });

  it('통행증을 고르면 그 통행증 값으로 줄을 세운다', () => {
    const rows = buildPassRanking(RESULTS, { server: null, passName: LAND });
    expect(rows.map((row) => `${row.server}${row.channel}:${row.price}`)).toEqual([
      '류트26:100000',
      '류트14:200000',
      '만돌린4:200000',
      '하프9:300000',
      '하프2:450000',
      '류트1:500000',
    ]);
  });

  it('서버를 고르면 그 서버만 남기고 순위도 그 안에서 매긴다', () => {
    const rows = buildPassRanking(RESULTS, { server: '하프', passName: null });
    expect(rows.map((row) => [row.channel, row.rank])).toEqual([
      [2, 1],
      [9, 2],
    ]);
  });

  it('받지 못한 채널과 값이 없는 통행증은 뺀다', () => {
    const rows = buildPassRanking(
      [
        {
          server: '울프',
          nextUpdate: null,
          channels: [
            { channel: 1, passes: [gold(FOREST, null)] },
            { channel: 2, error: 0 },
          ],
        },
      ],
      { server: null, passName: null },
    );
    expect(rows).toEqual([]);
  });

  it('골드가 아닌 값은 숫자가 작아도 골드 뒤로 보낸다', () => {
    const rows = buildPassRanking(
      [
        {
          server: '울프',
          nextUpdate: null,
          channels: [
            { channel: 1, passes: [{ n: FOREST, p: 10, t: '금박 솔방울' }] },
            { channel: 2, passes: [gold(FOREST, 500000)] },
          ],
        },
      ],
      { server: null, passName: null },
    );
    expect(rows.map((row) => row.channel)).toEqual([2, 1]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
  });
});

describe('summarizeRanking', () => {
  it('최저가 채널과 가장 흔한 값을 알려 준다', () => {
    const summary = summarizeRanking(buildPassRanking(RESULTS, { server: null, passName: null }));
    expect(summary.lowest.map((row) => row.key)).toEqual(['류트|26', '하프|2']);
    expect(summary.common).toEqual({ price: 100000, priceType: '골드', count: 2 });
  });

  it('빈 목록이면 비어 있다', () => {
    expect(summarizeRanking([])).toEqual({ lowest: [], common: null });
  });
});

describe('passNamesOf', () => {
  it('받은 결과에 나온 이름을 한 번씩만 모은다', () => {
    expect(passNamesOf(RESULTS)).toEqual([FOREST, LAND]);
  });
});

describe('shortPassName', () => {
  it('앞머리를 떼고 던전 이름만 남긴다', () => {
    expect(shortPassName(FOREST)).toBe('사계의 숲(어려움)');
  });

  it('모양이 다르면 그대로 둔다', () => {
    expect(shortPassName('마그 멜 통행증')).toBe('마그 멜 통행증');
  });
});
