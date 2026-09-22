import { Link } from 'react-router-dom';
import { SettingOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useCanQuery } from '@/lib/settings';

/** 키도 없고 프록시도 없어서 조회 자체가 불가능할 때만 안내한다. */
export function ApiKeyNotice() {
  const canQuery = useCanQuery();

  if (canQuery) return null;

  return (
    <Alert
      type="warning"
      showIcon
      role="status"
      message="조회하려면 API 키가 필요합니다"
      description="넥슨 오픈 API 키를 설정에서 등록해 주세요. 키는 이 브라우저에만 저장되며 서버로 전송되지 않습니다."
      action={
        <Link to="/settings">
          <Button size="small" icon={<SettingOutlined />}>
            설정 열기
          </Button>
        </Link>
      }
    />
  );
}
