import { useState } from 'react';
import { iconSrcOf, isCardStoreConfigured, type ItemCard } from '@/features/itemcard/cards';
import { iconFileUrl, isIconMapConfigured, useItemBrief } from '@/features/itemcard/iconMap';
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
        // lazy 로 두면 화면 배치가 끝날 때까지 받기를 미룬다. 2KB 남짓한 그림이라 바로 받는 편이 낫다.
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
  /** 워커에서 받은 카드. 상세 화면처럼 설명까지 받아 둔 곳이 넘긴다. */
  card?: ItemCard | null;
  /** 주면 카테고리별 그림 목록에서 바로 찾는다. 카드 조회를 기다리지 않는다. */
  category?: string;
  name?: string;
  size: number;
}

/**
 * 사전 카드의 그림 한 칸.
 *
 * 그림은 카테고리별 그림 목록(iconMap.ts)에서 먼저 찾는다. 목록은 CDN 에서 오므로 워커에 카드를
 * 묻는 것보다 훨씬 빨리 온다. 목록에 없으면 넘겨받은 카드를 쓴다. 두 곳이 가리키는 파일이 같으면
 * 주소도 같아서, 카드가 늦게 와도 그림을 다시 받지 않는다.
 *
 * 그림이 아직 없어도 **자리는 비워 둔다.** 칸이 늦게 생기면 이름이 옆으로 밀리며 표가 들썩인다.
 * 카드 저장소도 그림 목록도 없는 환경에서는 자리도 만들지 않는다. 영영 채워지지 않을 빈칸을 두지 않는다.
 */
export function ItemIcon({ card, category, name, size }: ItemIconProps) {
  if (!isCardStoreConfigured() && !isIconMapConfigured()) return null;
  // 카테고리와 이름을 받은 칸만 목록을 본다. 카드만 넘기는 상세 창은 목록을 받을 이유가 없다.
  if (category && name) return <MappedItemIcon card={card} category={category} name={name} size={size} />;
  return <IconSlot src={card?.icon ? iconSrcOf(card) : ''} size={size} />;
}

function MappedItemIcon({ card, category, name, size }: ItemIconProps & { category: string; name: string }) {
  const brief = useItemBrief(category, name);
  const src = brief?.icon ? iconFileUrl(brief.icon) : card?.icon ? iconSrcOf(card) : '';
  return <IconSlot src={src} size={size} />;
}

function IconSlot({ src, size }: { src: string; size: number }) {
  if (!src) return <div style={{ width: size, height: size, flex: `0 0 ${size}px` }} />;
  return <ItemImage src={src} size={size} />;
}
