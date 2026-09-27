import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageMetaFor } from './pageMeta';
import pageMeta from './pageMeta.json';

describe('pageMetaFor', () => {
  it('화면 제목 뒤에 사이트 이름을 붙인다', () => {
    expect(pageMetaFor('/auction').title).toBe('마비노기 경매장 시세 조회 · 마비쿠마');
  });

  it('아이템 주소는 그 아이템 이름으로 제목을 짓는다', () => {
    // 브라우저가 주는 경로는 퍼센트 인코딩되어 있다.
    const path = `/item/${encodeURIComponent('소울_리버레이트_사이드')}`;
    expect(pageMetaFor(path).title).toBe('소울 리버레이트 사이드 - 마비노기 아이템 시세와 정보 · 마비쿠마');
    expect(pageMetaFor(path).description).toContain('소울 리버레이트 사이드');
  });

  it('첫 화면 HTML 의 제목과 설명이 기본값과 같다', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain(`<title>${pageMeta.defaultTitle}</title>`);
    expect(html).toContain(`<meta name="description" content="${pageMeta.defaultDescription}" />`);
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

  it('예전 주소는 목록에 있는 화면으로만 넘기고, 화면 경로와 겹치지 않는다', () => {
    const paths = new Set(pageMeta.pages.map((page) => page.path));
    for (const redirect of pageMeta.redirects) {
      expect(redirect.from).toMatch(/^\/[a-z-]+$/);
      expect(paths.has(redirect.to)).toBe(true);
      expect(paths.has(redirect.from)).toBe(false);
    }
  });
});
