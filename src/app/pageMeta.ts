import { useEffect } from 'react';
import { itemNameFromSlug } from '@/features/auction/itemSlug.mjs';
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

/** 아이템 한 장의 제목과 설명. 빌드가 아이템마다 굽는 HTML 과 같은 문구다. */
export function itemPageMeta(name: string): PageMeta {
  const fill = (template: string) => template.replaceAll('{name}', name);
  return {
    title: `${fill(pageMeta.item.title)} · ${pageMeta.siteName}`,
    description: fill(pageMeta.item.description),
  };
}

/** /item/<slug> 이면 이름을, 아니면 null. 브라우저가 주는 경로는 퍼센트 인코딩되어 있다. */
function itemNameOf(pathname: string): string | null {
  if (!pathname.startsWith(pageMeta.item.pathPrefix)) return null;
  try {
    const name = itemNameFromSlug(decodeURIComponent(pathname.slice(pageMeta.item.pathPrefix.length)));
    return name || null;
  } catch {
    return null;
  }
}

export function pageMetaFor(pathname: string): PageMeta {
  const itemName = itemNameOf(pathname);
  if (itemName) return itemPageMeta(itemName);
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
