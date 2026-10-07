import { describe, expect, it } from 'vitest';
import { parseFilter } from './filterUrl';
import { groupPetSpecies, petSpeciesAuctionPath, UNKNOWN_SPECIES } from './petSpecies';
import type { AuctionHistoryItem, AuctionItem } from './types';

const NAME = '동물 캐릭터 분양 메달';

const pet = (species: string | null) =>
  species === null
    ? []
    : [{ option_type: '펫 정보', option_sub_type: '종족명', option_value: species }];

const listing = (species: string | null, price: number): AuctionItem => ({
  item_name: NAME,
  item_display_name: NAME,
  item_count: 1,
  auction_item_category: '분양 메달',
  auction_price_per_unit: price,
  date_auction_expire: '2026-10-09T00:00:00.000Z',
  item_option: pet(species),
});

const trade = (species: string, price: number, at: string): AuctionHistoryItem => ({
  item_name: NAME,
  item_display_name: NAME,
  item_count: 1,
  auction_item_category: '분양 메달',
  auction_price_per_unit: price,
  date_auction_buy: at,
  auction_buy_id: at,
  item_option: pet(species),
});

describe('분양 메달 종족별 묶기', () => {
  it('종족마다 매물 수와 가장 싼 값, 가장 최근 거래를 모은다', () => {
    const rows = groupPetSpecies(
      [listing('미르', 30_000_000), listing('미르', 25_000_000), listing('젖소', 41_000_000)],
      [
        trade('미르', 27_000_000, '2026-10-06T10:00:00.000Z'),
        trade('미르', 29_000_000, '2026-10-07T10:00:00.000Z'),
        trade('피닉스', 90_000_000, '2026-10-05T10:00:00.000Z'),
      ],
    );
    expect(rows.map((row) => row.species)).toEqual(['미르', '젖소', '피닉스']);
    expect(rows[0]).toEqual({
      species: '미르',
      listings: 2,
      lowest: 25_000_000,
      lastTrade: { price: 29_000_000, at: '2026-10-07T10:00:00.000Z' },
      trades: 2,
    });
    // 매물 없이 거래만 있는 종족도 줄이 있다.
    expect(rows[2]).toMatchObject({ listings: 0, lowest: null, trades: 1 });
  });

  it('종족명이 빠진 매물은 따로 한 줄로 모은다', () => {
    expect(groupPetSpecies([listing(null, 1)], [])[0].species).toBe(UNKNOWN_SPECIES);
  });

  it('종족을 누르면 그 종족명 조건을 건 경매장 검색으로 간다', () => {
    const url = new URL(petSpeciesAuctionPath(NAME, '미르'), 'https://example.com');
    expect(url.pathname).toBe('/auction');
    expect(url.searchParams.get('keyword')).toBe(NAME);
    expect(url.searchParams.get('category')).toBe('분양 메달');
    expect(parseFilter(url.searchParams.get('f')).conditions[0]).toMatchObject({
      kind: 'pet',
      field: '종족명',
      text: '미르',
    });
    expect(
      new URL(petSpeciesAuctionPath(NAME, UNKNOWN_SPECIES), 'https://example.com').searchParams.has(
        'f',
      ),
    ).toBe(false);
  });
});
