import { useEffect } from 'react';
import pageMeta from './pageMeta.json';

/**
 * 화면마다 다른 제목과 설명.
 *
 * 원본은 pageMeta.json 하나다. 빌드 뒤 scripts/postbuild.mjs 가 같은 파일을 읽어 경로마다
 * HTML 을 따로 굽고 sitemap 을 만든다. 여기서는 앱 안에서 화면을 옮겨 다닐 때 탭 제목과
 * 설명을 그 값으로 바꿔 준다. 두 곳이 서로 다른 문구를 들고 있지 않게 하려는 것이다.
 */
export interface PageMeta {
  title: string;
  description: string;
}

export function pageMetaFor(pathname: string): PageMeta {
  const page = pageMeta.pages.find((entry) => entry.path === pathname);
  if (!page) return { title: pageMeta.defaultTitle, description: pageMeta.defaultDescription };
  return { title: `${page.title} · ${pageMeta.siteName}`, description: page.description };
}

export function usePageMeta(pathname: string) {
  useEffect(() => {
    const { title, description } = pageMetaFor(pathname);
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [pathname]);
}
