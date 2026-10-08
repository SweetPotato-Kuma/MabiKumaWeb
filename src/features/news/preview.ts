import { useQuery } from '@tanstack/react-query';
import { getProxyUrl } from '@/lib/settings';

/**
 * 공식 미리보기. 키트와 이벤트 글의 "신규 아이템 미리보기" 갤러리에서 워커가 뽑아 둔 아이템 이름 -> 그림이나 영상
 * (worker/previews.js). 그림은 우리 R2 의 사본이고, 영상은 크기가 커서 공식 주소 그대로다.
 */
export interface ItemPreview {
  /** 글에 적힌 이름 */
  name: string;
  kind: 'image' | 'video';
  url: string;
  /** 이 이름이 나온 글(받아 둔 새소식)의 번호와 제목 */
  postId: number;
  title: string;
}

/** 미리보기가 없는 아이템이 대부분이다. 없다는 답(404)은 오류가 아니라 null 이다. */
async function fetchPreview(name: string, signal?: AbortSignal): Promise<ItemPreview | null> {
  const url = new URL(`${getProxyUrl()}/news/preview`);
  url.searchParams.set('name', name);
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`공식 미리보기를 받지 못했습니다. (HTTP ${response.status})`);
  return (await response.json()) as ItemPreview;
}

export function useItemPreview(name: string) {
  return useQuery({
    queryKey: ['news', 'preview', name],
    queryFn: ({ signal }) => fetchPreview(name, signal),
    enabled: getProxyUrl().length > 0 && name.length > 0,
    // 새 키트가 올라오면 워커가 10분 안에 색인한다. 한 번 본 답은 오래 둔다.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}
