import { Button, Flex, Popover, Typography } from 'antd';
import { erinClock, formatErinClock, formatShopReset, msUntilShopReset } from '@/lib/erinTime';
import { useServerNow } from '@/lib/serverClock';

const { Text } = Typography;

/**
 * 다음 NPC 상점 교체까지 남은 시간. 상점은 에린 자정에 바뀐다. 튼튼한 주머니, 마그 멜 통행증처럼 상점 주기를 따르는
 * 화면이 안내 문구 옆에 같이 쓴다. 1초마다 다시 그려지고, 값은 매번 지금 시각에서 새로 센다.
 */
export function ShopResetCountdown({ prefix = '상점 교체까지' }: { prefix?: string }) {
  const now = useServerNow();
  return (
    <Text type="secondary" className="tnum">
      {prefix} {formatShopReset(msUntilShopReset(now))}
    </Text>
  );
}

/** 에린 시각과 낮밤, 상점 교체까지 남은 시간. 헤더 팝오버와 좁은 화면의 서랍이 같은 내용을 쓴다. */
export function ErinnClockDetail() {
  const now = useServerNow();
  const clock = erinClock(now);
  return (
    <Flex vertical gap={6}>
      <Text className="tnum">
        에린 시각 <Text strong>{formatErinClock(clock)}</Text> ({clock.day ? '낮' : '밤'})
      </Text>
      <Text className="tnum">
        다음 상점 교체까지 <Text strong>{formatShopReset(msUntilShopReset(now))}</Text>
      </Text>
    </Flex>
  );
}

/**
 * 헤더의 에린 시계. 어느 화면에서든 보이고, 누르면 낮밤과 상점 교체까지 남은 시간이 뜬다.
 * 헤더에 붙어 있어 화면을 옮겨도 다시 그려지지 않는다. 시각은 지금 시각에서 매번 새로 세므로 깜빡이거나
 * 처음으로 돌아가지 않는다.
 */
export function ErinnClockButton() {
  const now = useServerNow();
  const clock = erinClock(now);
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title="에린 시간"
      content={
        <div style={{ minWidth: 220 }}>
          <ErinnClockDetail />
        </div>
      }
    >
      <Button type="text" aria-label={`에린 시각 ${formatErinClock(clock)}, 눌러서 자세히 보기`} className="tnum">
        에린 {formatErinClock(clock)}
      </Button>
    </Popover>
  );
}
