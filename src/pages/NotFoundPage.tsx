import { Link } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';
import { Button, Result } from 'antd';

export function NotFoundPage() {
  return (
    <Result
      status="404"
      title="404"
      subTitle="요청한 페이지를 찾을 수 없습니다."
      extra={
        <Link to="/">
          <Button type="primary" icon={<HomeOutlined />}>
            홈으로
          </Button>
        </Link>
      }
    />
  );
}
