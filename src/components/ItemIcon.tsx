import { iconUrl, isCardStoreConfigured, type ItemCard } from '@/features/itemcard/cards';

interface ItemIconProps {
  card: ItemCard | null | undefined;
  /** 정사각 칸 한 변. 그림은 이 안에 비율을 지켜 들어간다. */
  size: number;
}

/**
 * 아이템 그림 한 칸.
 *
 * 그림이 아직 없어도 **자리는 비워 둔다.** 카드는 표가 그려진 뒤에 도착하고, 그때 칸이
 * 생기면 이름이 옆으로 밀리며 표가 들썩인다. 카드 저장소가 아예 없는 환경에서는 자리도
 * 만들지 않는다. 영영 채워지지 않을 빈칸을 두지 않는다.
 *
 * 그림은 세로로 긴 것이 많다(24x48 같은). 칸에 맞춰 늘리지 않고 비율을 지킨다.
 */
export function ItemIcon({ card, size }: ItemIconProps) {
  if (!isCardStoreConfigured()) return null;

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
      {card?.icon ? (
        <img
          // 워커가 자체 도메인 주소를 붙여 주면 그쪽으로 받는다. 워커 요청 한도를 쓰지 않는다.
          src={card.iconUrl ?? iconUrl(card.icon)}
          // 이름이 바로 옆에 있으므로 그림은 꾸밈이다. 화면 읽기 프로그램이 이름을 두 번 읽지 않게 비운다.
          alt=""
          loading="lazy"
          decoding="async"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : null}
    </div>
  );
}
