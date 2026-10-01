import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findScrollVariants,
  scrollsFromSource,
  selectionScrollFor,
  selectionSourceOf,
  isEnchantScrollName,
  parseEnchantKind,
  parseScrollName,
  sortVariants,
  type ScrollFile,
} from './scrolls';

const file = JSON.parse(
  readFileSync(resolve(__dirname, '../../../public/data/enchant-scrolls.json'), 'utf8'),
) as ScrollFile;

describe('인챈트 스크롤 이름', () => {
  it('인챈트 스크롤 카테고리의 "스크롤 - 인챈트" 모양만 사양을 가질 수 있다', () => {
    expect(isEnchantScrollName('인챈트 스크롤 - 올빼미')).toBe(true);
    expect(isEnchantScrollName('전용 인챈트 스크롤 - 올빼미')).toBe(true);
    expect(isEnchantScrollName('인챈트 스크롤')).toBe(false);
    expect(isEnchantScrollName('개방된 전용 인챈트 스크롤 - 올빼미')).toBe(true);
    expect(isEnchantScrollName('인챈트 능력 상승의 스크롤')).toBe(false);
  });

  it('접두가 먼저, 같은 쪽은 높은 랭크가 먼저다', () => {
    const sorted = sortVariants([
      { slot: 1, level: 7, desc: [] },
      { slot: 0, level: 6, desc: [] },
      { slot: 1, level: 12, desc: [] },
    ]);
    expect(sorted.map((variant) => [variant.slot, variant.level])).toEqual([
      [0, 6],
      [1, 12],
      [1, 7],
    ]);
  });
});

describe('인챈트 스크롤 사양 찾기', () => {
  const sample: ScrollFile = {
    scrolls: {
      '인챈트 스크롤 - 나비': [{ slot: 1, level: 6, desc: ['마나실드 사용 중일 때 최대대미지 7~12 증가'], alt: '버터플라이' }],
      '전용 인챈트 스크롤 - 나비': [{ slot: 1, level: 6, desc: ['마나실드 사용 중일 때 최대대미지 7~12 증가'], alt: '버터플라이' }],
      '인챈트 스크롤 - 올빼미': [
        { slot: 0, level: 8, desc: ['최대대미지 10 증가'] },
        { slot: 1, level: 7, desc: ['마법 공격력 3 증가'] },
      ],
    },
  };

  it('앞에 말이 붙은 스크롤 이름에서 인챈트 이름을 뗀다', () => {
    expect(parseScrollName('개방된 전용 인챈트 스크롤 - 나비')).toEqual({
      base: '개방된 전용 인챈트 스크롤',
      enchant: '나비',
    });
    expect(parseScrollName('인챈트 스크롤')).toBeNull();
  });

  it('두 번째 이름으로도 첫 번째 이름으로도 같은 인챈트를 찾는다', () => {
    expect(findScrollVariants(sample, '나비')).toHaveLength(1);
    expect(findScrollVariants(sample, '버터플라이')).toEqual(findScrollVariants(sample, '나비'));
    expect(findScrollVariants(sample, '없는 이름')).toEqual([]);
  });

  it('일반 스크롤과 전용 스크롤에 같은 사양이 있어도 하나만 돌려준다', () => {
    expect(findScrollVariants(sample, '나비')).toHaveLength(1);
  });

  it('접두/접미와 랭크를 주면 맞는 사양만, 맞는 것이 없으면 이름이 같은 사양 전부를 돌려준다', () => {
    expect(findScrollVariants(sample, '올빼미', { slot: 1, level: 7 })).toEqual([sample.scrolls['인챈트 스크롤 - 올빼미'][1]]);
    expect(findScrollVariants(sample, '올빼미', { slot: 1, level: 12 })).toHaveLength(2);
  });

  it('경매장 옵션에서 인챈트 이름과 접두/접미, 랭크를 읽는다', () => {
    expect(parseEnchantKind('접미', '다크호스 (랭크 8)')).toEqual({ enchant: '다크호스', slot: 1, level: 8 });
    expect(parseEnchantKind('접두', '나비 (랭크 A)')).toEqual({ enchant: '나비', slot: 0, level: 6 });
    expect(parseEnchantKind('접미', '강철 바늘 (랭크 F)')).toEqual({ enchant: '강철 바늘', slot: 1, level: 1 });
    expect(parseEnchantKind(null, '나비 (랭크 A)')).toBeNull();
    expect(parseEnchantKind('접미', '나비')).toBeNull();
  });
});

