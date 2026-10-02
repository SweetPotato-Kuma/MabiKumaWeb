import { Alert, Button } from 'antd';
import { RETRY_MS } from '@/features/bags/useBagSearch';

/**
 * 넥슨이 NPC 상점 데이터를 "준비 중" 이라 답할 때의 안내. 상점이 바뀐 직후 몇 분 동안(에린 하루, 현실 36분마다)
 * 모든 조회가 이렇게 답하고 곧 풀린다. 이때 결과가 비어 보이면 "없다" 로 읽히므로, 없는 것이 아니라 아직 못
 * 받은 것이라고 알리고, 화면은 스스로 다시 받는다.
 */
export function NpcShopNotReady({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Alert
      type="info"
      showIcon
      role="status"
      message="넥슨이 상점 데이터를 준비하는 중입니다"
      description={`상점이 바뀐 직후(현실 36분마다) 몇 분 동안은 ${what} 조회가 되지 않습니다. 없는 것이 아니라 아직 받지 못한 것이고, ${RETRY_MS / 1000}초마다 스스로 다시 받습니다.`}
      action={
        <Button size="small" onClick={onRetry}>
          지금 다시 받기
        </Button>
      }
    />
  );
}
