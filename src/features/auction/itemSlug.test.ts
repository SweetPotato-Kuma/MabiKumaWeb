import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { itemNameFromSlug, itemSlug } from './itemSlug.mjs';

describe('itemSlug', () => {
  it('띄어쓰기는 _ 로 바꾸고 한글과 괄호는 그대로 둔다', () => {
    expect(itemSlug('소울 리버레이트 사이드')).toBe('소울_리버레이트_사이드');
    expect(itemSlug('정령석(10%)')).toBe('정령석(10~25)');
  });

  it('파일 이름에 쓸 수 없는 글자를 남기지 않는다', () => {
    expect(itemSlug('1막: 우연한 충돌 / 수련? 포션')).not.toMatch(/[:/?%\s\\*"<>|]/);
  });

  it('_ 와 ~ 가 든 이름도 되돌릴 수 있다', () => {
    for (const name of ['a_b', 'a~25b', '~', '_ _']) {
      expect(itemNameFromSlug(itemSlug(name))).toBe(name);
    }
  });

  it('이름 사전의 모든 이름이 되돌아오고, 대소문자만 다른 주소가 없다', () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/data/items/names.json'), 'utf8'),
    ) as { items: [string, number][] };
    const names = [...new Set(raw.items.map(([name]) => name))];
    // 윈도우와 맥은 파일 이름의 대소문자를 가리지 않는다. 겹치면 빌드가 파일 하나를 덮어쓴다.
    const lower = new Set<string>();
    for (const name of names) {
      const slug = itemSlug(name);
      expect(itemNameFromSlug(slug)).toBe(name);
      lower.add(slug.toLowerCase());
    }
    expect(lower.size).toBe(names.length);
  });
});
