import { describe, expect, it } from 'vitest';
import { pageMetaFor } from './pageMeta';
import pageMeta from './pageMeta.json';

describe('pageMetaFor', () => {
  it('화면 제목 뒤에 사이트 이름을 붙인다', () => {
    expect(pageMetaFor('/auction').title).toBe('마비노기 경매장 시세 조회 · MabiKuma');
  });

  it('목록에 없는 경로는 기본 제목과 설명을 쓴다', () => {
    expect(pageMetaFor('/item-card')).toEqual({
      title: pageMeta.defaultTitle,
      description: pageMeta.defaultDescription,
    });
  });

  it('경로마다 HTML 파일 이름이 되므로 한 단계짜리 경로만 둔다', () => {
    for (const page of pageMeta.pages) {
      expect(page.path).toMatch(/^\/[a-z-]+$/);
    }
  });
});
