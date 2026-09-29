import { describe, expect, it } from 'vitest';
import { isListingOf, isPatternName, listingNameOf } from './listing';
import { summarizeListings } from './market';

const item = (display: string, uses?: string, name = '도면') => ({
  item_name: name,
  item_display_name: display,
  item_count: 1,
  auction_item_category: '도면',
  auction_price_per_unit: 100,
  date_auction_expire: '',
  item_option: uses === undefined ? [] : [{ option_type: '남은 사용 횟수', option_value: uses }],
});

describe('옷본과 도면 매물', () => {
  it('옷본과 도면 이름만 패턴으로 본다', () => {
    expect(isPatternName('도면 - 더스크바운드 비고러스 아머(남성용)')).toBe(true);
    expect(isPatternName('옷본 - 블리안 엔더스 인텐스 아머(여성용)')).toBe(true);
    expect(isPatternName('철괴')).toBe(false);
    expect(isPatternName('도면 조각')).toBe(false);
  });

  it('경매장에는 옷본, 도면 이름으로 묻는다', () => {
    expect(listingNameOf('도면 - 더스크바운드 비고러스 아머(남성용)')).toBe('도면');
    expect(listingNameOf('옷본 - 블리안 엔더스 인텐스 아머(여성용)')).toBe('옷본');
    expect(listingNameOf('철괴')).toBe('철괴');
  });

  it('표시 이름이 같고 사용 횟수가 가득 찬 매물만 그 아이템으로 센다', () => {
    const name = '도면 - 더스크바운드 비고러스 아머(남성용)';
    expect(isListingOf(item(name, '30'), name)).toBe(true);
    expect(isListingOf(item(name, '12'), name)).toBe(false);
    expect(isListingOf(item('도면 - 다른 아머', '30'), name)).toBe(false);
    expect(isListingOf(item('철괴', undefined, '철괴'), '철괴')).toBe(true);
    expect(isListingOf(item('강철괴', undefined, '강철괴'), '철괴')).toBe(false);
  });

  it('한 번에 받은 목록에서 이름별로 나눠 센다', () => {
    const a = '도면 - 가';
    const b = '도면 - 나';
    const list = [item(a, '30'), item(b, '30'), item(a, '5')];
    expect(summarizeListings(list, a, true).supply).toBe(1);
    expect(summarizeListings(list, b, true).supply).toBe(1);
  });
});
