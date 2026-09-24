import { useEffect, useMemo, useRef } from 'react';
import { theme } from 'antd';
import { paintBag, type BagDyeBook } from '@/features/bags/dye';

interface BagImageProps {
  /** 색칠 지도. 받는 중이거나 받지 못했으면 null. */
  book: BagDyeBook | null;
  name: string;
  /** 파트 A, B, C 색(6자리 16진수). */
  colors: string[];
  /** 정사각 칸 한 변. 48 의 배수로 두면 픽셀이 고르게 떨어진다. */
  size: number;
}

/**
 * 튼튼한 주머니 그림. 주머니의 기본 그림 위에 그 줄의 색을 칠해 그린다.
 *
 * 지도가 없는 주머니는 파트 색을 나란히 칠한 칸으로 대신한다. 넥슨이 그림을 주지 않는 허브
 * 주머니 10종이 그렇고, 지도를 받기 전에도 잠깐 그렇다. 파트가 그림의 어디에 해당하는지는
 * 주머니 모양마다 달라서(실크는 상자, 꽃바구니는 바구니와 천) 모양을 흉내 내지 않는다.
 *
 * 어느 쪽이든 칸 크기는 같다. 표의 줄과 카드의 높이가 들쭉날쭉하지 않게 하려는 것이다.
 */
export function BagImage({ book, name, colors, size }: BagImageProps) {
  const { token } = theme.useToken();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dye = book?.bags.get(name);
  const pixels = useMemo(
    () => (book && dye ? paintBag(book, dye, colors) : null),
    [book, dye, colors],
  );

  useEffect(() => {
    const context = pixels && book ? canvasRef.current?.getContext('2d') : null;
    if (!context || !pixels || !book) return;
    const image = context.createImageData(book.size, book.size);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
  }, [book, pixels]);

  return (
    <div
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        // 흰 주머니와 검은 주머니가 라이트, 다크 어느 쪽 배경에도 묻히지 않게 옅은 바탕을 깐다.
        background: token.colorFillQuaternary,
        borderRadius: token.borderRadiusSM,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {pixels && book ? (
        <canvas
          ref={canvasRef}
          width={book.size}
          height={book.size}
          // 이름이 바로 옆에 있으므로 그림은 꾸밈이다.
          aria-hidden
          style={{
            display: 'block',
            width: size,
            height: size,
            // 픽셀 그림이라 키울 때 번지지 않게 한다.
            imageRendering: 'pixelated',
          }}
        />
      ) : colors.length > 0 ? (
        <div
          aria-hidden
          style={{
            display: 'flex',
            // 주머니 그림도 칸 가장자리에 여백이 있다. 색 칸만 꽉 차 보이지 않게 비슷한 여백을 둔다.
            width: '60%',
            height: '60%',
            borderRadius: token.borderRadiusSM,
            overflow: 'hidden',
            // 흰색 파트가 바탕에 묻히지 않게 테두리를 둔다.
            border: `1px solid ${token.colorBorder}`,
          }}
        >
          {colors.map((hex, part) => (
            <div key={part} style={{ flex: 1, background: `#${hex}` }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
