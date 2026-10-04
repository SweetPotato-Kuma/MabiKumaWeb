/**
 * 수집한 인챈트 스크롤 사양 검사.
 *
 * 다른 사이트에서 받아 온 게임 데이터 파일을 그대로 읽어 검사한다. 그 사이트가 막거나 형식을 바꾸면 우리 코드와
 * 상관없이 깨지므로, 기본 시험(npm test, 배포와 동기화)에서는 빼고 `npm run test:data` 로 따로 돌린다.
 * 데이터를 우리 쪽으로 옮기면 다시 기본 시험에 넣는다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scrollsFromSource, isEnchantScrollName, type ScrollFile } from './scrolls';

const file = JSON.parse(
  readFileSync(resolve(__dirname, '../../../public/data/enchant-scrolls.json'), 'utf8'),
) as ScrollFile;

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
    for (const scroll of found)
      expect(scroll.name.startsWith('전용 인챈트 스크롤 - '), scroll.name).toBe(true);
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
