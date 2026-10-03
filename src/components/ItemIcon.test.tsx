import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ItemImage } from '@/components/ItemIcon';

/**
 * jsdom 은 그림을 실제로 받지 않는다. 받은 것처럼 원래 크기를 심고 load 를 쏜다.
 */
function loadAs(image: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: width });
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: height });
  Object.defineProperty(image, 'complete', { configurable: true, value: true });
  fireEvent.load(image);
}

function renderImage(size: number) {
  const { container } = render(<ItemImage src="https://icons.example/a.png" size={size} />);
  return container.querySelector('img') as HTMLImageElement;
}

describe('ItemImage', () => {
  it('새 아이콘에 변환본이 없으면 원래 주소를 표시하고, 그것도 실패하면 빈 그림을 표시한다', () => {
    const src = 'https://icons.example/0123456789abcdef.png';
    const { container } = render(<ItemImage src={src} size={48} />);
    const image = container.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toContain('/data/item-icons/0123456789abcdef.webp');
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe(src);
    loadAs(image, 24, 48);
    expect(image.style.width).toBe('24px');
    fireEvent.error(image);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('item-missing');
  });

  it.each([40, 48, 50, 80])('128px 정사각 이미지는 %ipx 칸에 맞춘다', (size) => {
    const image = renderImage(size);
    loadAs(image, 128, 128);
    expect(image.style.width).toBe(`${size}px`);
    expect(image.style.height).toBe(`${size}px`);
  });

  it('크기를 알기 전에는 숨겨 둔다', () => {
    // 늦게 온 그림이 잘못된 크기로 번쩍이지 않게 한다. 칸은 먼저 잡혀 있다.
    expect(renderImage(48).style.visibility).toBe('hidden');
  });

  it('칸에 들어가는 그림은 원래 크기 그대로 그린다', () => {
    const image = renderImage(48);
    loadAs(image, 48, 48);

    expect(image.style.width).toBe('48px');
    expect(image.style.height).toBe('48px');
    expect(image.style.visibility).toBe('');
  });

  it('작은 그림을 칸만큼 키우지 않는다', () => {
    const image = renderImage(96);
    loadAs(image, 24, 24);

    expect(image.style.width).toBe('24px');
  });

  it('칸보다 긴 그림은 정확히 절반으로 줄인다', () => {
    const image = renderImage(48);
    loadAs(image, 48, 96);

    expect(image.style.width).toBe('24px');
    expect(image.style.height).toBe('48px');
  });

  it('주소가 깨진 그림은 그림 없음 표시로 바꾼다', () => {
    // 빈칸으로 두면 그림이 늦는 것인지 없는 것인지 알 수 없다.
    const { container } = render(<ItemImage src="https://icons.example/broken.png" size={48} />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    const image = container.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toContain('item-missing');
    expect(image.width).toBe(24);
  });
});
