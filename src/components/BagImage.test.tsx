import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BagImage } from '@/components/BagImage';

const SRC =
  'https://open.api.nexon.com/static/mabinogi/img/ead0f110c5139356446221d0fbca345d?q=4b45';
const COLORS = ['466572', 'a2d0c6'];

/** 그림이 없을 때 칠한 칸들. */
function stripes(container: HTMLElement) {
  return container.querySelectorAll('[aria-hidden] > div');
}

describe('BagImage', () => {
  it('넥슨 그림이 있으면 그 그림을 그린다', () => {
    const { container } = render(<BagImage src={SRC} colors={COLORS} size={48} />);
    const image = container.querySelector('img') as HTMLImageElement;

    expect(image.getAttribute('src')).toBe(SRC);
    expect(image.style.width).toBe('48px');
    // 48 의 배수라 픽셀이 고르게 떨어진다.
    expect(image.style.imageRendering).toBe('pixelated');
    expect(stripes(container)).toHaveLength(0);
  });

  it('그림이 없으면 파트 색을 나란히 칠한다', () => {
    const { container } = render(<BagImage src={null} colors={COLORS} size={48} />);

    expect(container.querySelector('img')).toBeNull();
    const parts = stripes(container);
    expect(parts).toHaveLength(2);
    expect((parts[0] as HTMLElement).style.background).toBe('rgb(70, 101, 114)');
  });

  it('그림을 받지 못하면 깨진 그림 대신 색으로 칠한다', () => {
    const { container } = render(<BagImage src={SRC} colors={COLORS} size={48} />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(stripes(container)).toHaveLength(2);
  });
});
