import { useState } from 'react';
import { theme } from 'antd';

/** 넥슨 주머니 그림은 48px 픽셀 그림을 5배(240px)로 키워 보낸다. */
const PIXEL_GRID = 48;

interface BagImageProps {
  /** 넥슨이 그 주머니의 색을 입혀 그린 그림. */
  src: string | null;
  /** 파트 A, B, C 색(6자리 16진수). 그림이 없을 때 칸을 이 색으로 나눠 칠한다. */
  colors: string[];
  /** 정사각 칸 한 변. 48 의 배수로 두면 픽셀이 고르게 떨어진다. */
  size: number;
}

/**
 * 색이 입혀진 튼튼한 주머니 그림.
 *
 * 그림이 없거나 받지 못해도 **칸은 남긴다.** 표의 줄과 카드의 높이가 그림마다 들쭉날쭉하지
 * 않게 하려는 것이다. 넥슨은 허브 주머니 10종에 그림을 주지 않는다(2026-09-24 확인). 그 칸은
 * 파트 색을 나란히 칠해 채운다. 파트가 그림의 어디에 해당하는지는 주머니 모양마다 달라서
 * (실크는 상자, 꽃바구니는 바구니와 천) 몸통이나 끈 같은 모양을 흉내 내지 않는다.
 */
export function BagImage({ src, colors, size }: BagImageProps) {
  const { token } = theme.useToken();
  // 같은 칸에 다른 주머니가 들어올 수 있다(쪽을 넘길 때). 실패는 그림 주소와 짝지어 둔다.
  const [failed, setFailed] = useState<string | null>(null);
  const shown = src !== null && failed !== src;

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
      {!shown && colors.length > 0 ? (
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
      {shown ? (
        <img
          src={src}
          // 이름이 바로 옆에 있으므로 그림은 꾸밈이다. 화면 읽기 프로그램이 이름을 두 번 읽지 않게 비운다.
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          // 넥슨 그림이 막히거나 사라지면 빈칸으로 둔다. 깨진 그림 표시를 남기지 않는다.
          onError={() => setFailed(src)}
          style={{
            display: 'block',
            width: size,
            height: size,
            // 픽셀 그림이라 줄일 때 번지지 않게 한다. 48 의 배수 크기에서만 픽셀이 고르게 떨어진다.
            imageRendering: size % PIXEL_GRID === 0 ? 'pixelated' : 'auto',
          }}
        />
      ) : null}
    </div>
  );
}
