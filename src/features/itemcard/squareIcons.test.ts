import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { squareIconUrl } from './squareIcons';

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.stubEnv('BASE_URL', '/'));

describe('정사각 아이콘 연결', () => {
  const file = '0123456789abcdef';
  it('목록, 카드, 제작법의 같은 아이콘은 한 주소를 쓴다', () => {
    const expected = squareIconUrl(`${file}.png`);
    expect(expected).toMatch(/^\/data\/item-icons\/0123456789abcdef.webp\?v=[a-f0-9]+$/);
    expect(squareIconUrl(`https://icons.example/${file}.png`)).toBe(expected);
    expect(squareIconUrl(`https://worker.example/item-card/icons/${file}.png`)).toBe(expected);
  });
  it('하위 경로 배포에서도 이미지가 열린다', () => {
    vi.stubEnv('BASE_URL', '/preview/');
    expect(squareIconUrl(`${file}.png`)).toMatch(/^\/preview\/data\/item-icons\//);
  });
  it('아이템 해시 주소가 아닌 이미지는 바꾸지 않는다', () => {
    expect(squareIconUrl('new.png')).toBeUndefined();
    expect(squareIconUrl('data:image/png;base64,abc')).toBeUndefined();
    expect(squareIconUrl(`${file}.webp`)).toBeUndefined();
  });
});
