/**
 * 키트 글의 신규 아이템 미리보기 갤러리.
 *
 * 공식 홈페이지의 글은 `.img_g.g_N`(그림이나 영상 한 칸)과 `ul.img_g_list`(이름 목록)로 갤러리를 만들고, 글 안의
 * 스크립트(jQuery)가 목록 위에 올리거나 누를 때 N 번째 칸을 보여 준다. 스크립트는 돌리지 않으므로(sanitize.ts)
 * 같은 움직임을 여기서 붙인다. 보이는 칸은 `on` 클래스, 고른 목록 줄은 `focus` 클래스로 가른다. 둘의 모양은 글이
 * 들고 온 스타일 시트가 정한다.
 *
 * 공식 스크립트와 같은 점
 *   - 처음에는 첫 칸을 보여 주고, 영상이면 재생한다. 다른 칸을 고르면 나머지 영상은 멈춘다.
 *   - 넓은 화면에서는 목록 위에 올리면 바뀐다. 다만 목록과 첫 칸이 한 화면에 안 들어오면(올리다가 칸이 밀려 목록이
 *     달아난다) 누를 때만 바뀐다. 좁은 화면은 누를 때만 바뀐다.
 *   - 목록 줄의 이름이 두 줄을 넘으면 말줄임(...)을 단다. 고른 칸 아래 띠에는 그 줄의 이름을 적는다.
 * 더한 점: 키보드로 목록 줄에 초점이 가도 바뀐다.
 */

/** 공식 스크립트가 "좁은 화면" 으로 보는 폭. */
const NARROW_QUERY = '(max-width: 839px)';

const playQuietly = (video: HTMLVideoElement) => {
  // jsdom 처럼 재생을 못 하는 환경과, 자동 재생이 막힌 브라우저는 조용히 넘어간다.
  try {
    void video.play?.()?.catch(() => undefined);
  } catch {
    // 재생하지 못해도 첫 장면이 보인다.
  }
};

/** root 안의 갤러리를 살려 준다. 갤러리가 없으면 아무것도 하지 않는다. 돌려주는 함수가 붙인 것을 걷는다. */
export function attachGallery(root: HTMLElement): () => void {
  const list = root.querySelector<HTMLElement>('.img_g_list');
  if (!list) return () => undefined;
  const rows = [...list.children].filter((child): child is HTMLElement => child.tagName === 'LI');
  const panels = rows.map((_, index) => root.querySelector<HTMLElement>(`.img_g.g_${index + 1}`));
  if (rows.length === 0 || !panels.some(Boolean)) return () => undefined;

  rows.forEach((row, index) => {
    const label = row.querySelector('.txt');
    const caption = panels[index]?.querySelector('.txt');
    if (label && caption) caption.innerHTML = label.innerHTML;
    // 이름이 두 줄에 안 들어가면 줄 끝에 말줄임을 단다.
    const clip = row.querySelector<HTMLElement>('.t > span');
    if (label instanceof HTMLElement && clip && label.offsetHeight > clip.offsetHeight) {
      row.querySelector('.t')?.classList.add('dot');
    }
  });

  const show = (index: number) => {
    rows.forEach((row, at) => row.classList.toggle('focus', at === index));
    panels.forEach((panel, at) => panel?.classList.toggle('on', at === index));
    const target = panels[index]?.querySelector('video') ?? null;
    for (const video of root.querySelectorAll<HTMLVideoElement>('.img_g video')) {
      if (video !== target) video.pause?.();
    }
    if (target) playQuietly(target);
  };

  const narrow = () => window.matchMedia(NARROW_QUERY).matches;
  const hoverable = () =>
    !narrow() && window.innerHeight >= list.offsetHeight + (panels[0]?.offsetHeight ?? 0);

  const cleanups = rows.map((row, index) => {
    const onEnter = () => {
      if (hoverable()) show(index);
    };
    const onClick = (event: Event) => {
      event.preventDefault();
      show(index);
    };
    const onFocus = () => show(index);
    row.addEventListener('mouseenter', onEnter);
    row.addEventListener('click', onClick);
    row.addEventListener('focusin', onFocus);
    return () => {
      row.removeEventListener('mouseenter', onEnter);
      row.removeEventListener('click', onClick);
      row.removeEventListener('focusin', onFocus);
    };
  });

  show(0);

  return () => {
    for (const cleanup of cleanups) cleanup();
    for (const video of root.querySelectorAll<HTMLVideoElement>('.img_g video')) video.pause?.();
  };
}
