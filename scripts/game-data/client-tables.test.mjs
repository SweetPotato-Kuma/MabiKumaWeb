import { describe, expect, it } from 'vitest';
import { compileItemFilter } from './item-filter.mjs';
import { parseUpgradeEffect, racesOfItem, textKey } from './client-tables.mjs';
import { parseOddsHtml, parseOddsList } from './artisan-odds.mjs';

describe('compileItemFilter', () => {
  it('& 가 | 보다 먼저 묶인다', () => {
    const match = compileItemFilter('*/equip/head/*|*/equip/*&*/foot/*');
    expect(match('/equip/head/hat/')).toBe(true);
    expect(match('/equip/foot/shoes/')).toBe(true);
    expect(match('/equip/righthand/weapon/blade/')).toBe(false);
  });

  it('! 와 괄호를 푼다', () => {
    const match = compileItemFilter('(*/bow/*|*/bow01/*)&!*/crossbow/*');
    expect(match('/equip/righthand/weapon/bow01/Short_Bow/')).toBe(true);
    expect(match('/equip/righthand/weapon/bow/crossbow/')).toBe(false);
  });

  it('빈 필터는 없는 것이다', () => {
    expect(compileItemFilter('')).toBeNull();
  });
});

describe('parseUpgradeEffect', () => {
  it('값, 폭, 추가 값, 장인 개조 번호를 읽는다', () => {
    expect(
      parseUpgradeEffect(
        'luckyupgrade(21);modify(durability_max, -(4~6));modify(chain_casting, 30101, 2);use_optionset(5);personalize()',
      ),
    ).toEqual({
      ModifyStats: [
        { Name: 'durability_max', Min: -6, Max: -4 },
        { Name: 'chain_casting', Min: 30101, Max: 30101, Extra: 2 },
      ],
      OptionSetIds: [5],
      LuckyUpgradeId: 21,
      Personalize: true,
    });
  });
});

describe('racesOfItem', () => {
  const races = (json) => [...racesOfItem(json)].sort();

  it('필터가 없거나 성별만 적었으면 모든 종족이다', () => {
    expect(races({})).toEqual(['elf', 'giant', 'human']);
    expect(races({ Attr_RaceFilter: '/female/' })).toEqual(['elf', 'giant', 'human']);
  });

  it('갈래마다 적은 종족을 모은다', () => {
    expect(races({ Attr_RaceFilter: '/human/female/ | /elf/female/' })).toEqual(['elf', 'human']);
  });

  it('카테고리의 종족 제한은 보지 않는다', () => {
    expect(races({ Category: '/equip/armor/human_elf_only/' })).toEqual(['elf', 'giant', 'human']);
  });

  it('파트너용 필터는 아무 종족도 아니다', () => {
    expect(races({ Attr_RaceFilter: '/human_pet/' })).toEqual([]);
  });
});

describe('textKey', () => {
  it('문자열 열쇠에서 xml. 을 뗀다', () => {
    expect(textKey('_LT[xml.itemupgradedb.15]')).toBe('itemupgradedb.15');
    expect(textKey('그냥 글')).toBe('');
  });
});

describe('공식 장인 개조 확률 페이지', () => {
  it('목록의 이름은 받은 바이트를 그대로 퍼센트 인코딩한다', () => {
    const bytes = Buffer.concat([
      Buffer.from('<div class="o" data-depth2="', 'latin1'),
      Buffer.from([0xba, 0xa3, 0x20]),
      Buffer.from('" onclick="optionClick(this)" data="7">', 'latin1'),
    ]);
    expect(parseOddsList(bytes).get(7)).toBe('%BA%A3%20');
  });

  it('개수 표와 옵션 표를 읽고 고정 효과 줄은 뺀다', () => {
    const html = [
      '<h4 class="ew_title">장인 개조 <small>옵션 개수 출현 확률</small></h4>',
      '<table class="prod_table"><tr><td>2</td><td>40%</td></tr><tr><td>3</td><td>60%</td></tr></table>',
      '<h4 class="ew_title">장인 개조 <small>옵션 선택 확률</small></h4>',
      '<table class="prod_table"><tr><td>A</td><td>14.2857%</td></tr><tr><td>B</td><td>고정 효과</td></tr></table>',
    ].join('');
    const detail = parseOddsHtml(html);
    expect(detail.counts).toEqual([
      [2, 40],
      [3, 60],
    ]);
    expect(detail.options).toEqual([['A', 14.2857]]);
  });
});
