import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachGallery } from './gallery';

/** 공식 키트 글의 갤러리 모양을 줄인 것. 칸 셋(영상 하나, 그림 둘)과 목록 셋. */
function gallery() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="img_g g_1"><video src="https://x.example/1.mp4">&nbsp;</video><span><span><span class="txt">&nbsp;</span></span></span></div>
    <div class="img_g g_2"><img alt="" src="https://x.example/2.jpg" /><span><span><span class="txt">&nbsp;</span></span></span></div>
    <div class="img_g g_3"><img alt="" src="https://x.example/3.jpg" /><span><span><span class="txt">&nbsp;</span></span></span></div>
    <ul class="img_g_list">
      <li><a href="#"><span class="t"><span><span class="txt">웨어(남성용)</span></span></span></a></li>
      <li><a href="#"><span class="t"><span><span class="txt">웨어(여성용)</span></span></span></a></li>
      <li><a href="#"><span class="t"><span><span class="txt">가발</span></span></span></a></li>
    </ul>`;
  document.body.append(root);
  const rows = [...root.querySelectorAll('.img_g_list li')];
  const panels = [...root.querySelectorAll('.img_g')];
  const video = root.querySelector('video')!;
  const play = vi.fn(() => Promise.resolve());
  const pause = vi.fn();
  video.play = play;
  video.pause = pause;
  return { root, rows, panels, play, pause };
}

const shown = (panels: Element[]) => panels.map((panel) => panel.classList.contains('on'));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('키트 글의 미리보기 갤러리', () => {
  it('처음에는 첫 칸을 보여 주고 영상을 재생하며, 이름을 고른 칸 아래 띠에 옮겨 적는다', () => {
    const { root, rows, panels, play } = gallery();
    attachGallery(root);
    expect(shown(panels)).toEqual([true, false, false]);
    expect(rows[0]).toHaveClass('focus');
    expect(play).toHaveBeenCalledTimes(1);
    expect(panels[1].querySelector('.txt')?.textContent).toBe('웨어(여성용)');
  });

  it('목록 줄을 누르면 그 칸으로 바뀌고 앞 영상은 멈추며, 링크는 따라가지 않는다', () => {
    const { root, rows, panels, pause } = gallery();
    attachGallery(root);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    rows[2].querySelector('a')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(shown(panels)).toEqual([false, false, true]);
    expect(rows.map((row) => row.classList.contains('focus'))).toEqual([false, false, true]);
    expect(pause).toHaveBeenCalled();
  });

  it('넓은 화면에서는 목록 위에 올려도 바뀌지만 좁은 화면에서는 누를 때만 바뀐다', () => {
    const { root, rows, panels } = gallery();
    attachGallery(root);
    rows[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(shown(panels)).toEqual([false, true, false]);

    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: true,
    })) as typeof window.matchMedia;
    try {
      rows[2].dispatchEvent(new MouseEvent('mouseenter'));
      expect(shown(panels)).toEqual([false, true, false]);
    } finally {
      window.matchMedia = original;
    }
  });

  it('키보드로 줄에 초점이 가면 바뀐다', () => {
    const { root, rows, panels } = gallery();
    attachGallery(root);
    rows[2].querySelector('a')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(shown(panels)).toEqual([false, false, true]);
  });

  it('걷으면 더는 반응하지 않고 영상을 멈추며, 갤러리가 없는 글은 그대로 둔다', () => {
    const { root, rows, panels, pause } = gallery();
    const detach = attachGallery(root);
    detach();
    expect(pause).toHaveBeenCalled();
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shown(panels)).toEqual([true, false, false]);

    const plain = document.createElement('div');
    plain.innerHTML = '<p>글</p>';
    expect(() => attachGallery(plain)()).not.toThrow();
  });
});
