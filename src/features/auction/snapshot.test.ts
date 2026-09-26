import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_MAX_AGE_MS,
  decodeSnapshotItems,
  snapshotAgeLabel,
  snapshotFilesFor,
  type SnapshotFile,
  type SnapshotManifest,
} from './snapshot';

const NOW = Date.parse('2026-09-26T08:00:00Z');

describe('모아 둔 매물 되돌리기', () => {
  it('워커가 줄인 모양을 넥슨 API 응답 모양으로 되돌린다', () => {
    const file: SnapshotFile = {
      category: '모자/가발',
      at: NOW,
      items: [
        [
          0,
          '빛나는 클로버 모자',
          1,
          4650000000,
          Date.parse('2026-09-28T17:00:00.000Z') / 1000,
          [['세공 옵션', null, '랜스 차지 쿨타임 감소(7레벨:1초 감소)'], ['아이템 색상', '파트 A', '128,128,128']],
        ],
        ['써클릿', '축복받은 써클릿', 2, 10, Date.parse('2026-09-27T00:00:00.000Z') / 1000, []],
      ],
    };

    expect(decodeSnapshotItems(file)).toEqual([
      {
        item_name: '빛나는 클로버 모자',
        item_display_name: '빛나는 클로버 모자',
        item_count: 1,
        auction_item_category: '모자/가발',
        auction_price_per_unit: 4650000000,
        date_auction_expire: '2026-09-28T17:00:00.000Z',
        item_option: [
          { option_type: '세공 옵션', option_value: '랜스 차지 쿨타임 감소(7레벨:1초 감소)' },
          { option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '128,128,128' },
        ],
      },
      {
        item_name: '써클릿',
        item_display_name: '축복받은 써클릿',
        item_count: 2,
        auction_item_category: '모자/가발',
        auction_price_per_unit: 10,
        date_auction_expire: '2026-09-27T00:00:00.000Z',
        item_option: [],
      },
    ]);
  });
});

describe('받을 파일 고르기', () => {
  const manifest: SnapshotManifest = {
    at: NOW,
    base: 'https://icons.test',
    categories: {
      '모자/가발': { file: 'auction/a/1.js', at: NOW - 60_000, count: 3 },
      검: { file: 'auction/a/2.js', at: NOW - 120_000, count: 5 },
      천옷: { file: 'auction/old/3.js', at: NOW - SNAPSHOT_MAX_AGE_MS - 1, count: 5 },
    },
  };

  it('카테고리마다 파일 주소와 모은 시각을 준다', () => {
    expect(snapshotFilesFor(manifest, ['모자/가발', '검'], NOW)).toEqual([
      { category: '모자/가발', url: 'https://icons.test/auction/a/1.js', at: NOW - 60_000 },
      { category: '검', url: 'https://icons.test/auction/a/2.js', at: NOW - 120_000 },
    ]);
  });

  it('하나라도 없거나 너무 묵었으면 실시간으로 받게 null 을 준다', () => {
    expect(snapshotFilesFor(manifest, ['모자/가발', '활'], NOW)).toBeNull();
    expect(snapshotFilesFor(manifest, ['모자/가발', '천옷'], NOW)).toBeNull();
    expect(snapshotFilesFor(null, ['모자/가발'], NOW)).toBeNull();
    expect(snapshotFilesFor(manifest, [], NOW)).toBeNull();
  });
});

describe('모은 시각 문구', () => {
  it('1분이 안 되면 방금, 그 뒤는 분으로 적는다', () => {
    expect(snapshotAgeLabel(NOW - 30_000, NOW)).toBe('방금');
    expect(snapshotAgeLabel(NOW - 7 * 60_000 - 5_000, NOW)).toBe('7분 전에');
  });
});
