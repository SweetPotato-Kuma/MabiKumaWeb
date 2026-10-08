import { useMemo, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { sanitizeNewsHtml } from '@/features/news/sanitize';
import './newsBody.css';

/**
 * 공식 홈페이지 본문을 걸러 그린다. 받아 둔 다른 새소식 글로 가는 링크(/news?id=)는 화면을 새로 받지 않고
 * 라우터로 옮긴다. 본문 HTML 안의 링크라 react-router Link 로 그릴 수 없어 누를 때 가로챈다.
 */
export function NewsBody({ html }: { html: string }) {
  const navigate = useNavigate();
  const clean = useMemo(() => sanitizeNewsHtml(html), [html]);

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
    <div className="news-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: clean }} />
  );
}
