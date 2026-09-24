import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BagImage } from '@/components/BagImage';
import { parseDyeBook } from '@/features/bags/dye';

const NAME = '튼튼한 밀 주머니';
const COLORS = ['466572', 'a2d0c6'];

/** 1x1 지도. 파트 A 색을 그대로 칠한다. */
const book = parseDyeBook({
  size: 1,
  shadeScale: 100,
  bags: { [NAME]: { parts: 2, cells: btoa(String.fromCharCode(2, 100, 100, 100)) } },
});

/** 그림이 없을 때 칠한 칸들. */
function stripes(container: HTMLElement) {
  return container.querySelectorAll('div[aria-hidden] > div');
}

// jsdom 에는 캔버스가 없다. 칠한 픽셀이 무엇이었는지만 받아 둔다.
let drawn: Uint8ClampedArray | null;

beforeEach(() => {
  drawn = null;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData: (image: { data: Uint8ClampedArray }) => {
          drawn = image.data;
        },
      }) as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BagImage', () => {
  it('지도가 있으면 그 주머니 모양에 줄의 색을 칠한다', () => {
    const { container } = render(<BagImage book={book} name={NAME} colors={COLORS} size={48} />);

    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(1);
    expect(canvas.style.width).toBe('48px');
    expect([...drawn!]).toEqual([0x46, 0x65, 0x72, 255]);
    expect(stripes(container)).toHaveLength(0);
  });

  it('지도가 없는 주머니는 파트 색을 나란히 칠한다', () => {
    const { container } = render(
      <BagImage book={book} name="튼튼한 마나 허브 주머니" colors={COLORS} size={48} />,
    );

    expect(container.querySelector('canvas')).toBeNull();
    const parts = stripes(container);
    expect(parts).toHaveLength(2);
    expect((parts[0] as HTMLElement).style.background).toBe('rgb(70, 101, 114)');
  });

  it('지도를 받기 전에도 색 칸으로 보여 준다', () => {
    const { container } = render(<BagImage book={null} name={NAME} colors={COLORS} size={48} />);

    expect(container.querySelector('canvas')).toBeNull();
    expect(stripes(container)).toHaveLength(2);
  });
});
