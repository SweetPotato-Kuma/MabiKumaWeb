import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isEnchantScrollName, sortVariants, type ScrollFile } from './scrolls';

const file = JSON.parse(
  readFileSync(resolve(__dirname, '../../../public/data/enchant-scrolls.json'), 'utf8'),
) as ScrollFile;

describe('인챈트 스크롤 이름', () => {
  it('인챈트 스크롤 카테고리의 "스크롤 - 인챈트" 모양만 사양을 가질 수 있다', () => {
    expect(isEnchantScrollName('인챈트 스크롤', '인챈트 스크롤 - 올빼미')).toBe(true);
    expect(isEnchantScrollName('인챈트 스크롤', '전용 인챈트 스크롤 - 올빼미')).toBe(true);
    expect(isEnchantScrollName('인챈트 스크롤', '인챈트 스크롤')).toBe(false);
    expect(isEnchantScrollName('기타', '인챈트 스크롤 - 올빼미')).toBe(false);
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

describe('수집한 인챈트 스크롤 사양', () => {
  const entries = Object.entries(file.scrolls);

  it('모든 이름이 스크롤 이름 모양이고 사양이 하나 이상 있다', () => {
    expect(entries.length).toBeGreaterThan(1000);
    for (const [name, variants] of entries) {
      expect(isEnchantScrollName('인챈트 스크롤', name), name).toBe(true);
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

  it('모든 이름이 아이템 사전의 인챈트 스크롤 카테고리에 있다', () => {
    const dictionary = JSON.parse(
      readFileSync(resolve(__dirname, '../../../public/data/items/920b5aa6.json'), 'utf8'),
    ) as { category: string; items: { name: string }[] };
    expect(dictionary.category).toBe('인챈트 스크롤');
    const names = new Set(dictionary.items.map((item) => item.name));
    for (const [name] of entries) expect(names.has(name), name).toBe(true);
  });
});