describe('선택 스크롤과의 관계', () => {
  const sample: ScrollFile = {
    scrolls: {
      '전용 인챈트 스크롤 - 망집': [{ slot: 1, level: 10, desc: ['최대 대미지 20 증가'], src: ['탈라 가흐'] }],
      '전용 인챈트 스크롤 - 감싸는': [{ slot: 0, level: 10, desc: ['방어 5 증가'], src: ['탈라 가흐'] }],
      '인챈트 스크롤 - 올빼미': [{ slot: 1, level: 8, desc: ['최대대미지 10 증가'], src: ['브리 레흐'] }],
    },
  };

  it('선택 스크롤 이름에서 나오는 곳을, 사양에서 선택 스크롤 이름을 찾는다', () => {
    expect(selectionSourceOf('탈라 가흐 인챈트 선택 스크롤')).toBe('탈라 가흐');
    expect(selectionSourceOf('인챈트 스크롤')).toBeNull();
    expect(selectionScrollFor(sample.scrolls['전용 인챈트 스크롤 - 망집'][0])).toBe('탈라 가흐 인챈트 선택 스크롤');
    expect(selectionScrollFor(sample.scrolls['인챈트 스크롤 - 올빼미'][0])).toBeNull();
  });

  it('같은 나오는 곳의 스크롤만 이름순으로 모은다', () => {
    expect(scrollsFromSource(sample, '탈라 가흐').map((scroll) => scroll.name)).toEqual([
      '전용 인챈트 스크롤 - 감싸는',
      '전용 인챈트 스크롤 - 망집',
    ]);
    expect(scrollsFromSource(sample, '없는 곳')).toEqual([]);
  });
});

describe('수집한 인챈트 스크롤 사양', () => {
  const entries = Object.entries(file.scrolls);

  it('모든 이름이 스크롤 이름 모양이고 사양이 하나 이상 있다', () => {
    expect(entries.length).toBeGreaterThan(1000);
    for (const [name, variants] of entries) {
      expect(isEnchantScrollName(name), name).toBe(true);
      expect(variants.length, name).toBeGreaterThan(0);
    }
  });

  it('풀리지 않은 문자열이나 랭크 0 이 섞이지 않는다', () => {
    for (const [name, variants] of entries) {
      for (const variant of variants) {
        expect(variant.level, name).toBeGreaterThanOrEqual(1);
        expect(variant.desc.join('\n'), name).not.toContain('not found key');
      }
    }
  });

  it('탈라 가흐 인챈트 스크롤 32개가 모두 선택 스크롤 목록에 든다', () => {
    const found = scrollsFromSource(file, '탈라 가흐');
    expect(found).toHaveLength(32);
    // 선택 스크롤은 전용 인챈트만 준다.
    for (const scroll of found) expect(scroll.name.startsWith('전용 인챈트 스크롤 - '), scroll.name).toBe(true);
  });

  it('모든 이름이 아이템 사전의 인챈트 스크롤 카테고리에 있다', () => {
    const dictionary = JSON.parse(
      readFileSync(resolve(__dirname, '../../../public/data/items/920b5aa6.json'), 'utf8'),
    ) as { category: string; items: { name: string }[] };
    expect(dictionary.category).toBe('인챈트 스크롤');
    const names = new Set(dictionary.items.map((item) => item.name));
    for (const [name] of entries) expect(names.has(name), name).toBe(true);
  });
});
