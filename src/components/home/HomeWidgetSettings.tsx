import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';

/** 설정에서 홈 화면의 직접 편집 모드로 이동한다. */
export function HomeWidgetSettings({ onOpen }: { onOpen?: () => void }) {
  const navigate = useNavigate();
  return (
    <Button
      onClick={() => {
        navigate('/?editWidgets=1');
        onOpen?.();
      }}
    >
      위젯 편집
    </Button>
  );
}
