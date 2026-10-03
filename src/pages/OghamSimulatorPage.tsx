import { Flex, Typography } from 'antd';
import { OghamSimulatorView } from '@/components/ogham/OghamSimulator';

const { Title } = Typography;

/** 오검 워드 옵션 시뮬레이터. */
export function OghamSimulatorPage() {
  return (
    <Flex vertical gap={20} style={{ minWidth: 0 }}>
      <Title level={3} style={{ margin: 0 }}>
        오검 워드 옵션 시뮬레이터
      </Title>
      <OghamSimulatorView />
    </Flex>
  );
}
