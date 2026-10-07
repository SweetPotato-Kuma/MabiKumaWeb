import { serializeFilter } from './filterUrl';
import { PET_CATEGORY, PET_OPTION_TYPE, PET_SPECIES_FIELD } from './optionFilter';
import type { AuctionHistoryItem, AuctionItem, ItemOption } from './types';

/**
 * 분양 메달을 종족별로 묶는다. 넥슨은 메달 이름을 모두 "동물 캐릭터 분양 메달" 로 주고 어떤 펫이 담겼는지는
 * 펫 정보 옵션의 종족명으로만 알려 준다. 같은 이름 안에서 종족마다 값이 천차만별이라 종족으로 갈라 본다.
 */

/** 종족 한 줄. 매물이나 거래 어느 한쪽만 있을 수도 있다. */
export interface PetSpeciesRow {
  species: string;
  /** 지금 올라와 있는 매물 수. */
  listings: number;
  /** 매물 가운데 가장 싼 값. 매물이 없으면 null. */
  lowest: number | null;
  /** 불러온 거래 가운데 가장 최근 거래. */
  lastTrade: { price: number; at: string } | null;
  /** 불러온 거래 가운데 이 종족의 거래 수. */
  trades: number;
}

/** 종족명이 없는 메달(옵션이 빠진 매물). 한 줄로 모아 숨기지 않는다. */
export const UNKNOWN_SPECIES = '종족 정보 없음';

export function speciesOf(options: readonly ItemOption[] | undefined): string {
  const option = (options ?? []).find(
    (each) => each.option_type === PET_OPTION_TYPE && each.option_sub_type === PET_SPECIES_FIELD,
  );
  return option?.option_value?.trim() || UNKNOWN_SPECIES;
}

/** 매물과 거래를 종족별로 합친다. 순서는 매물이 많은 순, 같으면 이름순. */
export function groupPetSpecies(
  listings: readonly AuctionItem[],
  trades: readonly AuctionHistoryItem[],
): PetSpeciesRow[] {
  const rows = new Map<string, PetSpeciesRow>();
  const rowOf = (species: string) => {
    let row = rows.get(species);
    if (!row) {
      row = { species, listings: 0, lowest: null, lastTrade: null, trades: 0 };
      rows.set(species, row);
    }
    return row;
  };
  for (const item of listings) {
    const row = rowOf(speciesOf(item.item_option));
    row.listings += 1;
    row.lowest =
      row.lowest === null
        ? item.auction_price_per_unit
        : Math.min(row.lowest, item.auction_price_per_unit);
  }
  for (const trade of trades) {
    const row = rowOf(speciesOf(trade.item_option));
    row.trades += 1;
    if (!row.lastTrade || trade.date_auction_buy > row.lastTrade.at)
      row.lastTrade = { price: trade.auction_price_per_unit, at: trade.date_auction_buy };
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.listings - a.listings || b.trades - a.trades || a.species.localeCompare(b.species, 'ko'),
  );
}

/** 그 종족의 매물만 거른 경매장 주소. 종족명 조건은 글자가 들어 있으면 맞는다. */
export function petSpeciesAuctionPath(name: string, species: string): string {
  const params = new URLSearchParams({ keyword: name, category: PET_CATEGORY });
  if (species !== UNKNOWN_SPECIES)
    params.set(
      'f',
      serializeFilter({
        conditions: [{ id: 0, kind: 'pet', field: PET_SPECIES_FIELD, text: species, min: null }],
      }),
    );
  return `/auction?${params}`;
}
