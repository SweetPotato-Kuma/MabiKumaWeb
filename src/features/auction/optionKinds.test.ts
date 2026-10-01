import { describe, expect, it } from 'vitest';
import { groupKeyOf } from './categoryTree';
import { offeredKinds } from './optionKinds';

describe('카테고리별로 둘 상세 옵션', () => {
  it('카테고리를 고르지 않았으면 모두 둔다. 유물이 맨 앞이다', () => {
    expect(offeredKinds('')).toEqual(['relic', 'reforge', 'enchant', 'special', 'erg', 'color', 'pet']);
  });

  it('장비 카테고리에는 장비 옵션 다섯 가지만 둔다', () => {
    expect(offeredKinds('검')).toEqual(['reforge', 'enchant', 'special', 'erg', 'color']);
  });

  it('유물은 무리아스 유물 옵션만 둔다. 세공은 붙지 않는다', () => {
    expect(offeredKinds('유물')).toEqual(['relic']);
  });

  it('분양 메달에는 펫 정보만 둔다', () => {
    expect(offeredKinds('분양 메달')).toEqual(['pet']);
  });

  it('장비가 아닌 카테고리에는 아무것도 두지 않는다', () => {
    expect(offeredKinds('포션')).toEqual([]);
    expect(offeredKinds('도면')).toEqual([]);
  });

  it('묶음은 하위 카테고리에 붙는 종류를 모두 둔다', () => {
    expect(offeredKinds(groupKeyOf('특수 장비'))).toEqual(['relic', 'reforge', 'enchant', 'special', 'erg', 'color']);
    expect(offeredKinds(groupKeyOf('기타'))).toEqual(['pet']);
    expect(offeredKinds(groupKeyOf('소모품'))).toEqual([]);
  });

  it('불러온 매물에 있는 옵션과 이미 건 조건은 카테고리와 상관없이 남긴다', () => {
    expect(offeredKinds('포션', ['color'])).toEqual(['color']);
    expect(offeredKinds('유물', [], ['reforge'])).toEqual(['relic', 'reforge']);
  });
});
