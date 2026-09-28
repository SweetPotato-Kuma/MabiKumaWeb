import { useEffect, useRef } from 'react';
import type { HornPost } from './api';

export function canNotify(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 알림을 켤 수 있으면 true. 처음이면 브라우저가 허락을 묻는다. */
export async function requestNotifyPermission(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

interface HornAlertsInput {
  enabled: boolean;
  /** 지금 조건. 바뀌면 그때 보이는 글을 새 기준으로 삼는다. */
  searchKey: string;
  /** 지금 조건으로 받은 글. 앞 조건의 결과를 잠시 보여 주는 동안에는 null. */
  posts: HornPost[] | null;
  title: string;
}

/**
 * 새 글 알림. 켠 뒤(또는 조건을 바꾼 뒤) 처음 받은 글을 기준으로 삼고, 그다음부터 새로 나타난 줄 중
 * 기준보다 늦게 외친 것만 알린다. 받을 때마다 알림은 많아야 하나다. 여러 개면 첫 글에 "외 N개" 를 붙인다.
 */
export function useHornAlerts({ enabled, searchKey, posts, title }: HornAlertsInput) {
  const baseline = useRef<{ key: string; seen: Set<number>; last: number } | null>(null);

  useEffect(() => {
    if (!enabled) baseline.current = null;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !posts || !canNotify() || Notification.permission !== 'granted') return;

    const current = baseline.current;
    if (!current || current.key !== searchKey) {
      baseline.current = {
        key: searchKey,
        seen: new Set(posts.map((post) => post.id)),
        last: posts.reduce((max, post) => Math.max(max, post.last), 0),
      };
      return;
    }

    const fresh = posts.filter((post) => !current.seen.has(post.id) && post.last > current.last);
    for (const post of posts) current.seen.add(post.id);
    current.last = posts.reduce((max, post) => Math.max(max, post.last), current.last);
    if (fresh.length === 0) return;

    const [first] = fresh;
    const rest = fresh.length > 1 ? ` 외 ${fresh.length - 1}개` : '';
    try {
      const notice = new Notification(title, {
        body: `${first.character}: ${first.body}${rest}`,
        tag: 'mabikuma-horn',
      });
      notice.onclick = () => {
        window.focus();
        notice.close();
      };
    } catch {
      // 모바일 크롬처럼 페이지에서 바로 알림을 만들 수 없는 브라우저. 화면의 목록은 그대로 갱신된다.
    }
  }, [enabled, posts, searchKey, title]);
}
