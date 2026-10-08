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

  it('특수 문자가 있는 이름도 되돌아오고 주소가 겹치지 않는다', () => {
    const names = [
      '낙지',
      '문어',
      '훈민정음 가방(10×10)',
      '1막: 우연한 충돌',
      'A_B',
      'A B',
      'a~b',
      'a%b',
    ];
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
