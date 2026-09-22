import { Alert, Typography } from 'antd';
import { useCanQuery } from '@/lib/settings';

/**
 * 키도 프록시도 없어서 조회 자체가 불가능할 때만 안내한다.
 *
 * 설정 화면을 없앴으므로 방문자가 이 자리에서 할 수 있는 일은 없다. 그래서 행동을
 * 요구하지 않고, 왜 안 되는지와 언제 풀리는지만 알린다. 고칠 수 있는 사람은 운영자다.
 */
export function ApiKeyNotice() {
  const canQuery = useCanQuery();

  if (canQuery) return null;

  return (
    <Alert
      type="warning"
      showIcon
      role="status"
      message="지금은 조회할 수 없습니다"
      description={
        <Typography.Text>
          넥슨 오픈 API 로 나가는 경로가 설정되어 있지 않습니다. 프록시가 다시 연결되면 별도 조작 없이 조회가
          됩니다.
        </Typography.Text>
      }
    />
  );
}
