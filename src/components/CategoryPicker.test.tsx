import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { CategoryPicker } from '@/components/CategoryPicker';

/**
 * 트리는 넓은 화면에서만 나온다. jsdom 의 matchMedia 는 기본이 "맞지 않음" 이라
 * 그대로 두면 Select 쪽만 테스트하게 된다. 여기서만 넓은 화면인 척한다.
 */
function pretendWideScreen() {
  const original = window.matchMedia;

  window.matchMedia = ((query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;

  return () => {
    window.matchMedia = original;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPicker(onChange = () => {}) {
  return render(
    <AppProviders>
      <CategoryPicker value="" onChange={onChange} />
    </AppProviders>,
  );
}

describe('카테고리 고르기', () => {
  it('묶음을 누르면 펼쳐진다', () => {
    const restore = pretendWideScreen();

    try {
      renderPicker();

      // 접혀 있을 때는 잎이 화면에 없다.
      expect(screen.queryByText('검')).not.toBeInTheDocument();

      /**
       * 묶음은 고를 수 없는 노드라 onSelect 가 불리지 않는다. 제목을 눌러도 아무 일이
       * 없던 것이 이 테스트가 막으려는 회귀다. 경매장 화면이 이 컴포넌트를 쓰지 않고
       * 자기 복사본을 들고 있던 탓에 한쪽만 고쳐진 적이 있다.
       */
      fireEvent.click(screen.getByText('근거리 장비'));

      expect(screen.getByText('검')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('잎을 누르면 그 카테고리를 돌려준다', () => {
    const restore = pretendWideScreen();
    const onChange = vi.fn();

    try {
      renderPicker(onChange);
      fireEvent.click(screen.getByText('근거리 장비'));
      fireEvent.click(screen.getByText('검'));

      expect(onChange).toHaveBeenCalledWith('검');
    } finally {
      restore();
    }
  });
});
