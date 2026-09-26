import { useState } from 'react';
import { theme } from 'antd';
import itemMissing from '@/assets/item-missing.png';
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
  // 주소가 깨진 그림은 빈칸 대신 '그림 없음' 표시로 바꾼다. 이것도 주소와 짝지어 둔다.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const known = natural?.src === src ? natural : null;
  const scale = known ? pixelScale(known.width, known.height, size) : 1;

  const measure = (image: HTMLImageElement | null) => {
    if (!image || !image.complete || image.naturalWidth === 0) return;
    if (natural?.src === src) return;
    setNatural({ src, width: image.naturalWidth, height: image.naturalHeight });
  };

  if (failedSrc === src) return <MissingIcon size={size} />;

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
        onError={() => setFailedSrc(src)}
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
  /**
   * 그림 파일 이름을 이미 알면(제작법 데이터가 아이템 번호로 적어 둔 것) 목록을 거치지 않고 바로
   * 그린다. 경매장에 올라온 적 없는 아이템은 이름 사전에 카테고리가 없어 이 길로만 그림이 나온다.
   */
  file?: string;
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
export function ItemIcon({ card, category, name, file, size }: ItemIconProps) {
  if (!isCardStoreConfigured() && !isIconMapConfigured()) return null;
  if (file && isIconMapConfigured()) return <ItemImage src={iconFileUrl(file)} size={size} />;
  // 카테고리와 이름을 받은 칸만 목록을 본다. 카드만 넘기는 상세 창은 목록을 받을 이유가 없다.
  if (category && name)
    return <MappedItemIcon card={card} category={category} name={name} size={size} />;
  const src = card?.icon ? iconSrcOf(card) : '';
  // 상세 창은 카드만 받는다. null 이면 물어봤는데 카드가 없다는 뜻이다. undefined 는 아직 모른다.
  return <IconSlot src={src} missing={card !== undefined && !src} size={size} />;
}

function MappedItemIcon({
  card,
  category,
  name,
  size,
}: ItemIconProps & { category: string; name: string }) {
  const brief = useItemBrief(category, name);
  const src = brief?.icon ? iconFileUrl(brief.icon) : card?.icon ? iconSrcOf(card) : '';
  // 목록을 받았는데 이름이 없으면(null) 그림이 없다고 확정된 것이다. 받는 중(undefined)에는 비워 둔다.
  return <IconSlot src={src} missing={brief !== undefined && !src} size={size} />;
}

/**
 * 그림이 올 칸. 아직 모르는 동안은 빈칸으로 두고, 없다고 확정됐을 때만 '그림 없음' 표시를 그린다.
 * 받는 중에 표시를 그리면 곰이 번쩍 보였다가 진짜 그림으로 바뀐다.
 */
function IconSlot({ src, missing, size }: { src: string; missing: boolean; size: number }) {
  if (src) return <ItemImage src={src} size={size} />;
  if (missing) return <MissingIcon size={size} />;
  return <div style={{ width: size, height: size, flex: `0 0 ${size}px` }} />;
}

/** 원본 그림(51x45)의 비. 칸 너비의 절반으로 줄여 가운데에 둔다. */
const MISSING_RATIO = 45 / 51;

/** 그림이 없는 아이템의 칸. 점선 테두리 안에 회색 곰 얼굴을 작게 둔다. 이름이 옆에 있으니 꾸밈으로 둔다. */
function MissingIcon({ size }: { size: number }) {
  const { token } = theme.useToken();
  const width = Math.round(size / 2);
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        border: `1px dashed ${token.colorBorder}`,
        borderRadius: token.borderRadiusSM,
      }}
    >
      <img
        src={itemMissing}
        alt=""
        width={width}
        height={Math.round(width * MISSING_RATIO)}
        style={{ display: 'block' }}
      />
    </div>
  );
}
