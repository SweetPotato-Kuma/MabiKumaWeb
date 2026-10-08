import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { attachGallery } from '@/features/news/gallery';
import { sanitizeNewsHtml } from '@/features/news/sanitize';
import './newsBody.css';

/**
 * 공식 홈페이지 본문을 걸러 그린다. 받아 둔 다른 새소식 글로 가는 링크(/news?id=)는 화면을 새로 받지 않고
 * 라우터로 옮긴다. 본문 HTML 안의 링크라 react-router Link 로 그릴 수 없어 누를 때 가로챈다.
 *
 * 본문의 스크립트는 돌리지 않는다. 키트 글의 미리보기 갤러리는 같은 움직임을 attachGallery 가 붙인다.
 */
export function NewsBody({ html }: { html: string }) {
  const navigate = useNavigate();
  const clean = useMemo(() => sanitizeNewsHtml(html), [html]);
  const ref = useRef<HTMLDivElement>(null);

  // 본문이 바뀌면 innerHTML 이 새로 들어가므로 갤러리도 새로 붙인다.
  useEffect(() => (ref.current ? attachGallery(ref.current) : undefined), [clean]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    )
      return;
    const link = (event.target as Element).closest('a');
    const href = link?.getAttribute('href');
    if (!href?.startsWith('/news?')) return;
    event.preventDefault();
    navigate(href);
  };

  // 걸러 낸 HTML 이다(sanitize.ts). 스크립트와 on* 속성, javascript: 주소는 남지 않는다.
  return (
    <div
      ref={ref}
      className="news-body"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
