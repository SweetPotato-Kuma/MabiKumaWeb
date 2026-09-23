import { useState } from 'react';
import { iconUrl, isCardStoreConfigured, type ItemCard } from '@/features/itemcard/cards';
import { pixelScale } from '@/features/itemcard/pixelScale';

interface ItemImageProps {
  src: string;
  /** 정사각 칸 한 변. 그림은 이 안에 들어간다. */
  size: number;
}

/**
 * 그림 한 장을 원래 크기 기준으로 그린다. 크기는 그림이 도착해야 알 수 있어서, 도착하기
 * 전에는 숨겨 두고 칸만 잡아 둔다. 칸이 먼저 있으므로 그림이 와도 표가 들썩이지 않는다.
 */
export function ItemImage({ src, size }: ItemImageProps) {
  // 같은 칸에 다른 그림이 들어올 수 있다(표의 줄이 바뀔 때). 크기는 그림 주소와 짝지어 둔다.
  const [natural, setNatural] = useState<{ src: string; width: number; height: number } | null>(
    null,
  );
  const known = natural?.src === src ? natural : null;
  const scale = known ? pixelScale(known.width, known.height, size) : 1;

  const measure = (image: HTMLImageElement | null) => {
    if (!image || !image.complete || image.naturalWidth === 0) return;
    if (natural?.src === src) return;
    setNatural({ src, width: image.naturalWidth, height: image.naturalHeight });
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        // 이미 받아 둔 그림은 붙는 순간 끝나 있어서 onLoad 가 오지 않을 수 있다. 붙을 때도 한 번 잰다.
        ref={measure}
        src={src}
        // 이름이 바로 옆에 있으므로 그림은 꾸밈이다. 화면 읽기 프로그램이 이름을 두 번 읽지 않게 비운다.
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={(event) => measure(event.currentTarget)}
        style={
          known
            ? { width: known.width * scale, height: known.height * scale, display: 'block' }
            : { maxWidth: '100%', maxHeight: '100%', display: 'block', visibility: 'hidden' }
        }
      />
    </div>
  );
}

interface ItemIconProps {
  card: ItemCard | null | undefined;
  size: number;
}

/**
 * 사전 카드의 그림 한 칸.
 *
 * 그림이 아직 없어도 **자리는 비워 둔다.** 카드는 표가 그려진 뒤에 도착하고, 그때 칸이
 * 생기면 이름이 옆으로 밀리며 표가 들썩인다. 카드 저장소가 아예 없는 환경에서는 자리도
 * 만들지 않는다. 영영 채워지지 않을 빈칸을 두지 않는다.
 */
export function ItemIcon({ card, size }: ItemIconProps) {
  if (!isCardStoreConfigured()) return null;

  if (!card?.icon) {
    return <div style={{ width: size, height: size, flex: `0 0 ${size}px` }} />;
  }

  // 워커가 자체 도메인 주소를 붙여 주면 그쪽으로 받는다. 워커 요청 한도를 쓰지 않는다.
  return <ItemImage src={card.iconUrl ?? iconUrl(card.icon)} size={size} />;
}
